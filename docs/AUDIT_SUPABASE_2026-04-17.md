# Auditoría Supabase — BSOP Project
**Fecha:** 2026-04-17 · **Proyecto:** `ybklderteyhuugzfmxbi` (us-east-1, Postgres 17.4.1) · **Tamaño DB:** 170 MB

> Complemento de [`AUDIT_2026-04-16.md`](./AUDIT_2026-04-16.md) (foco repo / código).
> Este documento se centra en la base de datos: schemas, tablas, migraciones, políticas, índices, edge functions y advisors.

---

## 1. Panorama general

El proyecto aloja **tres cargas de trabajo bien diferenciadas** más un residual histórico:

| Dominio | Schemas | Rol | Estado |
|---|---|---|---|
| **BSOP ERP operativo** | `core`, `erp` | Empresas, empleados, tareas, inventario, compras, cortes de caja, documentos | **Activo** — corazón de la app actual |
| **BSOP POS / Waitry** | `rdb` | Ingestión Waitry (pedidos, pagos, productos), conciliación con cortes, inventario derivado | **Activo** — hot path, `rdb.waitry_inbound` es la tabla más grande (55 MB) |
| **Playtomic (padel)** | `playtomic` | Bookings, players, resources, sync log | **Activo** — sync programado vía edge function |
| **Residual / histórico** | `public` | Mezcla: `trip_*` (Splitwise), `health_*` (Apple Health), `usage_*` (tracking AI), `profile`, `user_presence` | **Mixto** — ver §4 |

Hay **5 usuarios en `auth.users`** (3 activos últimos 7 días). La DB tiene **90 migraciones** aplicadas y **3 edge functions** activas: `waitry-webhook`, `sync-cortes`, `playtomic-sync`.

La organización actual por schemas es buena — BSOP quedó bien separado en `core`/`erp`/`rdb` y Playtomic en su propio schema. **El desorden está concentrado en `public`**, que se convirtió en el basurero de experimentos previos.

### ✅ Resuelto el 2026-04-17 (sync-cortes movimientos)

Durante la migración `rdb → erp` del 2026-04-14 se rompió sin avisar el pipeline de movimientos del cron `sync-cortes` (el RPC `rdb.upsert_movimiento` nunca se creó). Del 2026-04-14 al 2026-04-17 la mitad de movimientos de Coda no llegaron a la DB. Fix aplicado en PR `fix/sync-cortes-movimientos-upsert`:

- Nueva función fachada `rdb.upsert_movimiento` que escribe a `erp.movimientos_caja`
- Backfill completo (404 rows → DB exactamente 404 rows, 100% con coda_id y con nombre de cajera)
- Nuevas columnas `erp.movimientos_caja.tipo_detalle` + `realizado_por_nombre`
- Edge functions `sync-cortes` y `waitry-webhook` exportadas al repo (antes vivían solo en dashboard)

---

## 2. Inventario detallado

### 2.1 Tablas y rows (por schema)

| Schema | Tablas | Rows totales | Notas |
|--------|-------:|-------------:|------|
| `public` | 15 | ~100 K | Salud, usage AI, trip_*, profile, user_presence |
| `core` | 8 | ~116 | RBAC + audit_log (0 rows) |
| `erp` | 46 | ~19 K | Operativa multi-empresa |
| `rdb` | 11 | ~47 K | Waitry raw + archivos post-migración |
| `playtomic` | 5 | ~6.7 K | Sync canchas |
| `dilesa` | 0 | 0 | Schema vacío — datos absorbidos en `erp` con `empresa_id` |

**Total: 85 tablas, ~173 K rows.**

### 2.2 Edge functions

| Función | Versión | Status | En repo |
|---------|---------|--------|---------|
| `waitry-webhook` | v18 | ACTIVE | ✅ (exportada 2026-04-17) |
| `sync-cortes` | v5 | ACTIVE | ✅ (exportada 2026-04-17) |
| `playtomic-sync` | v2 | ACTIVE | ✅ |

