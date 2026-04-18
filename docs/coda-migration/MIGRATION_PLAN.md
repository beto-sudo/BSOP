# Coda → BSOP — Plan Maestro de Migración y Rediseño

> **Premisa**: BSOP es nuestra fuente de verdad a futuro. Coda es legacy. El plan no es copiar — es **rediseñar cada módulo con lo aprendido** + automatizar todo lo que se pueda + dejar flexibilidad para cambios futuros.
>
> Ver [`INVENTORY.md`](./INVENTORY.md) para el mapa completo de qué existe dónde.

---

## Principios rectores

1. **Datos sí, estructura no.** Migramos rows. NO reproducimos formularios de captura, tablas espejo, ni views redundantes.
2. **Rediseño por módulo.** Cada módulo pasa por: (a) entender proceso actual en Coda, (b) diseñar mejor versión en BSOP, (c) migrar data, (d) cutover.
3. **Audit trail siempre.** `core.audit_log` registra toda escritura importante (creado/modificado/eliminado, por quién, cuándo).
4. **Multi-empresa primero.** Toda tabla nueva lleva `empresa_id`. RLS force-scope por empresa vía `core.fn_has_empresa()`.
5. **Flexibilidad > replicación.** Si en Coda había 12 versiones de "Catálogo Vehículos Mes-Año", en BSOP es **1 tabla con columna temporal**.
6. **Automatización antes que UI.** Si un flujo se puede cron-schedule, `trigger`-ear o event-drive, preferir sobre que el usuario lo corra a mano.
7. **Incremental y reversible.** Cada módulo = su propio PR + su propio ADR. Nunca "big bang".

---

## Fases (por módulo)

Cada módulo sigue estas 6 fases. Cada una es una PR individual:

### Fase 1 — Deep audit del módulo

**Output**: `docs/coda-migration/<doc>/<modulo>.md` con:

- Tablas fuente (las que contienen datos reales)
- Schema de columnas (tipos, relaciones)
- Row count por tabla
- Flows actuales (cómo se usa: formularios, botones, automations)
- Stakeholders (quién lo usa a diario)
- Pain points actuales
- Propuesta de rediseño para BSOP (schema + UI + automation)

**Duración**: 1 sesión. Sin código.

### Fase 2 — Schema design + ADR

**Output**:

- Migration SQL en `supabase/migrations/YYYYMMDDHHMMSS_<modulo>.sql`
- ADR en `docs/adr/NNNN-<modulo>-schema.md`
- RLS policies con helpers (`core.fn_has_empresa()`, `core.fn_is_admin()`)
- Audit trigger si aplica

**Si la tabla ya existe** en BSOP con estructura correcta: skip esta fase.

### Fase 3 — Sync unidireccional Coda → BSOP (bridge)

**Output**: `supabase/functions/coda-sync-<modulo>/` — edge function que:

- Se conecta a Coda API con `CODA_API_KEY`
- Lee rows de la tabla fuente de Coda
- Upserta en Supabase (idempotente, dedup por `coda_id`)
- Registra en `core.audit_log` con `origen='coda-sync'`
- Schedule: cron cada N minutos (empieza con hora, baja a 15min cuando se pruebe)

Durante esta fase, **Coda sigue siendo source-of-truth**. BSOP es **read-only**.

### Fase 4 — UI BSOP (read-only primero)

**Output**: componente módulo siguiendo el patrón EmpleadosModule/TasksModule

- `components/<area>/<modulo>-module.tsx` con scope=`'empresa'` | `'user-empresas'`
- Pages por empresa bajo `app/<empresa>/<area>/<modulo>/page.tsx`
- Navegación en `app-shell/nav-config.ts`

**Criterio de aceptación**: usuarios pueden ver todos los datos migrados y validar que son correctos.

### Fase 5 — Write-path en BSOP + dual-write

**Output**: mutations en BSOP que escriben a Supabase Y también push a Coda (durante transición)

- Feature flag `COMPAT_CODA_WRITE_<modulo>=true` (default: true)
- Cuando flag está activa: BSOP mutation → Supabase + POST a Coda API
- Cuando flag está inactiva: solo Supabase

Esto mantiene Coda "vivo" temporalmente para stakeholders que lo siguen consultando.

### Fase 6 — Cutover

**Checklist por tabla**:

