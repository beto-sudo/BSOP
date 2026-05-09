# Iniciativa — Sub-module permissions (sub-slugs)

**Slug:** `submodule-permissions`
**Empresas:** todas (cross-empresa, primer rollout en RDB)
**Schemas afectados:** core (`modulos`, `permisos_rol` — solo data, no DDL)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-09
**Última actualización:** 2026-05-09

> Granularidad RBAC por sub-página dentro de un módulo. Hoy `core.modulos` × `core.permisos_rol` controla acceso por slug raíz (`rdb.inventario`); las tabs/sub-páginas heredan implícitamente el permiso del padre. Esta iniciativa introduce **sub-slugs como módulos hijos** (`rdb.inventario.stock`) reusando toda la maquinaria existente, e implementa el patrón en los 2 módulos con tabs hoy (`rdb.inventario` 3 tabs, `rdb.productos` 4 tabs). De aquí en adelante el diseño de cualquier módulo nuevo con sub-páginas se hace con sub-slugs desde el inicio.

## Problema

El RBAC actual de BSOP es por slug raíz de módulo:

- `core.modulos` tiene una fila por (empresa_id, slug). Ej. `rdb.inventario`, `dilesa.terrenos`.
- `core.permisos_rol` mapea (rol_id, modulo_id) → (acceso_lectura, acceso_escritura).
- `<RequireAccess module="...">` y el sidebar checan ese slug.

Cuando un módulo tiene sub-páginas (tabs routed por ADR-005), todas heredan el mismo permiso. No hay forma de decir "este rol ve Stock pero no Movimientos" — toca todo o nada.

Use case (preventivo): habrá usuarios que necesiten edición/configuración específica solo en algunas tabs, no en el módulo completo. 2 módulos con tabs hoy:

- **`rdb.inventario`** — Stock / Movimientos / Levantamientos (3 sub-páginas).
- **`rdb.productos`** — Catálogo / Recetas / Auditoría / Análisis (4 sub-páginas).

## Outcome (V1)

Sub-slugs (`rdb.inventario.stock`, `rdb.inventario.movimientos`, `rdb.inventario.levantamientos`, `rdb.productos.catalogo`, `rdb.productos.recetas`, `rdb.productos.auditoria`, `rdb.productos.analisis`) viven en `core.modulos` como filas independientes. La maquinaria existente (`canAccessModulo`, `<RequireAccess>`, UI Settings/Roles) las consume sin cambios — un sub-slug es idéntico a un slug, solo con punto adicional.

**Modelo:**

- **Padre como umbrella** (`rdb.inventario`): determina visibilidad en sidebar (módulo aparece si tienes permiso al padre).
- **Sub-slug controla acceso real** (`rdb.inventario.stock`): cada sub-página chequea su sub-slug específico.
- `ROUTE_TO_MODULE` mapea `/rdb/inventario` (default) → sub-slug `rdb.inventario.stock`, `/rdb/inventario/movimientos` → `rdb.inventario.movimientos`, etc.
- Tab-strip del layout filtra tabs por `canAccessModulo(subSlug)`.

**Métrica de éxito:** un admin puede otorgar a un rol acceso a una tab específica y NO a otra dentro del mismo módulo, vía la UI Settings/Roles existente, sin código nuevo.

## Alcance v1

**Sí incluye:**

- 7 sub-slugs nuevos en `core.modulos` (RDB).
- Backfill defensivo de `core.permisos_rol`: cada rol con permiso al padre obtiene `acceso_lectura/escritura` idéntico en cada sub-slug — preserva 100% del status quo.
- `ROUTE_TO_MODULE` apunta a sub-slugs (URLs sub-page) y al sub-slug default cuando entras al padre.
- `EXPECTED_DB_MODULE_SLUGS` incluye los 7 sub-slugs.
- `<RequireAccess>` en cada sub-page con su sub-slug.
- Layouts (`app/rdb/inventario/layout.tsx`, `app/rdb/productos/layout.tsx`) filtran tab-strip por `canAccessModulo(subSlug)`.
- ADR-030 codifica las reglas SS1-SSn.
- Update a `CLAUDE.md` repo "Liberación de módulo nuevo (RBAC sync)" para que diseños futuros con tabs declaren sub-slugs desde el inicio.
- Update a `docs/architecture/ARCHITECTURE.md` §4 (Auth+RBAC) y §5 (índice de ADRs).

