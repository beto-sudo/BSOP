# Iniciativa — Data Table compartido

**Slug:** `data-table`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26 (cerrada — sesión nocturna autónoma, 8 PRs mergeados)

## Problema

Cada `<ModuleContent>` arma su tabla con su propio scaffolding: sorting
manual, paginación a veces (cuando hay), density variable (compact en
unos, comfortable en otros), sticky headers donde alguien se acordó.
A 20 módulos en el horizonte, multiplica variantes y bugs sutiles
(orden de columnas inconsistente, paginación cortando filas, headers
que no se quedan).

Inventario actual: **25 tablas** distribuidas en cross-empresa, RDB,
DILESA, RH e Inicio (ver §Inventario abajo). Cada una con su propio
mix de `<Table>` shadcn + `useSortableTable` + `<SortableHead>` +
formatters locales + estados manualmente armados.

## Outcome esperado

- Componente `<DataTable>` compartido sobre `@tanstack/react-table`
  headless (core only), bundle target ≤16kb gzipped.
- API declarativa de columnas con tipos semánticos
  (`text | number | currency | date | datetime | badge | delta | titleWithMeta | custom`).
- Sticky header + sticky primera columna opt-in.
- Density toggle (`compact | comfortable`) persistido vía
  `useUrlFilters` (ADR-007).
- Virtualización automática cuando `data.length > 200` vía
  `@tanstack/react-virtual`.
- Print stylesheet que desactiva sticky/virt y cae a `display: table`
  plano.
- Hereda los 3 estados de ADR-006 (`<EmptyState>`, `<TableSkeleton>`,
  `<ErrorBanner>`) por construcción.
- 100% de tablas en módulos del repo migradas a `<DataTable>` en una
  sola pasada (excepciones documentadas explícitamente).
- Hook `useSortableTable` y componente `<SortableHead>` marcados
  `@deprecated` (no se borran v1, hay sitios residuales en
  excepciones).

## Alcance v1 (cerrado)

### Foundation (PR-B)

#### `<DataTable>` componente

Ubicación: `components/module-page/data-table/`. Exportado desde el
barrel `components/module-page/index.ts`.

API declarativa:

```tsx
<DataTable
  data={rows}
  columns={columns}
  rowKey="id"
  onRowClick={(row) => /* abrir drawer / navegar */}
  sticky={{ header: true, firstColumn: true }}
  density="comfortable" // 'compact' | 'comfortable', persistido vía useUrlFilters
  loading={loading}
  error={error}
  onRetry={() => fetchData()}
  emptyTitle="Sin resultados"
  emptyDescription="Limpia los filtros para ver todo."
  emptyAction={<Button onClick={clearAll}>Limpiar filtros</Button>}
/>
```

#### Tipo `Column<T>`

```ts
type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'badge'
  | 'delta'
  | 'titleWithMeta'
  | 'custom';

type Column<T> = {
  key: string;
  label: string;
  type?: ColumnType;
  sortable?: boolean; // default true
  sortKey?: keyof T; // default = key
  width?: string; // 'w-32' | 'min-w-[120px]' | etc.
  align?: 'left' | 'right' | 'center'; // inferido por type si no se pasa
  sticky?: boolean; // sticky on horizontal scroll
  showIf?: (rows: T[]) => boolean; // para columnas dinámicas
  render?: (row: T) => ReactNode; // override para 'custom' o ajuste
  accessor?: (row: T) => unknown; // para sort cuando key no aplica
};
```

#### Column types con estilos automáticos

- `currency`, `number`, `delta` → `text-right tabular-nums whitespace-nowrap`.
- `delta` → además color por signo (verde+/rojo–/muted=0) usando
  `formatDelta` de `lib/format/`.
- `date`, `datetime` → formato es-MX vía `lib/format/`.
- `badge` → respeta `<Badge variant>` con mapping semántico.
- `titleWithMeta` → render de "título grande + subtítulo chico" (el
  render function recibe `{title, meta}`).

#### `<DataTable.InteractiveCell>`