1. [ ] Sync diff: `SELECT count(*) FROM bsop.X` == rows en Coda.X ± 0
2. [ ] Stakeholders notificados (mínimo 72h aviso)
3. [ ] Apagar cron Coda → BSOP (Fase 3)
4. [ ] Apagar write-back a Coda (flag off)
5. [ ] Coda tabla: agregar watermark en top `⚠️ Migrado a BSOP — read-only desde YYYY-MM-DD`
6. [ ] Backup dump a `docs/coda-migration/<doc>/<modulo>/backup-YYYY-MM-DD.json`
7. [ ] Mantener Coda accesible 60 días como historical reference
8. [ ] ADR update con "status: migrated"

---

## Priorización — orden sugerido

### Tier 1 — Completar módulos en vuelo (rows>0, más UI/flows)

Ya tienen datos migrados y UI inicial. Pulir y cerrar gaps:

| Módulo                              | Empresas              | Gap                                                   |
| ----------------------------------- | --------------------- | ----------------------------------------------------- |
| Empleados / Puestos / Departamentos | DILESA, RDB           | Ya completo. Faltan compensaciones UI.                |
| Tasks + Juntas                      | DILESA, RDB           | Ya completo. Faltan KPIs operativos.                  |
| Cortes de Caja (RDB)                | RDB                   | Ya completo. Falta conteo denominaciones UI.          |
| Requisiciones + OCs                 | RDB (+ DILESA futuro) | Ya completo. Falta flujo de recepciones.              |
| Productos + Inventario              | RDB                   | Ya completo. Falta UI de ajustes manuales + reportes. |

**Duración estimada**: 2-3 sprints paralelos de 1-2 agents c/u.

### Tier 2 — Módulos con estructura lista (tablas 0 rows)

| Módulo                              | Empresa               | Priority | Razón                                      |
| ----------------------------------- | --------------------- | -------- | ------------------------------------------ |
| **Citas (ANSA)**                    | ANSA                  | alta     | Usado a diario en servicio + ventas        |
| **Cuentas + Movimientos bancarios** | DILESA, ANSA, SR      | alta     | Control financiero, reglas duras CLAUDE.md |
| **Gastos**                          | DILESA, ANSA, SR, RDB | alta     | Control financiero                         |
| **Facturas + Pagos provisionales**  | SR Group              | media    | Fiscal, time-sensitive                     |
| **Clientes**                        | DILESA, ANSA          | media    | Prerequisito para ventas                   |
| **Recepciones de OC**               | RDB, DILESA           | media    | Cierra el ciclo de compras                 |
| **Activos + Mantenimiento**         | ANSA, SR Group        | media    | Resguardos automotriz                      |
| **Turnos**                          | RDB                   | baja     | Se puede hardcodear por ahora              |
| **Aprobaciones**                    | Cross-empresa         | baja     | Hasta que haya workflow que lo requiera    |
| **Conteo denominaciones**           | RDB                   | baja     | Feature nueva, no urgente                  |

### Tier 3 — Módulos complejos (schema nuevo, data grande)

| Módulo                                                                            | Doc origen                | Complejidad | Notas                                                                    |
| --------------------------------------------------------------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------ |
| **DILESA Inmobiliario** (proyectos, lotes, ventas, contratos, cobranza)           | DILESA Proyectos + Ventas | alta        | Schema ya existe, falta UI + migración                                   |
| **DILESA Urbanización** (19 sub-módulos civil)                                    | DILESA Urbanización       | MUY alta    | Repensar: agruparlo como "avances de obra por partida" más que 19 tablas |
| **DILESA RUV** (DTUs, INFONAVIT)                                                  | DILESA Proyectos/RUV      | alta        | Dependencia externa (RUV portal), posible scraping                       |
| **DILESA Maquinaria** (equipos, acarreos, combustible, horas)                     | DILESA Maquinaria         | media       | Buen candidato para re-modelar con "recurso + asignación + uso"          |
| **DILESA Construcción** (contratos, contratistas, supervisión, prototipos)        | DILESA Construcción       | media       | Overlap con Proveedores                                                  |
| **DILESA Presupuestos**                                                           | DILESA Presupuestos       | media       | Partidas + Gastos — ya hay tabla gastos                                  |
| **ANSA Automotriz** (vehículos, ventas autos, taller, refacciones)                | ANSA + ANSA Ventas        | alta        | Schema ya existe, falta UI; refacciones tiene overlap con Inventario     |
| **ANSA Competencias + KPIs**                                                      | ANSA RH                   | baja        | Nice-to-have, extiende RH                                                |
| **SR Group Fiscal completo** (declaraciones, budget, flujo, estado de resultados) | SR Group                  | alta        | Muchas tablas relacionadas, oportunidad de unificar                      |

### Tier 4 — Data personal SR

El doc SR Group tiene info personal/familiar (recibos Casa SR, budget 50/30/20). Decidir si migra a BSOP o se queda en Coda como uso personal.

---