### 2.3 Extensiones activas

`pg_cron`, `pg_net`, `pgcrypto`, `pg_graphql`, `pg_stat_statements`, `uuid-ossp`, `vault`.

No hay extensiones de performance críticas faltantes — `pg_trgm` y `btree_gin` están disponibles pero sin instalar.

### 2.4 Migraciones (línea temporal)

| Categoría | Count |
|-----------|------:|
| Total aplicadas | 90 |
| Placeholders vacíos (`*_placeholder.sql`) | 13 |
| Archivos en `supabase/migrations_archive_pre_fix/` | 6 |

- `2026-03-25` → `2026-04-08`: base + 13 placeholders que deberían squashearse.
- `2026-04-09`: burst de 30 migraciones consolidando RDB.
- `2026-04-14`: burst de 20 migraciones con schema `erp` + migración de datos.
- `2026-04-15` → `2026-04-17`: cleanup, RH, soft-delete, fix sync-cortes.

---

## 3. Áreas de oportunidad (prioridad alta)

### 🔴 Seguridad — 16 errores y 185 warnings

1. **16 vistas con `SECURITY DEFINER`** — ignoran el RLS del consultante y corren con permisos del creador.
   Afectadas: `rdb.v_*` (12 vistas: `v_cortes_totales`, `v_cortes_lista`, `v_inventario_stock`, `proveedores`, `ordenes_compra`, etc.), `erp.v_empleados_full`, y `playtomic.v_ocupacion_diaria`, `v_revenue_diario`, `v_top_players`.
   **Acción:** recrearlas con `security_invoker = true` (ya lo hiciste en `rdb.v_cortes_productos` — replicar el patrón en todas).

2. **165 policies RLS "always true"** — `USING true WITH CHECK true`. Esto es efectivamente **RLS desactivado**:
   - **`erp` tiene 151** policies permisivas sobre 51 tablas (rol `authenticated`). Si cualquier usuario consigue un JWT autenticado, ve/escribe toda la empresa sin filtro por `empresa_id`. Dado que ya tienes `core.usuarios_empresas`, ese filtro debería estar en las policies.
   - **`public.trip_expenses`, `public.trip_participants`, `public.expense_splits`, `public.trip_share_tokens`** tienen policies abiertas al rol **`anon`** (cualquiera sin login). Además de inseguro, están vacías — candidatas a drop (§4).
   - **4 tablas `*_archive_2026_04_17` en `rdb`** también con policies abiertas — son snapshots, deberían ser read-only.

3. **17 funciones con `search_path` mutable** — vulnerabilidad clásica de secuestro. Están en `core`, `erp`, `rdb`, `playtomic`.
   Fix: `ALTER FUNCTION ... SET search_path = pg_catalog, public`.

4. **Bucket público `adjuntos` permite listar todo** — la policy `adjuntos_read` es demasiado amplia. Considera restringir `SELECT` por prefijo de carpeta (`name LIKE empresa_id || '/%'`).

5. **Postgres 17.4.1.075 con parches pendientes** y **HaveIBeenPwned deshabilitado** en Auth. Ambos son un click en el dashboard.

### 🟡 Performance — 210 hallazgos

1. **8 policies usan `auth.uid()` sin envolver en SELECT** (`auth_rls_initplan`) — se re-evalúan por fila.
   Es el **fix de mayor ROI**: `core.usuarios`, `core.usuarios_empresas`, `core.permisos_usuario_excepcion`, `core.audit_log`, `public.profile` (2 policies), `public.user_presence` (2).
   Reescribir como `(select auth.uid())`.

2. **52 foreign keys sin índice** — principalmente en `erp` (41). Las más críticas porque se consultan por esos FK en la app:
   - `erp.tasks`: `asignado_a`, `asignado_por`, `completado_por`, `creado_por`
   - `erp.citas`: `cliente_id`, `responsable_id`, `creado_por`
   - `erp.facturas.persona_id`, `erp.ordenes_compra_detalle.producto_id`, `erp.ventas_autos.vendedor_id`
   - `core.roles.empresa_id`, `core.usuarios_empresas.empresa_id`

