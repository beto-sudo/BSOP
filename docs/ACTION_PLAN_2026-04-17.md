# Plan de Acción BSOP — 2026-04-17

> Plan unificado derivado de:
> - [`AUDIT_2026-04-16.md`](./AUDIT_2026-04-16.md) — repo / Next.js
> - [`AUDIT_SUPABASE_2026-04-17.md`](./AUDIT_SUPABASE_2026-04-17.md) — base de datos
>
> Este documento organiza el trabajo pendiente en **5 sprints semanales**, cada uno con criterios de salida medibles.
> Actualízalo marcando cada ítem al completarlo.

---

## Resumen de estado

```
Repo:         ~50% del audit original hecho (tooling, types, bootstrap docs, row-actions)
Supabase:     ~0%  (412 advisors abiertos, 2 edge fns fuera del repo)
Seguridad:    crítica — 16 ERRORS en DB + 2 leaks en código (admin email, API key log)
Testing:      crítica — 3 unit + 3 E2E en todo el proyecto
```

**Esfuerzo total estimado**: 5–7 semanas de trabajo focalizado (1 dev) para dejar BSOP en estado "seguro y mantenible".

---

## Sprint 0 — Bleeding fixes (2-3 días)

**Objetivo**: tapar los agujeros de seguridad obvios y limpiar la raíz del repo. Sin refactors.

### Seguridad

- [ ] **S1** — `proxy.ts:94` — reemplazar `email !== 'beto@anorte.com'` por `email !== process.env.ADMIN_BYPASS_EMAIL` (o eliminar la excepción entera si ya no aplica).
- [ ] **S2** — `app/api/welcome-email/route.ts:30` — cambiar `console.log('... found:', resendKey.substring(0, 6) + '...')` por `console.log('... configured')` sin exponer prefijo.
- [ ] **DB-E5** — Activar HaveIBeenPwned en Dashboard Supabase (Auth → Policies → Password Settings).

### Higiene del repo

Mover a `docs/reports/` (o eliminar si no tienen valor):

- [ ] `backfill_report_2026-04-08.md`
- [ ] `backfill_report_manual_2026-04-08.md`
- [ ] `fix_report_rdb_final.md`, `fix_report_rdb_night.md`, `fix_report_rdb_perms_data.md`
- [ ] `migration_phase2_report.md`
- [ ] `validation_report_phase2.md`, `validation_report_phase2_quick.md`
- [ ] **Eliminar**: `caja_prompt.md`, `prompt_oc.md`, `prompt_req.md`, `query_supa.js`

### Edge Functions al repo

- [ ] Descargar código de `waitry-webhook` y `sync-cortes` desde Supabase Dashboard → guardarlos en `supabase/functions/{waitry-webhook,sync-cortes}/index.ts`.
- [ ] Validar que el deploy desde el repo produce el mismo hash que el actual.

### Criterio de salida

- `git grep 'beto@anorte.com'` en código → 0 hits (excepto tests de data seed).
- Raíz del repo solo con docs canónicas + configs.
- `supabase/functions/` con 3 carpetas.
- HaveIBeenPwned activo.

**⏱ 1 PR = 1 día**

---

## Sprint 1 — API hardening (1 semana)

**Objetivo**: validar inputs + rate limit en rutas expuestas + CSP.

### Zod en API routes

Orden de prioridad (por sensibilidad):

- [ ] `app/api/impersonate/route.ts` — schema de query params, validar UUID, validar que el caller sea admin.
- [ ] `app/api/welcome-email/route.ts` — schema del body, validar email, validar empresa_id.
- [ ] `app/api/health/ingest/route.ts` — schema del payload Apple Health (el más complejo; puede ser iterativo).
- [ ] `app/api/juntas/terminar/route.ts` — schema del body.
- [ ] `app/api/usage/*` — schema de query params.

Patrón sugerido en `lib/validation.ts`:

```ts
import { z } from 'zod';

export async function validateRequest<T>(req: Request, schema: z.ZodSchema<T>) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error, status: 400 };
  }
  return { ok: true as const, data: parsed.data };
}
```