## Roadmap sugerido (realista)

Considerando: torneo activo esta semana, 1 operador activo (Beto + Claude), necesidad de no romper producción, ciclos de ~1-2 semanas por módulo grande.

### Abril-Mayo 2026 (4 semanas)

- ✅ Frente 1.1: bulk lint + format (en progreso)
- **Semana 1**: Frente 2 Sprint A (RDB operativos: playtomic, cortes, ventas) + INVENTORY.md de módulos Tier 2
- **Semana 2**: Postgres upgrade (madrugada) + Tier 2: Citas ANSA (Fases 1-3)
- **Semana 3**: Tier 2 Citas ANSA (Fases 4-6) + inicio Cuentas bancarias (Fase 1-2)
- **Semana 4**: Cuentas bancarias (Fases 3-6) + Frente 2 Sprint B (juntas × 3 → JuntasModule)

### Junio 2026 (4 semanas)

- Gastos cross-empresa (Fases 1-6)
- Tier 2: Clientes + Recepciones
- Frente 2 Sprints C y D (documentos × 3, acceso-client)

### Julio-Agosto 2026

- Tier 3: DILESA Inmobiliario (empezando por Proyectos + Lotes)
- SR Group Fiscal (declaraciones + pagos provisionales)
- ANSA Automotriz (empezando por vehículos + ventas)

### Septiembre+

- DILESA Urbanización (rediseñado, no 1-a-1)
- DILESA RUV
- ANSA Competencias/KPIs
- Consolidación + cleanups

---

## Guardrails durante la migración

1. **Nada se borra de Coda** hasta Fase 6 completa + 60 días de gracia.
2. **Dual-write preserva Coda vivo** durante transición (Fase 5).
3. **Feature flags por módulo** para rollback instantáneo.
4. **ADRs obligatorios** para cada schema nuevo — `docs/adr/NNNN-*.md`.
5. **Audit trail en `core.audit_log`** en toda escritura importante.
6. **Tests unitarios** para cada endpoint nuevo (estándar del repo: Vitest).
7. **E2E smoke** para cada módulo (estándar Playwright del repo).
8. **Preview deploy en Vercel** antes de merge a main.
9. **No big-bang cutovers**. Máximo 1 módulo migrando a la vez por empresa.

---

## Tooling común a construir (una vez)

Estos se construyen **una sola vez** y los usan todos los módulos:

### `scripts/coda-diff.ts`

CLI: `npx tsx scripts/coda-diff.ts <doc> <tabla-coda> <tabla-supabase>` → reporta row count diff + sample de diferencias.

### `lib/coda-client.ts`

Wrapper tipado del REST API de Coda con retry + rate-limit handling.

### `supabase/functions/coda-sync-*`

Template reusable: recibe `{ docId, tableId, targetSchema, targetTable, mapping }` y hace el upsert. Fases 3/5.

### Vista `/settings/coda-migration` (dashboard)

- Lista de módulos con status (tier, fase actual, last sync, row diff)
- Health alerts si un sync falla
- Log de cutovers

### `core.audit_log` (ya existe, 0 rows)

Activar escritura en todas las migraciones Tier 2+. Schema:

```
(id, empresa_id, user_id, table_name, record_id, action, old_values, new_values, ip, user_agent, created_at)
```

---

## Riesgos conocidos

| Riesgo                                                        | Mitigación                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Datos inconsistentes en Coda (Tablas "god" con 175+ columnas) | Deep audit (Fase 1) identifica campos clave vs basura; migrar solo lo útil      |
| Flujos manuales que dependen de automations de Coda           | Documentar en Fase 1; reimplementar como cron + edge function                   |
| Stakeholders que resisten el cambio                           | Dual-write (Fase 5) mantiene Coda funcional hasta confianza total               |
| Migrations grandes (e.g., 10k+ rows) pueden tumbar Supabase   | Migrar en batches de 500 con pauses; correr en horarios de bajo tráfico         |
| Coda API rate limit (100 req/min default)                     | Retry con backoff; correr sync en off-peak                                      |
| Pérdida de fórmulas/KPIs                                      | Deep audit las enumera; decidir caso por caso si se traducen o se redistribuyen |

---

## Qué necesito de Beto para empezar

1. **Aprobación de este plan** (o ajustes)
2. **Priorización personal** entre Tier 2: ¿qué módulo te desbloquea más pronto?
3. **Lista de stakeholders por módulo**: quién usa cada cosa en Coda a diario
4. **Pain points actuales** en Coda que NO queremos replicar en BSOP

---

_Versión: 1.0 — 2026-04-18 · Autor: Claude + Beto (audit conjunto)_