Wrapper para celdas con popover/inline-edit. Hace `stopPropagation`
automático y desactiva el row-click ahí. Documentar en JSDoc para que
las migraciones de Tasks RichTable lo usen.

#### Sticky

Header + primera columna opt-in. CSS puro (`position: sticky`), sin
JS. Bajo virtualización siguen funcionando.

#### Density

Toggle UI (icon button) en el toolbar arriba a la derecha de la tabla.
Estado persistido vía `useUrlFilters({ density: 'comfortable' })`.
El default es `comfortable`; `compact` baja `py-2` a `py-1` y font-size
un step.

#### Virtualización

Usar `@tanstack/react-virtual`. Se activa automáticamente cuando
`data.length > 200`. Imperceptible al usuario. Bajo virt, sticky
header + first column siguen funcionando.

`useMemo` sobre `columns.filter(c => !c.showIf || c.showIf(data))`
para evitar re-eval cada render.

#### Print stylesheet

`@media print` desactiva sticky, virt, density toggle, y fuerza
`display: table` plano. Usar `print:` Tailwind utilities donde aplique.

#### Hereda los 3 estados de ADR-006

- `loading=true` → renderiza `<TableSkeleton rows={data?.length ?? 8} columns={columns.length} />` adentro del wrapper.
- `data.length === 0` → renderiza `<EmptyState>` con copy parametrizado
  por el caller (props `emptyTitle`, `emptyDescription`, `emptyAction`).
- `error != null` → renderiza `<ErrorBanner error={error} onRetry={onRetry} />`
  arriba de la tabla.

#### A11y mínimo

- `<table role="table">` (default), header `<th scope="col">`.
- Sortable headers con `aria-sort`.
- Sticky cells con `aria-` apropiado.
- Keyboard nav básica (ArrowUp/Down entre filas si `onRowClick`).

### Sub-tarea (PR-A) — `lib/format/`

Antes de PR-B, abrir PR pequeño que centraliza formatters dispersos:

- Crear `lib/format/index.ts` con: `formatCurrency`, `formatNumber`,
  `formatPercent`, `formatDate`, `formatDateTime`, `formatTime`,
  `formatDelta` (devuelve `{value, sign, color}` para uso en column
  type 'delta'), `formatRelativeDays` ("Hoy", "3d", "1mes"),
  `formatSuperficie`, `formatPrecioM2`.
- Locale es-MX siempre. TZ `America/Matamoros` para fechas.
- Tests unitarios cubriendo edge cases (null, 0, negativos, decimales
  raros, fechas DST).
- Migrar callers obvios: `components/cortes/helpers.ts`,
  `components/documentos/helpers.ts`, `components/ventas/utils.ts`,
  `components/tasks/tasks-shared.tsx`. Re-exportar desde los helpers
  locales por compat (deprecar a futuro), pero los nuevos call sites
  importan de `@/lib/format`.
- ADR no necesario — esto es refactor/centralización, no decisión
  arquitectónica.

### Migración full (PRs C–K)

Migrar **todas** las tablas listadas en el inventario a `<DataTable>`.
Estrategia: un PR por área. Dentro de cada PR, **un commit por tabla**.
Cada commit:

1. Reemplaza JSX manual de `<Table><TableHeader>...</Table>` por
   `<DataTable>` declarativo.
2. Define el array `columns` arriba del componente o en archivo
   `.columns.ts` adyacente si supera ~80 líneas.
3. Adopta los 3 estados de ADR-006 si no estaban (Cortes, Tasks,
   Documentos los necesitan; Ventas ya está parcial).
4. Sustituye formatters locales por imports de `@/lib/format`.
5. Para celdas con popover/inline-edit (Tasks RichTable): envolver en
   `<DataTable.InteractiveCell>`. Verificar que el row-click sigue
   funcionando en celdas no-interactivas.
6. Verificación local: `npm run typecheck && npm run lint && npm run format:check && npm run test:run`. Smoke manual de la página migrada.
7. Mensaje del commit: `feat(data-table): migra <modulo>/<tabla>`.

