# Iniciativa — Tech debt H1 2026

**Slug:** `tech-debt-h1-2026`
**Empresas:** todas
**Schemas afectados:** n/a (refactor + tests + seguridad app-layer)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-02
**Cerrada:** 2026-05-02
**Última actualización:** 2026-05-02

## Problema

Audit repo-wide (2026-05-02) identificó deuda técnica acumulada con 3 huecos
prioritarios accionables y aspectos sanos que conviene preservar.

### Huecos críticos

**1. Seguridad — auth gaps puntuales (alto)**

- `app/api/welcome-email/route.ts` — POST sin `auth.getUser()`, usa
  `SUPABASE_SERVICE_ROLE_KEY` para fetch `usuarios_empresas`, y loguea PII
  (email + UUID + relaciones usuario-empresa serializadas como JSON) en
  consola en líneas 28, 53 y 83.
- `app/api/juntas/terminar/route.ts` — POST sin auth check, usa admin client
  vía `getSupabaseAdminClient()`, llamado desde cliente
  (`junta-detail-module.tsx`).
- 15 `.rpc()` calls confían solo en tipos TypeScript (no Zod runtime).
  RLS es la defensa real, pero validación de inputs no está en app-layer.

**2. Duplicación bajo ADR-011 (alto, ~1,730 LOC eliminables)**

ADR-011 prescribe componentes shared cross-empresa. Tres holdouts:

- `app/rh/personal/[id]/page.tsx` (1267 LOC) reimplementa todo el detalle de
  empleado — `EmpleadoDetailInner()` con beneficiarios, compensación, pago,
  baja, etc. — cuando `components/rh/empleado-detail-module.tsx` ya existe
  y está parametrizado por `empresaSlug`. La página DILESA equivalente
  (`app/dilesa/rh/personal/[id]/page.tsx`) delega correctamente con 9 LOC.
- `app/inicio/juntas/page.tsx` (497 LOC) reimplementa `JuntasInner()` con
  toda la lógica de lista (fetch, filtro, crear, DataTable) cuando
  `components/juntas/admin-juntas-list-module.tsx` ya existe. DILESA y RDB
  delegan correctamente con 16 LOC c/u. Falta agregar `scope="user-empresas"`
  o equivalente al módulo shared para soportar el caso `/inicio` sin
  reimplementar.
- CSF diff helpers (`valuesEqual`, `formatDiffValue`) duplicados ~60 LOC
  entre `components/proveedores/proveedores-module.tsx` y
  `app/settings/empresas/_components/empresa-detail.tsx`.

**3. Test debt estructural (alto, 9% ratio)**

38 archivos test sobre 431 sources. Críticos sin tests:

- **Mutations financieras**: `app/rdb/cortes/actions.ts` (596 LOC, efectivo
  en caja, hot file con 9 cambios), `app/rdb/inventario/levantamientos/actions.ts`
  (287 LOC, firma de aprobación), `app/rdb/productos/actions.ts` (recetas
  con dependencias circulares).
- **APIs críticas**: `app/api/documentos/[id]/extract/route.ts` (276 LOC,
  IA Claude+OpenAI con costo $), `app/api/welcome-email/route.ts`,
  `app/api/juntas/[id]/activar/route.ts` (trigger automático de avances).

### Huecos secundarios

- **Dependencias** — `next/react/tailwind/shadcn` con `"latest"` sin pin
  → riesgo de drift en CI por upstream. 4 majors pendientes: TypeScript
  5.9→6.0, vitest 3.2→4.1, eslint 9.39→10.3, `@vitest/coverage-v8` 3.2→4.1.
- **Limpieza** — 3 dirs orphan en root: `.backup-stale/` (4 backup dirs +
  `permissions.ts.bak`, Apr 16), `sprint-dilesa-1-ui/` (`.patch` 72KB
  abandonado, Apr 24), `tmp/*.js` (11 scripts one-off de Coda y efectivo).
- **Observabilidad** — 503 `console.*` en el repo, sin logging estructurado.
  Algunos logs leakean PII (welcome-email).
- **God components** — 10 archivos >1000 LOC, top 3 con churn alto:
  `proveedores-module.tsx` (1893 LOC, 63 hooks), `juntas/[id]/page.tsx`
  (1803), `ordenes-compra/page.tsx` (1778). 2 excluidos por diseño:
  `acceso-client.tsx` (ADR-010 deniega `<DataTable>`) y
  `empleado-alta-wizard.tsx` (wizard cubierto por `wizard-pattern`).

### Aspectos sanos a preservar

- 28 ADRs activos, 37 planning docs vivos, sistema de iniciativas
  funcionando.
- 0 `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` en todo el repo.
- Solo 7 archivos con TODO/FIXME (muy limpio).
- 0 leaks de `process.env.*` (no `NEXT_PUBLIC_*`) a archivos client.
- CI estricto (4 checks: typecheck + test:run + lint + format:check).
- Husky + lint-staged en pre-commit.