3. **3 índices duplicados** — drop directo:
   - `erp.corte_conteo_denominaciones`: `erp_conteo_corte_id_idx` vs `erp_corte_conteo_corte_id_idx`
   - `rdb.waitry_pagos`: `rdb_waitry_pagos_order_id_idx` vs `waitry_pagos_order_id_idx`
   - `rdb.waitry_pedidos`: `rdb_waitry_pedidos_order_id_idx` vs `waitry_pedidos_order_id_idx`

4. **137 índices sin uso** — higiene de storage/write-amplification (114 en `erp`, 11 en `rdb`, 6 en `playtomic`, 5 en `core`). **No urgente** salvo presión de disco. Muchos son pre-optimizaciones que nunca se materializaron en queries reales.

5. **9 políticas permisivas múltiples en `rdb`** — cada tabla tiene un par `*_select` + `*_write` ambas PERMISSIVE que se evalúan en cada SELECT. Convertir la `_write` a `FOR INSERT/UPDATE/DELETE` específica.

---

## 4. Candidatos a limpieza (datos / objetos sin uso real)

### Borrables con confianza alta

| Objeto | Schema | Filas | Tamaño | Razón |
|---|---|---|---|---|
| `trip_participants` | public | 0 | 32 kB | Experimento Splitwise, nunca tuvo datos, policies abiertas a `anon` |
| `trip_expenses` | public | 0 | 32 kB | ídem |
| `expense_splits` | public | 0 | 72 kB | ídem |
| `trip_share_tokens` | public | 0 | 64 kB | ídem |
| `health_workouts` | public | 0 | 6.6 MB | Apple Health, sin inserts históricos |
| `health_ecg` | public | 0 | 24 kB | ídem |
| `health_medications` | public | 0 | 24 kB | ídem |
| `usage_summary` | public | 0 | 24 kB | Vista/tabla de resumen AI, nunca se pobló |
| `requisiciones_archive_2026_04_17` | rdb | 185 | 88 kB | Migración promovida a `erp` |
| `ordenes_compra_archive_2026_04_17` | rdb | 156 | 88 kB | ídem |
| `proveedores_archive_2026_04_17` | rdb | 61 | 64 kB | ídem |
| `corte_conteo_denominaciones_archive_2026_04_17` | rdb | 0 | 64 kB | ídem |
| `supabase/migrations_archive_pre_fix/` | — | — | — | Migraciones archivadas en el repo |

**Recomendación de proceso:** renombra primero con sufijo `_deprecated_2026_04` y espera 2–4 semanas antes de `DROP`. Así capturas cualquier dependencia escondida en la app o reportes.

### Revisar antes de actuar

| Objeto | Por qué dudar |
|---|---|
| `public.health_metrics` (99,587 filas, 38 MB) | Tiene datos históricos y 107 filas en `health_ingest_log`. ¿Sigue sirviendo? Si el ingest activo es cero, archivar/exportar antes de bajar |
| `public.usage_daily`, `usage_by_model`, `usage_by_provider`, `usage_daily_models`, `usage_messages` | Datos recientes de marzo, pero no parece conectado a BSOP. Confirmar si son del tracking de Claude en otra app |
| `public.profile`, `public.user_presence` | Parecen activas (5 perfiles, presencia multi-user) pero están en `public` en lugar de `core`. Mover a `core.profiles` / `core.user_presence` si quieres orden |
| `erp.*` tablas con 0 filas (ventas_autos, taller_servicio, ventas_inmobiliarias, facturas, cobranza, contratos, cuentas_bancarias, gastos, etc.) | Son el "esqueleto" del ERP multi-giro. No borrar si planeas usarlas. Documentar claramente cuáles son placeholders en `SCHEMA_REF.md` |

---

## 5. Plan de acción por fases