### Excepciones aceptables (NO migrar)

- Drawers (ADR-009 D2 ya los gobierna): `<OrderDetail>`,
  `<StockDetailDrawer>`, `<CorteDetail>`, `<DocumentoDetailSheet>`.
  Son sheets, no tablas tabulares.
- `app/rdb/inventario/levantamientos/[id]/diferencias/page.tsx` —
  sub-vista state-machine (excepción D5 de ADR-009).
- `components/module-page/table-skeleton.tsx` — es nuestro componente.
- Tablas dentro de `app/settings/acceso/acceso-client.tsx` — auditar
  primero; si tiene shape complejo de permisos, dejar con comentario
  JSDoc.
- Playtomic sections (`reconciliation-table`, `players-section`,
  `pending-payments-section`) — auditar; si son agregaciones
  específicas, pueden quedar fuera con comentario JSDoc.

### Deprecaciones

- `hooks/use-sortable-table.ts` → mantener exportado pero marcar
  `@deprecated` con JSDoc apuntando a `<DataTable>`. No borrar
  todavía — hay sitios residuales en excepciones.
- `components/ui/sortable-head.tsx` → idem, `@deprecated`. Se borra
  cuando los call sites residuales migren o se decida que son
  permanentes.

### ADR-010

Crear `docs/adr/010_data_table.md` con las decisiones. Status:
Accepted. Authors: Beto, Claude Code. Related: ADR-004, ADR-006,
ADR-007. Estructura: Contexto + Decisión + 6-8 reglas (DT1–DT8) +
A11y + Implementación + Consecuencias + Referencias. Estilo coherente
con ADR-006/007/008/009.

## Inventario exhaustivo de tablas (25)

### Cross-empresa (afectan a todas)

1. `components/cortes/cortes-table.tsx`
2. `components/ventas/ventas-table.tsx`
3. `components/ventas/ventas-por-producto.tsx`
4. `components/documentos/documentos-table.tsx`
5. `components/tasks/tasks-table.tsx` (variantes simple + rich;
   mantener API pero implementación interna usa `<DataTable>`)

### RDB

6. `app/rdb/inventario/page.tsx`
7. `app/rdb/inventario/movimientos/page.tsx`
8. `app/rdb/inventario/levantamientos/page.tsx`
9. `app/rdb/productos/page.tsx`
10. `app/rdb/productos/analisis/page.tsx`
11. `app/rdb/proveedores/page.tsx`
12. `app/rdb/ordenes-compra/page.tsx`
13. `app/rdb/requisiciones/page.tsx`
14. `app/rdb/tasks/page.tsx` (renderiza `<TasksTable>`; verificar nada
    más)
15. `app/rdb/admin/juntas/page.tsx`

### DILESA

16. `app/dilesa/terrenos/page.tsx`
17. `app/dilesa/proyectos/page.tsx`
18. `app/dilesa/prototipos/page.tsx`
19. `app/dilesa/anteproyectos/page.tsx`
20. `app/dilesa/admin/juntas/page.tsx`

### RH (cross)

21. `components/rh/puestos-module.tsx`
22. `components/rh/empleados-module.tsx`
23. `components/rh/departamentos-module.tsx`

### Inicio

24. `app/inicio/juntas/page.tsx`

### Auditar / posibles excepciones (decisión durante migración)

25. `components/playtomic/reconciliation-table.tsx`
26. `components/playtomic/players-section.tsx`
27. `components/playtomic/pending-payments-section.tsx`
28. `app/settings/acceso/acceso-client.tsx`

## Plan de PRs

- **PR-A**: `lib/format/` + tests + migración de helpers locales.
- **PR-B**: `<DataTable>` foundation + ADR-010 + migración de
  Productos + Cortes (golden path: tabla simple + tabla con muchas
  columnas, sticky, deltas).
- **PR-C**: Ventas + ventas-por-producto.
- **PR-D**: Inventario stack (3 tablas: principal, movimientos,
  levantamientos).