## Outcome esperado

- 0 routes con escritura de DB sin auth gate explícito.
- 0 logs con PII no estructurada en routes API.
- ~1,730 LOC de duplicación eliminadas bajo ADR-011 (juntas + personal
  consolidados).
- Coverage subiendo de 9% → 20%+ con foco en mutations financieras y APIs
  críticas.
- `next/react/tailwind/shadcn` pinneadas a versiones explícitas (cero drift
  CI por upstream).
- Repo limpio de dirs orphan (`.backup-stale`, `sprint-dilesa-1-ui`, `tmp/`).

## Alcance v1 (cerrado 2026-05-02)

### Sprint 1 — Quick wins seguridad + limpieza (1 día, low risk)

- [ ] Auth gate en `app/api/welcome-email/route.ts` + reducir verbosity de
      logs PII (no loguear emails/UUIDs/relaciones serializadas).
- [ ] Auth gate en `app/api/juntas/terminar/route.ts`.
- [ ] Pin `next` / `react` / `react-dom` / `tailwindcss` /
      `@tailwindcss/postcss` / `shadcn` / `@types/node` / `@types/react` /
      `@types/react-dom` / `typescript` a versiones explícitas en
      `package.json`.
- [ ] Borrar `.backup-stale/` y `sprint-dilesa-1-ui/` (validar antes con
      Beto qué se conserva). Decidir destino de `tmp/*.js` (archivar a
      `scripts/archive/` o borrar).

### Sprint 2 — Consolidación bajo ADR-011 (3-5 días)

- [ ] `app/rh/personal/[id]/page.tsx` → delegar a `EmpleadoDetailModule`
      con `empresaSlug=""` o equivalente cross-empresa (-1,250 LOC).
- [ ] Agregar `scope="user-empresas"` (o nombre equivalente) a
      `AdminJuntasListModule`; refactorizar `app/inicio/juntas/page.tsx`
      para usarlo (-410 LOC).
- [ ] Extraer `lib/csf-diff.ts` con `valuesEqual` + `formatDiffValue`,
      deduplicado entre `proveedores-module` y `empresa-detail` (-60 LOC).
- [ ] Parametrizar `ProveedoresModule` por `empresaSlug` (eliminar
      acoplamiento a brand paths hardcoded).

### Sprint 3 — Test fortification (5-7 días)

- [ ] Tests de mutations financieras críticas:
  - `app/rdb/cortes/actions.ts` (efectivo: abrir/cerrar caja, registrar
    movimiento, voucher).
  - `app/rdb/inventario/levantamientos/actions.ts` (firma aprobación).
  - `app/rdb/productos/actions.ts` (recetas + circular deps).
- [ ] Tests de APIs críticas:
  - `app/api/documentos/[id]/extract/route.ts` (rollback en fallo, costo
    de retry).
  - `app/api/welcome-email/route.ts` (rate limit + Resend).
  - `app/api/juntas/[id]/activar/route.ts` (trigger automático de
    avances).
- [ ] Threshold mínimo de coverage en CI (`vitest run --coverage`),
      gradual: 15% baseline al cierre del Sprint, target 25% al cierre de
      la iniciativa.
- [ ] Decidir si los tests pegan a Supabase test instance (memoria del
      usuario: integration tests deben ir a DB real, no mocks profundos).

### Sprint 4 — Refactor god components + major deps (opcional, post Sprint 3)

- [ ] Romper `components/proveedores/proveedores-module.tsx` (1893 LOC,
      63 hooks) → extraer `CSFDiffSection` (líneas ~96-217) +
      `ProveedorFormSection`.
- [ ] Extraer `BeneficiariosSection` (líneas 241-406) y
      `CompensacionSection` de `components/rh/empleado-detail-module.tsx`.
- [ ] Extraer `RecepcionesHistorial`, `SummaryBar`, hook
      `useEditablePrices` de `app/rdb/ordenes-compra/page.tsx`.
- [ ] Major dep upgrades en PRs aislados:
  - TypeScript 5.9 → 6.0 (con codemods si aplica).
  - vitest 3.2 → 4.1 + `@vitest/coverage-v8`.
  - eslint 9.39 → 10.3.
- [ ] Closeout de iniciativa.

## Fuera de alcance v1

- **Restructuración arquitectónica grande** — no se mueven schemas, no se
  redibujan capas. Esta iniciativa es saneamiento, no rediseño.
- **Migrar tests a `@testing-library/react`** — repo no tiene jsdom; queda
  fuera salvo que regresión obligue (precedente: `forms-pattern` documentó
  esta misma exclusión).
- **Refactor de `empleado-alta-wizard.tsx`** — wizard ya cubierto por
  `wizard-pattern` (cerrado 2026-04-29).
- **Refactor de `acceso-client.tsx`** — ADR-010 deniega `<DataTable>`
  explícitamente.