**No incluye:**

- Acciones granulares (`<RequireAccess action="aprobar">`) — eso es opción B futura, evaluar si emerge necesidad.
- Migración de DILESA Inmobiliario (`dilesa.terrenos` etc.) — esos son módulos planos sin tabs; no aplica.
- UI nueva para configuración masiva de sub-slugs en Settings/Roles — la UI actual ya maneja sub-slugs porque son slugs.
- Sub-sub-slugs (3+ niveles) — no hay caso. Si emerge, ADR nuevo.

## Riesgos

- **Backfill mal hecho** → usuarios pierden tabs que tenían. Mitigación: backfill clona `acceso_lectura/escritura` del padre a cada hijo (estado pre-PR = estado post-PR para todos los roles), idempotente con `ON CONFLICT (rol_id, modulo_id) DO NOTHING`.
- **Drift entre código y DB** → ya cubierto por test `'EXPECTED_DB_MODULE_SLUGS sync with DB'`. Falla si la lista canónica no incluye los nuevos sub-slugs.
- **Tres puntos de gate** (sidebar + tab-strip + page-level guard) → mitigación: helper único `canAccessModulo(subSlug)` consumido por los 3 lugares; sin lógica duplicada.
- **Inconsistencia "umbrella sin hijos"** → admin podría dar acceso al padre `rdb.inventario` pero quitar todos los sub-slugs. El módulo aparece en sidebar pero al entrar muestra `<AccessDenied>`. Mitigación: warning en UI Settings/Roles (follow-up Sprint 2).

## Decisiones registradas

- **2026-05-09 (D1) Padre + sub-slugs.** El slug raíz del módulo (`rdb.inventario`) se preserva como umbrella para visibility en sidebar y compatibilidad de código existente. Los sub-slugs (`rdb.inventario.stock`) son los que gobiernan acceso real a páginas específicas. Razón: preserva compatibilidad — todo `<RequireAccess module="rdb.inventario">` actual sigue funcionando como estaba si no se migra; alternativa "solo sub-slugs" requeriría migrar todos los callsites del módulo en el mismo PR, churn innecesario.
- **2026-05-09 (D2) UX cuando no hay permiso.** Tab oculta del tab-strip + `<AccessDenied>` si entra por URL directa. Sin sabor "deshabilitada con tooltip" — ruido visual sin valor. Razón: consistente con sidebar (esconde módulos sin acceso) y con patrón de access-denied (ADR-024).
- **2026-05-09 (D3) Padre como solo umbrella.** Padre gobierna visibilidad en sidebar; sub-slug gobierna acceso real al contenido. Si admin quita el padre pero deja un sub-slug, el usuario sigue viendo el módulo y la tab que tiene. Si admin deja el padre pero quita todos los sub-slugs, el módulo aparece en sidebar pero AccessDenied al entrar — estado inconsistente que la UI debería warning-ear (follow-up). Razón: más permisivo y útil que requerir AND padre+hijo.
- **2026-05-09 (D4) Migración piloto en los 2 módulos.** No incremental — un solo PR de schema delta, otro de application layer, cierre con ADR. Razón: el patrón es trivial, dividirlo más sería ceremonia.

## Sprints

### Sprint 1 — Schema delta (este PR)

- Migración SQL `<timestamp>_modulos_subscope_permissions.sql`:
  - INSERT 7 sub-slugs en `core.modulos` heredando `empresa_id` y `seccion` del padre.
  - Backfill de `core.permisos_rol` clonando del padre a cada hijo.
  - `NOTIFY pgrst, 'reload schema'`.
- Planning doc + fila `in_progress` en `INITIATIVES.md`.
- **PAUSA:** Beto aplica con `supabase db push`, regenera `SCHEMA_REF.md` y `types/supabase.ts`, mergea PR.

### Sprint 2 — Application layer

- `ROUTE_TO_MODULE` mapea cada URL sub-page al sub-slug correspondiente.
- `EXPECTED_DB_MODULE_SLUGS` extendido con los 7 sub-slugs (test pasa).
- Cada sub-page agrega `<RequireAccess module="<sub-slug>">`.
- Layouts de los 2 módulos filtran tab-strip con `canAccessModulo(subSlug)`.
- Smoke en preview con un rol de prueba.

### Sprint 3 — ADR + closeout