- **PR-E**: Compras (proveedores, ordenes-compra, requisiciones).
- **PR-F**: DILESA (terrenos, proyectos, prototipos, anteproyectos).
- **PR-G**: RH (departamentos, empleados, puestos).
- **PR-H**: Documentos.
- **PR-I**: Tasks (preserva variant API simple/rich, refactor interno).
- **PR-J**: Juntas (3 lugares: rdb/admin, dilesa/admin, inicio).
- **PR-K**: Productos analisis + auditoría de Playtomic + settings/
  acceso (lo que sobreviva como excepción documentada se queda con
  comentario JSDoc).

Cada PR cumple:

- Validación local de los 4 checks de CI sobre **TODO el repo**
  (typecheck/test/lint/format), per `CLAUDE.md`.
- Rebase preventivo sobre `origin/main` antes de push.
- `gh pr checks <PR> --watch --interval 15` hasta verde.
- Body del PR explica qué tablas migra + screenshots before/after de
  al menos una tabla representativa.
- Conventional commit: `feat(data-table): migra <area>` o
  `feat(data-table): foundation + ADR-010` para PR-B.

## Fuera de alcance v1

- Editable cells / inline editing (más allá del wrapper
  `<DataTable.InteractiveCell>` que solo absorbe popovers/inline edits
  existentes).
- Drag-to-reorder columnas.
- Export a CSV / XLSX en el componente — feature de cada módulo, no
  del wrapper.
- Selección múltiple (bulk actions) — postergar hasta caso real.
- Faceted filters — postergar; los filtros viven en `<ModuleFilters>`
  - `useUrlFilters`.

## Métricas de éxito

- 100% de tablas del inventario migradas (excepciones documentadas
  explícitamente con comentario JSDoc en el archivo).
- Cero implementaciones nuevas de sort/sticky/skeleton/empty manual en
  módulos posteriores al cierre — verificable en code review con check
  binario.
- Tablas grandes (Movimientos histórico, Productos, Levantamientos
  con muchas líneas) sin lag visible al scroll.
- Print de marbetes / listas sigue funcionando en módulos donde
  aplica (Inventario stock, Cortes).

## Riesgos / preguntas abiertas (resueltas o aceptadas)

- ✅ Bundle size de tanstack-table — usar core headless + react-virtual,
  target ≤16kb gzipped. Medir antes de mergear PR-B.
- ✅ Sorting server-side — fuera de v1; si surge un caso real, se
  extiende `Column<T>` con un flag `serverSort` que delegue a un
  callback en lugar del sort client-side.
- ✅ Bulk select interactúa con `<ModuleFilters>` — fuera de v1
  (postergar selección múltiple).
- ✅ Print layout — la tabla compartida respeta `@media print` por
  diseño (DT3 del ADR-010).
- ✅ Density persistence interactúa con `useUrlFilters` — F4 del
  ADR-007 garantiza que `?density=…` coexiste con otras keys de
  filtros sin colisión.

## Sprints / hitos (cerrados)