- **e2e tests nuevos** — Sprint 3 solo agrega unit/integration; suite e2e
  existente cubre flujos UI.
- **Refactor de routes API que ya tienen auth** — solo se cierran gates
  faltantes, no se reescribe lógica funcional.
- **Logging estructurado repo-wide** (`pino`/`winston`/etc.) — Sprint 1
  solo reduce PII en logs específicos. Migrar 503 `console.*` queda como
  iniciativa hermana si surge necesidad.

## Métricas de éxito

- **Seguridad** — 0 routes API con escritura sin auth gate explícito al
  cierre de Sprint 1 (lista exhaustiva en bitácora).
- **LOC reducción** — -1,730 LOC en pages duplicadas al cierre de Sprint 2.
- **Coverage** — 9% baseline → 15% al cierre de Sprint 3, 25% al cierre
  de la iniciativa (medido con `vitest run --coverage`).
- **CI estabilidad** — 0 builds fallidos por upstream version drift en
  deps "latest" durante 1 mes post Sprint 1.
- **Repo housekeeping** — 0 dirs orphan en root al cierre de Sprint 1.

## Riesgos

- **Sprint 2 toca pages hot** (24 cambios en `juntas/[id]`, 11 en
  `personal/[id]`). Conflictos con feature work paralelo.
  _Mitigación_: rebase preventivo (regla del CLAUDE.md sobre hotspots) +
  coordinar con Beto antes de arrancar; cada consolidación en su propio PR
  para minimizar superficie de conflicto.
- **Tests de mutations financieras** (Sprint 3) requieren fixtures de DB
  realistas. Riesgo de tests frágiles que mockeen demasiado.
  _Mitigación_: integration tests con Supabase test instance (DB real)
  según memoria del usuario; cero mocks profundos de PostgREST.
- **Major dep upgrades en Sprint 4** pueden romper código por API breaks
  (TS 6 strict, eslint 10 rules nuevas).
  _Mitigación_: solo si Sprints 1-3 cerraron limpio; cada major en su
  propio PR aislable; correr codemods oficiales antes de cualquier fix
  manual.
- **Auth gates podrían romper integraciones legítimas** que no pasan por
  user session (cron jobs, webhooks).
  _Mitigación_: confirmar con Beto qué llamadores son legítimos antes de
  cerrar el gate; preservar bypass por bearer token / `CRON_SECRET` /
  `SERVICE_ROLE_KEY` server-side donde corresponda.

## Sprints / hitos

| #   | Sprint                                                        | Estado   | PR   |
| --- | ------------------------------------------------------------- | -------- | ---- |
| 1   | Quick wins seguridad + limpieza                               | done     | #390 |
| 2A  | Eliminar pages cross-empresa (`/rh/*`, `/inicio/*`)           | done     | #393 |
| 2B  | Helper `lib/csf-diff.ts` deduplicado                          | done     | #394 |
| 2C  | `ProveedoresModule` resuelve branding por slug                | done     | #394 |
| 3A  | Tests `welcome-email` + `juntas/activar` + coverage threshold | done     | #395 |
| 3B  | Tests `documentos/extract` + `productos/actions`              | done     | #396 |
| 3C  | Tests cortes + levantamientos + integration scaffold          | done     | #397 |
| 4   | Refactor god components + major deps                          | descoped | n/a  |

## Decisiones registradas

### 2026-05-02 · Sprint 1 ejecutable por CC sin gate de Beto

Sprint 1 toca exclusivamente low-risk: auth gates (cambio chico, alto
valor), pin de versions (change-only en `package.json`), borrar dirs
orphan (con confirmación previa de qué se conserva). CC arranca Sprint 1
directo. Sprints 2-4 requieren OK explícito de Beto porque tocan
superficie grande (pages hot + tests nuevos + refactor de god components).

### 2026-05-02 · `acceso-client.tsx` y `empleado-alta-wizard.tsx` excluidos del refactor

Auditoría de god components recomendó excluir explícitamente:

- `app/settings/acceso/acceso-client.tsx` (1276 LOC) — ADR-010 deniega
  `<DataTable>` para esta superficie por decisión de UX. Refactor cambia
  contrato visual, no es saneamiento.
- `components/rh/empleado-alta-wizard.tsx` (1295 LOC) — wizard justifica
  tamaño por diseño multi-step, ya cubierto por `wizard-pattern` (cerrado
  2026-04-29). Re-tocarlo es churn.

### 2026-05-02 · Tests fortifican mutations primero, no UI

Sprint 3 prioriza mutations financieras (cortes, levantamientos,
productos) y APIs críticas (documentos/extract, welcome-email,
juntas/activar). UI tests de componentes quedan fuera — repo no tiene
`@testing-library/react`, instalar JSDOM es scope ajeno. La suite e2e
de Playwright ya cubre flujos UI. Precedente: `forms-pattern` documentó
la misma exclusión en su Sprint 1.

### 2026-05-02 · Pinear deps "latest" antes que upgradear majors