> Integrado en [`ACTION_PLAN_2026-04-17.md`](./ACTION_PLAN_2026-04-17.md) como Sprints 2–4.

### Fase DB-1 — Quick wins seguros (1-2 hrs)

- [ ] `ALTER FUNCTION ... SET search_path = pg_catalog, public` a las 17 funciones.
- [ ] Reescribir las 8 policies `auth.uid()` → `(select auth.uid())`.
- [ ] `DROP INDEX` de los 3 índices duplicados.
- [ ] Actualizar versión Postgres y habilitar HIBP en Auth (desde dashboard).

### Fase DB-2 — Limpieza de residuo (protegida)

- [ ] Migración que renombre las tablas §4 "confianza alta" a sufijo `_deprecated_2026_04`.
- [ ] `DROP` de `public.trip_*` (totalmente legacy e inseguras para `anon`).
- [ ] Borrar `supabase/migrations_archive_pre_fix/` del repo.

### Fase DB-3 — Endurecer RLS (requiere diseño)

- [ ] Reescribir las 151 policies de `erp` para filtrar por `empresa_id` vía `core.usuarios_empresas`. Probablemente requiere un helper (`core.fn_current_empresa_ids()`).
- [ ] Recrear las 16 vistas `SECURITY DEFINER` con `security_invoker = true`.
- [ ] Restringir bucket `adjuntos` por prefijo `empresa_id/`.

### Fase DB-4 — Índices y reorganización

- [ ] Crear índices para las FKs calientes (`erp.tasks.*`, `erp.citas.*`, `erp.facturas.persona_id`).
- [ ] Consolidar policies múltiples permisivas en `rdb`.
- [ ] Evaluar `DROP INDEX` de los 137 no usados (con `CONCURRENTLY`, después de confirmar ausencia con `pg_stat_user_indexes` sostenido 2 semanas).
- [ ] Considerar mover `public.profile` y `public.user_presence` a `core`.

---

## 6. Métricas de referencia

| Métrica | Hoy | Meta Fase DB-1 | Meta Fase DB-4 |
|---------|----:|---------------:|---------------:|
| Advisors ERROR | 16 | 0 | 0 |
| Advisors WARN | 204 | ~180 | <50 |
| Advisors INFO | 192 | 192 | <90 |
| Placeholders | 13 | 13 | 0 |
| Edge fns fuera del repo | ~~2~~ **0** ✅ | 0 | 0 |
| Tablas 0-row sin plan | ~25 | ~25 | <10 |

---

## 7. Para que la plataforma escale a más proyectos

La estructura actual (schemas por dominio funcional) es la correcta. Tres recomendaciones para que siga limpio cuando agregues más apps:

1. **Proyecto nuevo = schema nuevo.** Nunca usar `public`. Ya lo hiciste con `playtomic`; mantén la disciplina.
2. **Funciones helper compartidas en `core`.** `core.fn_set_updated_at`, `core.fn_current_empresa_ids`, etc. Cada schema consume de `core` y aporta su lógica específica.
3. **SCHEMA_REF.md por schema, no global.** Cuando crezca, el archivo actual se vuelve inmanejable. Considera `supabase/docs/schemas/{core,erp,rdb,playtomic}.md` y un índice.

---

## 8. Referencias

- [Database Linter](https://supabase.com/docs/guides/database/database-linter)
- [RLS Performance](https://supabase.com/docs/guides/database/postgres/row-level-security#performance)
- [Security Invoker Views](https://www.postgresql.org/docs/current/sql-createview.html)
- [Edge Functions deployment workflow](https://supabase.com/docs/guides/functions/deploy)
- [SCHEMA_ARCHITECTURE.md](../SCHEMA_ARCHITECTURE.md) — modelo de datos
- [AUDIT_2026-04-16.md](./AUDIT_2026-04-16.md) — audit del repo
- [ACTION_PLAN_2026-04-17.md](./ACTION_PLAN_2026-04-17.md) — plan unificado de sprints