### Rate limiting

- [ ] Evaluar `@upstash/ratelimit` vs solución in-memory para dev.
- [ ] Aplicar en `/api/health/ingest` (público con token), `/api/welcome-email` (acción cara), `/api/impersonate` (audit trail).
- [ ] Config: 10 req/min por IP + token. Configurable por env var.

### Security headers

- [ ] `next.config.ts` con `headers()`:
  - `Content-Security-Policy` (definir fuentes permitidas: Supabase, Vercel, Google Fonts).
  - `X-Frame-Options: DENY`.
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Strict-Transport-Security` (Vercel ya lo pone, confirmar).

### Criterio de salida

- 5 rutas API con Zod.
- 3 rutas con rate limit activo.
- `curl -I bsop.io` muestra todos los headers de seguridad.

**⏱ 5 PRs pequeños**

---

## Sprint 2 — DB seguridad crítica (1 semana)

**Objetivo**: llevar advisors ERROR → 0 y resolver la mayor parte de los WARN de seguridad.

### 2.1 Security Definer Views (16)

- [ ] Migración `yyyymmdd_fix_security_definer_views.sql`:
  - Para cada vista afectada, `DROP VIEW ... CASCADE; CREATE VIEW ... WITH (security_invoker = on) AS ...;`
  - Validar que RLS de tablas base aplica como se espera.

Vistas críticas identificadas:
- `playtomic.v_ocupacion_diaria`
- `rdb.v_cortes_lista`, `rdb.v_cortes_totales_*`
- `rdb.v_waitry_pedidos_reversa_sospechosa`
- `erp.v_inventario_*`

### 2.2 Function search_path (17)

- [ ] Migración `yyyymmdd_fix_function_search_path.sql`:
  - Listar con `SELECT proname, pronamespace::regnamespace FROM pg_proc WHERE prosecdef AND NOT prosrc LIKE '%SET search_path%';`
  - `ALTER FUNCTION <schema>.<fn> SET search_path = public, pg_temp;` en cada una.

### 2.3 Storage bucket

- [ ] Actualizar policy de `storage.objects` para `bucket_id = 'adjuntos'`: SELECT solo para el dueño de la `empresa_id` referenciada en metadata.

### Criterio de salida

- `mcp__supabase__get_advisors type=security` ERROR count = 0.
- Reducción de WARN de ~204 → ~180.

**⏱ 1 semana (cuidadoso — son cambios en DB productiva)**

---

## Sprint 3 — DB RLS sweep (1 semana)

**Objetivo**: resolver los 165 `RLS always true` por lote.

### Proceso

1. **Script de clasificación**: generar un CSV con:
   ```
   schema, table, rows, rls_enabled, policies_count, always_true_count, tiene_empresa_id, has_usuario_id
   ```
2. **Triaje**:
   - Tablas **scaffold 0-row con plan futuro** → mantener, marcar `-- TODO: RLS cuando se use`.
   - Tablas **scaffold 0-row sin plan** → `DROP`.
   - Tablas **operativas con datos**: escribir policies por `empresa_id`/usuario.
   - Tablas **read-only** (catálogos): SELECT true, nada en escritura.

### Orden sugerido (mayor impacto primero)

- [ ] `core.*` — 8 tablas, base del RBAC.
- [ ] `erp.*` con datos — 15 tablas (personas, empleados, productos, juntas, tasks, documentos, cortes, etc.).
- [ ] `rdb.waitry_*` — tablas de raw ingestion, decidir visibilidad.
- [ ] `playtomic.*` — 5 tablas.
- [ ] `public.*` — decisión feature-por-feature.
- [ ] `erp.*` scaffold — dropear o proteger.

### Criterio de salida

- ≤10 WARN de `always_true` restantes, todos documentados con comentario `-- INTENTIONAL: ...`.
- `SCHEMA_ARCHITECTURE.md` con una sección "RLS Matrix" actualizada.

**⏱ 1 semana focalizada**

---

## Sprint 4 — DB performance + higiene (1 semana)

**Objetivo**: dejar la DB rápida, sin placeholders y sin scaffolding muerto.

### 4.1 Índices

- [ ] Script que genere los 52 `CREATE INDEX CONCURRENTLY` para FKs sin índice.
- [ ] Ejecutar por batch (5–10 por deploy, observar tiempos).
- [ ] Dropear 3 duplicate indexes.
- [ ] Revisar los 138 unused indexes:
  - `pg_stat_user_indexes` → `idx_scan = 0` durante > 30 días → candidato.
  - Commit por batch de 30.
  - Dejar ~40 que son para reportes ad-hoc (comentar por qué).

### 4.2 Policies de performance

- [ ] Reescribir las 8 policies con `(SELECT auth.uid())` pattern.
- [ ] Consolidar las 9 multiple-permissive en una policy por comando.

### 4.3 Limpieza de tablas / migraciones

- [ ] `DROP`: `rdb.inv_productos`, `rdb.inv_entradas`, `rdb.inv_ajustes` (confirmar 0 referencias).
- [ ] `DROP`: `rdb.corte_conteo_denominaciones_archive_2026_04_17` (vacía).
- [ ] Política de retención de 30 días para `rdb.*_archive_2026_04_17` (cron que dropea tras 2026-05-17).
- [ ] Squash de 13 placeholders → `0001_baseline.sql` con `supabase db dump --schema public,core,erp,rdb,dilesa,playtomic`.
- [ ] `supabase/migrations_archive_pre_fix/` → `docs/historical/migrations-pre-20260409/` o eliminar.
- [ ] Regenerar `supabase/SCHEMA_REF.md` con `npm run` del script existente.

### Criterio de salida

- Total advisors `<50`.
- 0 placeholders en `supabase/migrations/`.
- Tablas huérfanas dropeadas, archive tables con retención escrita.

**⏱ 1 semana**

---

## Sprint 5 — Testing + componentes (2 semanas)

**Objetivo**: coverage 30%+ en lógica crítica y trocear los 3 componentes >400 LOC.

### 5.1 Tests de lógica crítica

- [ ] `lib/permissions.test.ts` — meta: 100% branch coverage.
- [ ] `app/api/impersonate/route.test.ts` — casos admin/no-admin/usuario inexistente.
- [ ] `app/api/health/ingest/route.test.ts` — validación de token + payload malformado.
- [ ] `app/api/welcome-email/route.test.ts` — con/sin API key, email válido/inválido.
- [ ] `lib/supabase-admin.test.ts` — no leaking de service role en cliente.

### 5.2 Refactor de componentes

**`components/app-shell.tsx` (732 LOC)** → `components/layout/app-shell/`:
- [ ] `sidebar.tsx`, `topbar.tsx`, `presence-indicator.tsx`, `user-menu.tsx`.

**`components/health-dashboard-view.tsx` (757 LOC)** → `components/health/`:
- [ ] `metrics-summary.tsx`, `workouts-table.tsx`, `ecg-chart.tsx`, `medications-list.tsx`.

**`components/travel-expense-tracker.tsx` (456 LOC)** → `components/travel/`:
- [ ] `expense-form.tsx`, `expense-list.tsx`, `split-calculator.tsx`.

### 5.3 Dedup permissions

- [ ] Extraer el fetch de permisos de `app/api/impersonate/route.ts:73-125` para que comparta con `lib/permissions.ts`.

### Criterio de salida

- Coverage ≥ 30%.
- Los 3 componentes iniciales < 300 LOC cada uno (con subcomponentes ≤ 200 LOC).
- 0 duplicación de lógica de permisos.

**⏱ 2 semanas**

---

## Sprint 6 — Arquitectura / RSC / módulos reutilizables (2 semanas — opcional, largo plazo)

**Objetivo**: reducir `'use client'` masivo, patrón de módulo reusable RDB/DILESA.

### 6.1 RSC migration

- [ ] Inventario de los 66 `'use client'`:
  - Marcar cuáles son realmente interactivos (forms, hooks con estado).
  - El resto → candidatos a RSC con `<Suspense>` donde haya data fetching.
- [ ] Migrar por módulo, no todo a la vez. Empezar con `app/inicio/` y `app/settings/`.

### 6.2 Patrón de módulo de empresa

**Observación**: `app/rdb/rh/empleados/page.tsx` ≈ `app/dilesa/rh/empleados/page.tsx` ≈ `app/rh/empleados/page.tsx` (tres copias).

Propuesta:
- [ ] Crear `components/modules/rh/empleados-module.tsx` que reciba `empresaId` por prop.
- [ ] Las tres pages colapsan a: `<EmpleadosModule empresaId={...} />`.
- [ ] Repetir con `departamentos`, `puestos`, `tasks`, `juntas`.

### 6.3 Misc

- [ ] Consolidar `components/ui.tsx` en `components/ui/*`.
- [ ] Mover `components/travel-*`, `trip-*`, `health-*` a subcarpetas por dominio (ya empezado con layout/, shared/).
- [ ] `next/font` para Geist.
- [ ] `<img>` → `next/image` donde aplique (logos, avatares).
- [ ] `@next/bundle-analyzer` baseline.

### Criterio de salida

- `'use client'` en ≤ 30 archivos (hoy 66).
- 0 duplicación RDB/DILESA/rh (un solo componente parametrizable por empresa).
- Bundle analyzer integrado + baseline registrado.

**⏱ 2 semanas**

---

## Resumen cronológico

| Sprint | Duración | Foco | Exit criteria principal |
|--------|---------:|------|-------------------------|
| 0 | 2-3 días | Bleeding fixes | 2 leaks resueltos, raíz limpia, edge fns al repo |
| 1 | 1 semana | API hardening | Zod en 5 routes + rate limit + CSP |
| 2 | 1 semana | DB seguridad crítica | 0 advisors ERROR |
| 3 | 1 semana | DB RLS sweep | ≤10 always_true restantes |
| 4 | 1 semana | DB perf + higiene | Advisors <50, 0 placeholders |
| 5 | 2 semanas | Tests + componentes | Coverage 30%+, componentes <300 LOC |
| 6 | 2 semanas (opc) | RSC + módulos | `'use client'` ≤30, dedup RDB/DILESA |

**Total: 7–9 semanas** para llegar al estado "production-grade, maintainable".

---

## Definition of Done (global)

- `npm run lint` sin warnings
- `npm run typecheck` verde
- `npm run test:run` ≥ 60% coverage
- `npm run test:e2e` verde en CI
- `npm run build` sin errores
- `mcp__supabase__get_advisors type=security` ERROR = 0, WARN < 20
- `git grep -i 'api_key\|secret\|password'` sin hits en código
- Todas las API routes validan input con Zod
- Rate limiting en rutas públicas
- 0 `.schema('... as any)` en código (usar tipos generados)
- Edge functions todas en `supabase/functions/`
- `SCHEMA_REF.md` actualizado tras cambios de schema

---

## Cadencia sugerida

- **Daily**: tomar 1–2 ítems del sprint en curso; abrir PR por ítem (≤200 LOC diff).
- **Weekly**: cerrar sprint → actualizar checklists en este archivo → revisar advisors con `get_advisors`.
- **Al final de cada sprint**: tag git `sprint-N` y nota de cambios en el PR final.

---

## Dependencias entre sprints

```
Sprint 0 ──┐
           ├─► Sprint 1 (API hardening) ──► Sprint 5 (tests dependen de API estable)
           │
           └─► Sprint 2 (DB seguridad) ──► Sprint 3 (RLS sweep) ──► Sprint 4 (DB perf)

Sprint 6 requiere: Sprint 1 + Sprint 5 completos (refactor con red de tests).
```

Sprint 2 y Sprint 3 deben ejecutarse en el mismo branch de Supabase (staging) antes de producción.