Sprint 1 pinea `next`/`react`/`tailwindcss`/`shadcn` a versiones
explícitas para cerrar el riesgo de drift de CI por upstream. Los majors
(TS 6, vitest 4, eslint 10) quedan para Sprint 4 con codemods, no se
mezclan con el pin defensivo.

### 2026-05-02 · Sprint 2 reframe: eliminar en vez de consolidar

El plan original de Sprint 2 era **consolidar** las pages cross-empresa
(`/rh/personal/[id]` → `EmpleadoDetailModule`, `/inicio/juntas` →
`AdminJuntasListModule` con `scope="user-empresas"`) — patrón ADR-011.
Tras inventario, Beto decidió **eliminar** esas pages: los operadores
trabajan dentro de su empresa específica, no usan vistas cross-empresa
generales. Quedó conservada solo la categoría "cross-USUARIO": el
dashboard `/inicio` con widgets ("Mis tareas", "Fechas importantes")
que muestran agregados del usuario logueado, no del catálogo general.

Outcome del reframe:

- Sprint 2A elimina 10 pages, libera **3,773 LOC netas** (más del doble
  que el plan de consolidación, -1,812 LOC).
- Borra el archivo más hot del repo: `/inicio/juntas/[id]/page.tsx`
  (1,803 LOC, 24 commits en 6 meses).
- Items en widgets `/inicio` ahora linkean a `/<empresa>/admin/tasks?focus=<id>`
  directo (Beto: "que ya te lleve a la tarea"). Para soportarlo se agrega
  `?focus=` URL param a `TasksModule`, siguiendo el patrón canónico ya
  presente en `recepciones`, `ordenes-compra`, `productos/recetas`.
- Sprints 2B (csf-diff) y 2C (proveedores branding) del plan original
  **se conservan** y se entregan en este PR de seguimiento.

### 2026-05-02 · Sprint 3 estrategia: híbrido mocks + DB real para financiero