- `docs/adr/030_submodule_permissions.md` con reglas SS1-SSn (sub-slug pattern, default URL → sub-slug, tab-strip filter, umbrella semantics, backfill defensivo cuando se introducen sub-slugs nuevos a un módulo existente).
- `CLAUDE.md` repo: extender "Liberación de módulo nuevo (RBAC sync)" — si el módulo tiene tabs, declarar 1 sub-slug por tab desde el inicio.
- `docs/architecture/ARCHITECTURE.md` §4 (Auth+RBAC) y §5 (índice de ADRs) actualizados.
- Mover fila a `## Done` en `INITIATIVES.md`.

## Bitácora

- **2026-05-09** — Promoción + Sprint 1. Conversación de diseño cerró 4 decisiones (D1-D4). Migración SQL escrita pero NO aplicada — Beto aplica al revisar PR.
- **2026-05-09** — Sprint 1 mergeado (PR #460 verde). Aplicación de migración: detectado drift histórico — `20260507171141` (PR #448 wallet fix) registrado en `supabase_migrations.schema_migrations` con timestamp distinto al archivo local `20260507171006`. Verificado vía MCP que el `name` y SQL son idénticos. Repair: `migration repair --status reverted 20260507171141` + `--status applied 20260507171006`. Cero cambios SQL en producción — solo metadata. Tras repair, `supabase db push` aplicó `20260509162620` sin issues. Verificación SQL post-apply: 7 sub-slugs en sección `inventario` (heredada del padre); backfill correcto — `rdb.inventario.{stock,movimientos,levantamientos}` con 5 roles × read=5 × write=5 idéntico al padre, `rdb.productos.{catalogo,recetas,auditoria,analisis}` con 5 roles × read=5 × write=4 idéntico al padre. SCHEMA_REF.md y types/supabase.ts regenerados (cambio menor en SCHEMA_REF, types sin diff — las nuevas filas no afectan tipos).
- **2026-05-09** — Sprint 2 — Application layer. Cambios:
  - **`<RoutedModuleTabs>`** extendido en [components/module-page/routed-module-tabs.tsx](../../components/module-page/routed-module-tabs.tsx) con campo opcional `module?: string` por tab. Si está set, filtra por `canAccessModulo(perms, module)`. Durante `permissions.loading` muestra todas las tabs sin filtrar (evita flash). Admin bypass aplica via `canAccessModulo`.
  - **`ROUTE_TO_MODULE`** en [lib/permissions.ts](../../lib/permissions.ts): `/rdb/inventario`, `/rdb/inventario/movimientos`, `/rdb/inventario/levantamientos`, `/rdb/productos`, `/rdb/productos/recetas`, `/rdb/productos/auditoria`, `/rdb/productos/analisis` apuntan a sus 7 sub-slugs respectivos. Las URLs default (`/rdb/inventario` y `/rdb/productos`) apuntan al sub-slug del primer tab (`stock` y `catalogo`).
  - **`EXPECTED_DB_MODULE_SLUGS`** en [lib/permissions.test.ts](../../lib/permissions.test.ts) extendido con los 7 sub-slugs.
  - **`app/rdb/inventario/layout.tsx`**: TABS array gana `module` por entrada; `<RequireAccess>` umbrella removido — cada sub-page tiene gate específico ahora (alinea con `productos/layout.tsx` patrón).
  - **`app/rdb/productos/layout.tsx`**: TABS array gana `module` por entrada.
  - **Sub-pages actualizadas** (10 archivos): cada uno gate-ea con su sub-slug. Stock y Movimientos ganaron `<RequireAccess>` propio (antes heredaban del umbrella del layout). Levantamientos main + 5 sub-detalles (`[id]/page.tsx`, `[id]/capturar`, `[id]/diferencias`, `[id]/reporte`, `nuevo`) cambian de `rdb.inventario` → `rdb.inventario.levantamientos`. Productos 4 sub-pages cambian de `rdb.productos` → sus sub-slugs respectivos.

## Referencias

- ADR-005 — Sub-módulos como routed tabs.
- ADR-014 — Sidebar taxonomía.
- ADR-024 — Access denied UX.
- `CLAUDE.md` repo, sección "Liberación de módulo nuevo (RBAC sync)".
- `lib/permissions.ts` — `canAccessModulo`, `ROUTE_TO_MODULE`.
- `supabase/migrations/20260428230000_modulos_dilesa_inmobiliario.sql` — plantilla canónica de inserción de módulo + backfill defensivo.