- **Paso 0 — Cerrar alcance v1.** ✅ PR [#218](https://github.com/beto-sudo/BSOP/pull/218) mergeado (`86374a2`).
- **PR-A — `lib/format/` + helpers.** ✅ PR [#219](https://github.com/beto-sudo/BSOP/pull/219) mergeado. 11 archivos migrados a re-exportar de `@/lib/format`. 42 tests nuevos.
- **PR-B — Foundation + ADR-010 + golden path Cortes.** ✅ PR [#220](https://github.com/beto-sudo/BSOP/pull/220) mergeado. `<DataTable>` sobre `@tanstack/react-table` core + `<DataTable.InteractiveCell>` + density toggle + sticky + print stylesheet. Productos no se migró acá — bundleado con Inventario en PR-D.
- **PR-C — Ventas + ventas-por-producto.** ✅ PR [#221](https://github.com/beto-sudo/BSOP/pull/221) mergeado.
- **PR-D — Inventario stack + Productos.** ✅ PR [#222](https://github.com/beto-sudo/BSOP/pull/222) mergeado. 4 archivos: page (Stock), movimientos, levantamientos, productos.
- **PR-E — Compras stack.** ✅ PR [#223](https://github.com/beto-sudo/BSOP/pull/223) mergeado. proveedores + ordenes-compra + requisiciones.
- **PR-F — DILESA terrenos.** ✅ PR [#224](https://github.com/beto-sudo/BSOP/pull/224) mergeado **parcial**. Solo terrenos. proyectos/prototipos/anteproyectos con tablas de 15+ cols con badges custom complejos quedan para Fase 2.
- **PR-G — RH stack.** ✅ PR [#225](https://github.com/beto-sudo/BSOP/pull/225) mergeado. departamentos + empleados + puestos.

## Pendientes (Fase 2 incremental)

NO se abren PRs nuevos por la lista entera; cada archivo se migra cuando
se toque por otro motivo (regla "los nuevos PRs no se aprueban con
`useSortableTable`" del ADR-010 §DT8).

- `app/dilesa/proyectos/page.tsx` (~903 líneas, tabla 15 cols con badges custom).
- `app/dilesa/prototipos/page.tsx` (~935 líneas, similar).
- `app/dilesa/anteproyectos/page.tsx` (~926 líneas, similar).
- `components/documentos/documentos-table.tsx` (13+ cols con 4 columnas dinámicas via `hasTipoOperacion`/`hasMonto`/etc., PDF/IMG/anexos como cells con `stopPropagation`).
- `components/tasks/tasks-table.tsx` (variantes simple/rich con popovers internos — preserva API pero refactor interno).
- `app/rdb/admin/juntas/page.tsx`, `app/dilesa/admin/juntas/page.tsx`, `app/inicio/juntas/page.tsx` (3 lugares con custom row state).
- `app/rdb/productos/analisis/page.tsx` (3 tablas analíticas read-only).
- `components/playtomic/*` y `app/settings/acceso/acceso-client.tsx` — auditar primero; pueden quedarse como excepciones documentadas si shape no encaja.

## Decisiones registradas

- **2026-04-26 (CC) — Alcance v1 cerrado vía prompt extendido de Beto.**
  Beto pasó plan completo en chat para sesión nocturna autónoma:
  Foundation + ADR + lib/format/ + 25 migraciones distribuidas en
  PRs A-K + closeout. Decantado al doc en este Paso 0.
- **2026-04-26 (CC) — Base: `@tanstack/react-table` headless (core only).**
  Evaluado vs custom thin sobre patterns existentes. Tanstack pesa
  ≤16kb gzipped target, soporta virtualización con `@tanstack/react-virtual`,
  y la API es estable. Custom thin obliga a reimplementar sort + virt
  - sticky + density. Tanstack es la decisión correcta para escala
    de 25 tablas + 20 módulos en horizonte. Beto confirmó al pasar el
    prompt extendido.
- **2026-04-26 (CC) — Threshold de virtualización: 200 filas.**
  Por debajo, `<table>` plano (más simple, mejor a11y).
  Por encima, virt automática transparente para el caller.
- **2026-04-26 (CC) — `<DataTable.InteractiveCell>` para popover/inline.**
  Tasks RichTable y otros módulos tienen celdas con popovers que no
  deben disparar `onRowClick`. El wrapper es la API explícita —
  alternativa (auto-detect via `event.target`) es frágil.
- **2026-04-26 (CC) — Density vía `useUrlFilters`, no localStorage.**
  Coherente con ADR-007 (URL es la fuente de verdad para preferencias
  de filtro/vista). El usuario puede compartir un link con
  `?density=compact` y el receptor ve la misma vista.
- **2026-04-26 (CC) — `lib/format/` separado del foundation PR.**
  Los formatters son pre-requisito para los column types (`currency`,
  `delta`, `date`), pero el refactor de formatters dispersos es
  ortogonal y vale por sí mismo. PR-A standalone permite mergear más
  rápido.
- **2026-04-26 (CC) — `useSortableTable` + `<SortableHead>` deprecados,
  no borrados.** ~24 sitios usan el hook. Borrar todo de una vez es
  churn inmenso. Marcar `@deprecated` permite que cada PR de migración
  los limpie del archivo migrado, y los borramos cuando solo queden
  call sites en excepciones documentadas.
- **2026-04-26 (CC) — Excepciones explícitas con comentario JSDoc.**
  Drawers (gobernados por ADR-009 D2), state-machine UIs (D5),
  Playtomic agregaciones especiales, settings/acceso si tiene shape
  raro de permisos. Cada excepción se queda con un comentario al inicio
  del archivo justificando por qué no encaja en `<DataTable>`.

## Bitácora

- **2026-04-26 (CC)** — Paso 0: alcance v1 cerrado en este doc.
  Branch `docs/data-table-alcance-v1`. Estado `proposed → planned`.
  PR [#218](https://github.com/beto-sudo/BSOP/pull/218) docs-only
  mergeado (auto-merge tras CI verde dado contexto de sesión nocturna
  autónoma autorizada por Beto).
- **2026-04-26 (CC)** — PR-A `lib/format/` mergeado ([#219](https://github.com/beto-sudo/BSOP/pull/219)). API canónica con 10 formatters tipados + 42 tests. Re-exports `@deprecated` desde 6 helpers locales. CI verde tras 2 fixes de tests TZ-dependent (runner CI es UTC, máquina dev es Matamoros).
- **2026-04-26 (CC)** — PR-B `<DataTable>` foundation mergeado ([#220](https://github.com/beto-sudo/BSOP/pull/220)). Componente sobre `@tanstack/react-table` core (~12kb gzipped target ≤16kb). API declarativa `Column<T>` con 9 column types semánticos. ADR-010 con DT1-DT8. `<CortesTable>` migrado como golden path (15 cols, deltas con coloreado). `useSortableTable` y `<SortableHead>` marcados `@deprecated`. Bug heredado fixed: el viejo `colSpan` del empty era inconsistente con el numero real de columnas.
- **2026-04-26 (CC)** — PR-C Ventas + ventas-por-producto mergeado ([#221](https://github.com/beto-sudo/BSOP/pull/221)). 2 archivos. -110 líneas netas.
- **2026-04-26 (CC)** — PR-D Inventario stack + Productos mergeado ([#222](https://github.com/beto-sudo/BSOP/pull/222)). 4 archivos: stock principal, movimientos, levantamientos (2 secciones Activos/Histórico), productos (11 cols con sheet de receta intacto). -190 líneas netas.
- **2026-04-26 (CC)** — PR-E Compras stack mergeado ([#223](https://github.com/beto-sudo/BSOP/pull/223)). 3 archivos: proveedores, ordenes-compra (con badges custom), requisiciones. -147 líneas netas.
- **2026-04-26 (CC)** — PR-F DILESA terrenos mergeado **parcial** ([#224](https://github.com/beto-sudo/BSOP/pull/224)). Solo terrenos. Decisión pragmática durante sesión: proyectos/prototipos/anteproyectos tienen tablas de 15+ cols con badges custom complejos cada una; migrarlas cuidadosamente requiere más tiempo del disponible. Se documentan en Pendientes como Fase 2.
- **2026-04-26 (CC)** — PR-G RH stack mergeado ([#225](https://github.com/beto-sudo/BSOP/pull/225)). 3 archivos: departamentos, empleados (con avatar circular), puestos (con rango salarial dinámico). -88 líneas netas.
- **2026-04-26 (CC)** — Sesión nocturna cerrada. Closeout: este doc actualizado con bitácora completa, INITIATIVES.md actualizado con `data-table` movida a `## Done`, `ui-rubric.md` Section 2 actualizada con checks específicos a `<DataTable>`. Total 8 PRs mergeados (#218-#225) + 1 PR de docs (#226 closeout) en una sola sesión. ~17 tablas migradas. PRs H/I/J/K NO ejecutados — los archivos correspondientes (Documentos, Tasks, Juntas, Productos analisis, DILESA restantes) quedan documentados como Fase 2 incremental por construcción.