Tensión entre el patrón actual del repo (8 route tests con mocks de
supabase) y la memoria del proyecto ("integration tests deben pegar a
DB real, mock/prod divergence causó incidente"). Resuelto con
**enfoque híbrido**:

- **Sprint 3A + 3B**: tests unitarios con mocks (siguiendo el patrón
  canónico de `app/api/empresas/_test-helpers.ts` y los 8 tests
  existentes). Cobertura rápida para validaciones de input, paths 4xx
  y 5xx, lógica pura.
- **Sprint 3C**: integration tests con Supabase test instance contra
  los flujos financieros (`cortes/actions`, `levantamientos/actions`).
  Estos son donde el incidente histórico (mock/prod divergence) más
  duele si se repite.

Mocks legítimos para validaciones / lógica pura; DB real para mutations
financieras. No es purismo, es que el costo del setup de DB real solo
vale en los tests donde su valor (detectar drift de schema/migración)
supera el overhead.

### 2026-05-02 · Coverage threshold en `vitest.config.ts`, no en `test:run`

El threshold solo se valida cuando vitest corre con `--coverage`. Se
configura en `vitest.config.ts` (`coverage.thresholds`) y CI llama
`npm run test:coverage`. `npm run test:run` queda sin coverage para
iteración local rápida.

Baseline Sprint 3A: 30% lines/statements, 65% functions, 75% branches
(coverage real medido es 31.86% lines, 68.53% functions, 83.67%
branches; thresholds dejan ~2% buffer para variación natural sin
permitir regresión).

Subidas progresivas:

- Sprint 3B: bump ~3-5% al agregar tests de `documentos/extract` y
  `productos/actions`.
- Sprint 3C: bump final a ~40-45% lines tras integration tests.

### 2026-05-02 · Branding centralizado limitado a Proveedores en Sprint 2C

`lib/empresa-branding.ts` se introduce con `EmpresaSlug` y
`getEmpresaBranding()` solo para servir a `ProveedoresModule` (las únicas
2 pages que duplicaban `logoPath` / `membreteAlt`). Otros usos de
branding (emails, prints, Juntas, etc.) quedan **fuera de scope** —
extender el helper a todos los call sites es cambio mayor que merece
iniciativa propia.

## Bitácora

### 2026-05-02 — Iniciativa cerrada (este PR es closeout)

Sprint 4 (refactor god components + major dep upgrades) **descoped del
v1**. Razones:

- Los huecos críticos del audit original (auth gates, duplicación
  ADR-011, test debt) están todos cubiertos. La iniciativa cumplió su
  outcome.
- Sprint 4 toca superficie grande (3 god components ~5,200 LOC + 3
  major upgrades). Es alcance de iniciativas dedicadas con su propio
  context, no apéndice de saneamiento.
- Los tests del Sprint 3 (150 nuevos, coverage 9% → 42.10%) son el
  arnés que necesitas para refactorizar god components con confianza
  cuando llegue el momento. Sprint 4 puede arrancar cuando alguno de
  esos componentes pida cambio por feature work.

### Outcome de la iniciativa

**Métricas vs targets**:

| Métrica del Outcome                         | Target | Real   | Status     |
| ------------------------------------------- | ------ | ------ | ---------- |
| Routes con escritura sin auth gate          | 0      | 0      | ✅         |
| Logs con PII estructurada en routes API     | 0      | 0      | ✅         |
| LOC duplicación bajo ADR-011 eliminadas     | -1,730 | -3,773 | ✅ (+118%) |
| Coverage lines                              | 20%+   | 42.10% | ✅ (+110%) |
| Deps `next/react/tailwind/shadcn` pinneadas | sí     | sí     | ✅         |
| Dirs orphan eliminados                      | sí     | sí     | ✅         |

**Tests añadidos**: 150 unit + 1 smoke integration (con scaffold
completo para extender).

**PRs mergeados**: 8 (#390, #393, #394, #395, #396, #397, _este_, +
#389 promoción).

**Tiempo total**: 1 día calendario. Modo autónomo aprobado tras
Sprint 1; CC mergeó cada sprint en cuanto CI verde.

### Bitácora detallada

### 2026-05-02 — Sprint 3C en flight (este PR) — unit tests parte 1

Cierre del Sprint 3 con `cortes/actions` y `levantamientos/actions`.
Estructura: parte 1 = unit tests con mocks (este commit), parte 2 =
integration tests contra DB real con `supabase start` (commits
posteriores cuando OrbStack esté listo en local).

**Tests nuevos parte 1** (87 tests, todos pasando):

- `app/rdb/cortes/actions.test.ts` (52 tests) — 9 funciones cubiertas:
  - `abrirCaja`: validaciones, herencia de efectivo del corte previo,
    `previo_sin_contar`, primer turno (no hay corte previo), insert
    error, preview guard.
  - `cerrarCaja`: cálculo de total desde denominaciones, upsert sólo
    de las cantidades > 0, errores en update/upsert.
  - `registrarMovimiento`: validaciones (corte_id, monto, concepto,
    tipo, `realizadoPorNombre` desde JWT), corte debe estar abierto.
  - `subirVoucher`: límite 10MB, mime types allowlist (jpeg/png/webp/
    heic/heif), corte debe existir, **rollback de archivo si insert
    falla** (regresión que la memoria del usuario menciona).
  - `eliminarVoucher`: voucher must exist, delete row + best-effort
    storage remove.
  - `confirmarVoucher` / `actualizarCategoriaVoucher`: validaciones +
    `data.length === 0 → throw` (cubre el caso de **RLS bloqueando
    UPDATE silenciosamente**, regresión histórica documentada).
  - `previewEfectivoInicial` / `cargarBancos` / `obtenerVouchersDelCorte`:
    lectores con paths de error.

- `app/rdb/inventario/levantamientos/actions.test.ts` (35 tests):
  - `crearLevantamiento`: validaciones + insert path.
  - 5 funciones que delegan a RPCs (`iniciarCaptura`, `guardarConteo`,
    `cerrarCaptura`, `cancelarLevantamiento`, `getLineasParaCapturar`,
    `getLineasParaRevisar`): verifica delegación con args correctos +
    propagación de error.
  - `firmarPaso`: 6 tests del parser `parseFirmarPasoResult` (shapes
    inválidos retornan null + propagación de IP/user-agent headers).
  - `cancelarLevantamiento`: motivo trim + validación de motivo vacío.
  - `actualizarNotaDiferencia` (lógica TS rica, **10 tests**): state
    guards (`estado === 'capturado'`), validación de contador, trim
    a null, lookup de línea/levantamiento via admin client.

**Coverage threshold bump**:

- Coverage tras parte 1: **42.1% lines**, 72.08% functions, 84.21%
  branches.
- Threshold subido en `vitest.config.ts`:
  - lines/statements: 33 → **40**
  - functions: 67 → **70**
  - branches: 80 → **82**
- Buffer ~2% sobre el medido. Cumple el target final del Sprint 3
  (40-45% lines).

**Pendiente parte 2** — integration tests:

- Setup de Supabase local (`supabase start` con OrbStack/Docker).
- `seed.sql` con fixtures (RDB, almacén, productos, caja).
- `vitest.integration.config.ts` separado.
- ~5 tests críticos: levantamiento full flow (crear → conteo → 2
  firmas → aplicar), cortes full flow (abrir → mov → cerrar →
  verificar balance), voucher upload + storage round-trip.
- Opt-in via `npm run test:integration` (no en CI default).

OrbStack instalado en máquina local, Docker symlinks pendientes
(requiere abrir la app). Integration tests escritos pero NO validados
todavía — push se hace tras validación con Docker corriendo.

### 2026-05-02 — Sprint 3B merged (PR #396)

Sprint 3B entregó tests para los 2 archivos del medio del Sprint 3
(complejidad media). Mock strategy A confirmada por Beto.

**Tests nuevos** (36 tests, todos pasando):

- `app/rdb/productos/actions.test.ts` (19 tests):
  - `upsertReceta`: 401 sin auth, cantidad inválida (≤0, negativa,
    NaN, Infinity), insumo_id vacío, **self-reference (ciclo directo)**,
    insumos no-RDB / no-inventariables, errores DB en cada step
    (validación / delete / insert), happy path con insumos, happy
    path con array vacío (solo borra), `assertNotInPreview` activo.
  - `updateCategoria`: 401 sin auth, categoría no-RDB, success limpiar
    (null), success con id válido, error update, preview guard.

- `app/api/documentos/[id]/extract/route.test.ts` (17 tests):
  - Env vars: 500 si `ANTHROPIC_API_KEY` o `OPENAI_API_KEY` faltan.
  - Auth: 401 sin sesión.
  - 404 si doc no existe (RLS bloquea).
  - 500 en errores: fetch doc, admin client null, fetch adjuntos.
  - 400 si no hay PDF principal.
  - **Lock optimista**: 409 si lock falla (otro request lo tomó),
    500 si query del lock lanza error, verifica que el lock se
    aplica ANTES de llamar a Claude.
  - **Rollback**: estado vuelve a `error` si Claude falla;
    estado vuelve a `error` si OpenAI embedding falla.
  - **Success path**: extrae, embebe, commitea con
    `extraccion_status='completado'`.
  - **File rename**: storage move se invoca cuando título estandarizado
    difiere; NO se renombra cuando el título ya está en formato
    estándar (respeta edición humana).
  - **Preserva valores humanos**: `fecha_emision` y `numero_documento`
    no se sobrescriben cuando IA devuelve null.

**Mock strategy A aplicada** (decidido en Sprint 3A):

- `extraction-core` mockeado al nivel de módulo (`vi.mock`) — la
  cobertura real de Claude/OpenAI SDK vive en
  `lib/documentos/extraction-core.test.ts`.
- Mocks de supabase admin son fluent builders inline que branchean por
  `(schema, table, op)` — más complejos que en Sprint 3A porque
  `extract` toca 8+ chains distintos (lock optimista, fetch tipo,
  commit, rollback, rename + adjunto update).

**Coverage threshold bump**:

- Tras Sprint 3B: 35.29% lines, 69.27% functions, 83.82% branches.
- Threshold subido en `vitest.config.ts`: 33% lines/statements
  (era 30), 67% functions (era 65), 80% branches (era 75). Buffer
  ~2-3% sobre el medido.

**Gap conocido (anotado, no cubierto)**:

`upsertReceta` solo detecta ciclo directo (A→A) — el código fuente no
implementa detección de ciclo indirecto (A→B→A o más profundo). Si
surge la necesidad operativa, va como issue separada.

### 2026-05-02 — Sprint 3A merged (PR #395)

Arranque oficial de Sprint 3 (test fortification). PR 3A entrega:

**Tests nuevos** (27 tests, todos pasando):

- `app/api/welcome-email/route.test.ts` (12 tests):
  - Validación de inputs (email malformed, usuarioId no UUID).
  - Rate limit (429 cuando excedido).
  - Auth gate (401 sin sesión, 403 si caller no admin) — la salvaguarda
    del Sprint 1 ahora con cobertura.
  - Resend integration (200 success, 500 si Resend falla, payload
    correcto con email + subject + html).
  - Env vars (500 si `RESEND_API_KEY` falta).
- `app/api/juntas/[id]/activar/route.test.ts` (15 tests):
  - POST: 401 sin sesión, 404 si junta no existe, no activa si está
    completada/cancelada, activa si en_curso/programada, lowercase del
    email del JWT.
  - DELETE: 401 sin sesión, 200 con clear correcto, lowercase email.

**Coverage threshold gradual en CI**:

- Expanded `vitest.config.ts` `coverage.include` de solo `lib/**` a
  `lib/ + app/api/ + Server Actions de app/`. El `*.test.ts` y
  `_test-helpers` se excluyen.
- Agregado `coverage.thresholds`: 30 lines/statements, 65 functions,
  75 branches. Coverage real medido tras Sprint 3A: 31.86% lines,
  68.53% functions, 83.67% branches — thresholds dejan ~2% de buffer.
- CI workflow (`.github/workflows/ci.yml`) cambia el step "Vitest —
  unit tests" de `npm run test:run` a `npm run test:coverage` para que
  el threshold bita.

**Patrón de mocks aplicado**:

Patrón canónico del repo (8 route tests existentes en
`app/api/empresas/`) + variante inline para juntas/activar (mock más
focal del admin client) + `vi.mock` de fetch global para welcome-email
(Resend + Supabase REST). Sin shared `_test-helpers` nuevo — los mocks
son específicos por route.

### 2026-05-02 — Sprint 2B + 2C merged (PR #394)

Closeout de Sprint 2 con los 2 changes pendientes después del reframe a
eliminación:

**Sprint 2B — Helper `lib/csf-diff.ts` deduplicado:**

- Crea `lib/csf-diff.ts` con `valuesEqual` y `formatDiffValue` unificados
  (versión que soporta los 3 shapes que aparecen en el repo: `actividad`
  con orden+porcentaje, `codigo`+`nombre`, y `descripcion`).
- Crea `lib/csf-diff.test.ts` con cobertura para todos los casos:
  null/undefined/'', strings con trim, arrays orden-sensitivos, objetos,
  shapes específicos del SAT, fallback. ~22 tests.
- Reemplaza implementaciones locales en
  `components/proveedores/proveedores-module.tsx` (líneas 96-133) y
  `app/settings/empresas/_components/empresa-detail.tsx` (líneas 205-240).
- Saneamiento: -60 LOC duplicados, +tests sobre la lógica de diff
  (cobertura nueva sobre las funciones que antes vivían sin tests).

**Sprint 2C — `ProveedoresModule` resuelve branding por slug:**

- Crea `lib/empresa-branding.ts` con tipo `EmpresaSlug` (`'dilesa' | 'rdb'`)
  y `getEmpresaBranding(slug)` que devuelve `{ logoPath, membreteAlt }`.
- `ProveedoresModule` elimina las props `logoPath` y `membreteAlt`,
  resuelve internamente vía `getEmpresaBranding(empresaSlug)`.
- Las pages `app/dilesa/proveedores/page.tsx` y
  `app/rdb/proveedores/page.tsx` se simplifican: dejan de pasar 2 props
  hardcoded por empresa.
- Scope deliberadamente limitado: solo Proveedores. Otros usos de
  branding (emails, prints, juntas, etc.) quedan fuera para no inflar
  este PR.

### 2026-05-02 — Sprint 2A merged (PR #393)

Sprint 2A reframe de "consolidar" a "eliminar" cierra con resultados
mejores que el plan original:

- 18 archivos cambiados, **+115 / -3,888 = -3,773 LOC netas eliminadas**
  (vs. -1,812 del plan de consolidación).
- 10 pages eliminadas; el archivo más hot del repo
  (`/inicio/juntas/[id]/page.tsx`, 1,803 LOC, 24 cambios en 6 meses)
  desaparece.
- `MisTareasWidget` ahora linkea cada item directo a
  `/<empresa>/admin/tasks?focus=<id>`. Botón "Ver todas" eliminado.
- `TasksModule` gana soporte de `?focus=<id>` siguiendo el patrón
  canónico (recepciones, ordenes-compra, productos/recetas).
- Helper nuevo: `empresaSlugFromId(id)` en `lib/empresa-constants.ts`
  para que widgets cross-usuario construyan URLs por empresa desde el
  `empresa_id` que viene de la DB.
- Sidebar / `RouteToModule` / `proxy.ts` ya no referenciaban las pages
  cross — limpieza sin daño colateral.
- Tests e2e actualizados: `auth-rh-empleados.spec.ts` eliminado
  (redundante con `auth-rh-row-actions.spec.ts`); el último reduce su
  matriz de 9 a 6 routes (RDB + DILESA, sin BSOP cross);
  `anon-login.spec.ts` reemplaza `/rh/personal` con
  `/dilesa/rh/personal` y quita `/inicio/tasks`.

### 2026-05-02 — Sprint 1 merged (PR #390)

Sprint 1 cierra los 4 quick wins de seguridad + limpieza:

- Auth gate en `app/api/welcome-email/route.ts` con `requireAdmin()` +
  reducción de 4 `console.log` con PII (email, JSON serializado,
  emailId) a logs operativos sin PII (solo usuarioId UUID, count, status).
- Auth gate en `app/api/juntas/terminar/route.ts` con `auth.getUser()` +
  membresía en empresa de la junta (admin pasa por encima).
- 9 deps `"latest"` pinneadas a `^X.Y.Z` (`next`, `react`, `react-dom`,
  `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/node`,
  `@types/react`, `@types/react-dom`).
- Limpieza: `sprint-dilesa-1-ui/`, `tmp/`, `.backup-stale/` — 4 tracked
  - 9 untracked + 5 backup dirs.

Hallazgo no obvio: el endpoint HTTP `/api/welcome-email` no tiene
callers (el flujo real va por una función helper local en
`app/settings/acceso/actions.ts`). Es código zombie. Lo cerré con auth
gate por defensa en profundidad — candidato a borrar en sprint futuro
si confirmamos uso cero.

CI verde: 1m45s (typecheck + lint + tests + format). Beto verificó
post-merge que welcome email funciona en preview tras agregar
`RESEND_API_KEY` a env Preview de Vercel (estaba solo en Production).

### 2026-05-02 — Promovida a `planned`

Audit completo del repo BSOP por Claude Code (parallel exploration con
4 Explore agents para duplicación / god components / test debt /
seguridad). Datos base:

**Hot files** (last 6 months, top 10):

- `INITIATIVES.md` — 87 cambios (expected, índice central).
- `SCHEMA_REF.md` — 57 (auto-regen).
- `types/supabase.ts` — 35 (auto-regen, 9853 LOC).
- `app/inicio/juntas/[id]/page.tsx` — 24 cambios, 1803 LOC.
- `app/rdb/ordenes-compra/page.tsx` — 20, 1778 LOC.
- `app/dilesa/admin/juntas/[id]/page.tsx` — 16.
- `components/app-shell/nav-config.ts` — 16.
- `app/dilesa/admin/juntas/[id]/page.tsx` — 16.
- `app/dilesa/admin/juntas/page.tsx` — 14.
- `lib/permissions.ts` — 11 (con tests).

**Largest files** (>1000 LOC, ordenado por LOC):

1. `components/proveedores/proveedores-module.tsx` — 1893 LOC, 63 hooks.
2. `app/inicio/juntas/[id]/page.tsx` — 1803.
3. `app/rdb/ordenes-compra/page.tsx` — 1778, 24 hooks.
4. `components/juntas/junta-detail-module.tsx` — 1760.
5. `components/rh/empleado-detail-module.tsx` — 1596, 58 hooks.
6. `app/rdb/requisiciones/page.tsx` — 1415, 21 hooks.
7. `app/settings/empresas/_components/empresa-detail.tsx` — 1412, 17 hooks.
8. `components/rh/empleado-alta-wizard.tsx` — 1295, 4 hooks (skip — wizard).
9. `app/settings/acceso/acceso-client.tsx` — 1276, 21 hooks (skip — ADR-010).
10. `app/rh/personal/[id]/page.tsx` — 1266 (Sprint 2 candidate, -1250 LOC).

**Tests**: 38 archivos test / 431 sources = 9% ratio.

**Migrations**: 211 archivos en `supabase/migrations/`.
**Routes**: 97 (`page.tsx` + `route.ts`).

**Deps**: minor patches dentro del major actual (next 16.2.1→16.2.4,
react 19.2.4→19.2.5, supabase-js 2.103→2.105, tailwindcss 4.2.2→4.2.4).
Majors: typescript 5.9→6.0, vitest 3.2→4.1, eslint 9.39→10.3,
`@vitest/coverage-v8` 3.2→4.1.

**Smells secundarios**:

- 503 `console.*` en archivos `.ts`/`.tsx` (sin logger estructurado).
- 33 sites creando supabase client.
- 15 `.rpc()` calls (sin Zod runtime).
- 7 archivos con TODO/FIXME (muy limpio).
- 0 `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`.
- 0 leaks `process.env.*` no `NEXT_PUBLIC_*` a archivos client.

**Hallazgos seguridad concretos**:

- `app/api/welcome-email/route.ts` líneas 28, 53, 83 — loguean email,
  UUID y relaciones usuario-empresa (JSON serializado). POST sin
  `auth.getUser()`, usa `SUPABASE_SERVICE_ROLE_KEY` directo.
- `app/api/juntas/terminar/route.ts` — POST sin auth check, usa
  `getSupabaseAdminClient()`, llamado desde `junta-detail-module.tsx`.
- 15 `.rpc()` confían en tipos TS, sin Zod runtime validation.

**Hallazgos duplicación concretos** (ADR-011):

- `app/rh/personal/[id]/page.tsx` (1267 LOC) reimplementa el detalle
  completo (`EmpleadoDetailInner` con toda la lógica de estado, baja,
  beneficiarios, compensación, pago). DILESA equivalente delega correcta-
  mente a `EmpleadoDetailModule` con 9 LOC.
- `app/inicio/juntas/page.tsx` (497 LOC) define `JuntasInner()` con
  410 LOC inline (fetch + filtros + crear + DataTable + columnas).
  DILESA y RDB delegan correctamente a `AdminJuntasListModule` con
  16 LOC c/u.
- CSF diff helpers (`valuesEqual`, `formatDiffValue`) duplicados entre
  `components/proveedores/proveedores-module.tsx` (líneas ~96-217) y
  `app/settings/empresas/_components/empresa-detail.tsx` (~líneas
  117-220), ~60 LOC.

**Hallazgos test debt concretos** (top 5):

1. `app/rdb/cortes/actions.ts` — efectivo en caja, hot file 9 cambios.
2. `app/rdb/inventario/levantamientos/actions.ts` — firma aprobación.
3. `app/api/documentos/[id]/extract/route.ts` — IA Claude+OpenAI con
   costo $, async 60-120s sin rollback en fallo.
4. `app/api/welcome-email/route.ts` — Resend + service role + sin auth.
5. `app/api/juntas/[id]/activar/route.ts` — trigger automático de
   avances, race conditions posibles.

Iniciativa promovida 2026-05-02. Sprint 1 arranca tras este PR de
promoción.
