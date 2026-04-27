# ADR-010 — `<DataTable>` compartido sobre `@tanstack/react-table`

- **Status**: Accepted
- **Date**: 2026-04-26
- **Authors**: Beto, Claude Code (iniciativa `data-table`)
- **Related**: [ADR-004](../../supabase/adr/004_module_page_layout_convention.md), [ADR-006](./006_module_states.md), [ADR-007](./007_filters_url_sync.md)

---

## Contexto

ADR-004 fijó la anatomía de páginas tabulares con `<ModulePage>` + `<ModuleContent>`. Pero el contenido tabular en sí — la `<table>` con sort, sticky, density, estados — quedó como responsabilidad de cada módulo. El resultado: 25 tablas en el repo, cada una con su propio mix de:

- `<Table>` shadcn + `useSortableTable` hook custom + `<SortableHead>` componente.
- Skeletons inline `Array.from({length:8}).map(<TableRow>...<Skeleton/>)`.
- Empties inline `<TableRow><TableCell colSpan>...</TableCell></TableRow>`.
- Formatters dispersos (`formatCurrency`, `formatDate`, etc.) por archivo.
- Sin density toggle. Sin sticky consistente. Sin print stylesheet.

ADR-006 ya empezó a centralizar empty/loading/error con `<EmptyState>` + `<TableSkeleton>` + `<ErrorBanner>`. ADR-007 agregó `useUrlFilters` que sirve para persistir density. PR-A (commit `da23a42`) movió formatters a `lib/format/`. Falta el wrapper de tabla en sí — el componente que orquesta todo.

A 20 módulos en el horizonte y con la convención de detalle ya fijada (ADR-009), el costo de seguir reinventando tablas crece linealmente. Es momento de cerrarlo.

## Decisión

Componente `<DataTable>` en `components/module-page/data-table/` sobre `@tanstack/react-table` headless (core only). Bundle target alcanzado: `react-table` core + sort row model = ~12kb gzipped, dentro del presupuesto ≤16kb del alcance v1.

API declarativa con `Column<T>` tipado y column types semánticos:

```tsx
const columns: Column<Producto>[] = [
  { key: 'codigo', label: 'Código', sticky: true },
  { key: 'nombre', label: 'Producto', cellClassName: 'font-medium' },
  { key: 'precio_actual', label: 'Precio', type: 'currency' },
  { key: 'stock', label: 'Stock', type: 'number' },
  { key: 'cambio_30d', label: 'Δ 30d', type: 'delta' },
  { key: 'ultima_venta', label: 'Última venta', type: 'date' },
  {
    key: 'estado',
    label: 'Estado',
    render: (p) => <Badge variant={badge(p.estado)}>{p.estado}</Badge>,
  },
];

<DataTable
  data={items}
  columns={columns}
  rowKey="id"
  onRowClick={(p) => router.push(`/productos/${p.id}`)}
  loading={loading}
  error={error}
  onRetry={fetchProductos}
  density={filters.density}
  onDensityChange={(d) => setFilter('density', d)}
  emptyTitle="Sin productos"
  emptyAction={<Button>+ Crear</Button>}
/>;
```

### Las 8 reglas (DT1–DT8)

#### DT1 — Tipos semánticos en `Column<T>`, no estilos directos

`type: 'currency' | 'number' | 'date' | 'datetime' | 'badge' | 'delta' | 'titleWithMeta' | 'custom' | 'text'` (default `'text'`). Cada uno aplica:

- Alineación: `number/currency/delta` → `right`; `text/date/badge/titleWithMeta` → `left` (overridable con `align`).
- Clases: `number/currency/delta` → `tabular-nums whitespace-nowrap`.
- Renderer: usa `lib/format/format{Currency,Number,Date,DateTime,Delta}` automáticamente. `delta` colorea con la clase de `formatDelta`. `titleWithMeta` rendea "título grande + subtítulo chico".
- `custom` requiere `render` explícito; los demás permiten override.

> **Por qué**: tener un type semántico permite cambiar el formatter o el estilo de TODAS las columnas currency en un solo lugar (e.g. agregar tooltip con desglose). Si cada columna especifica clases inline, la consistencia se pierde.

#### DT2 — Columnas dinámicas vía `showIf(rows)`

Para columnas que solo aplican cuando hay datos relevantes (e.g. "Comisión" solo si algún row tiene comisión), usar `showIf: (rows) => rows.some(r => r.comision != null)`. Si retorna `false`, la columna se omite del header y todas las celdas. `useMemo` interno evita re-eval por render.

> **Por qué**: alternativa (renderar siempre con valor `'—'` o blank) ensucia el header con columnas vacías para módulos donde el feature aplica solo a un subset.

#### DT3 — Print stylesheet desactiva sticky/virt y cae a `display: table` plano

Toda celda y header del DataTable usa Tailwind `print:` utilities para revertir comportamientos browser-only en `@media print`:

- Sticky header → `print:static print:shadow-none`.
- Sticky first column → `print:static`.
- Toolbar (density toggle, etc.) → `print:hidden`.
- Border del wrapper → `print:border-0` y `print:rounded-none`.

> **Por qué**: el repo imprime marbetes y listas (Inventario, Cortes); sticky positioning rompe el flujo de impresión. La regla "lo que sirve en pantalla NO sirve en papel, y viceversa" se enforza vía CSS, no JS.

#### DT4 — Density toggle persistido en URL via `useUrlFilters`

Default `comfortable` (más espacio entre filas, font-size standard). `compact` reduce `py` a `1` y baja un step de font-size. La preferencia se persiste vía `useUrlFilters({ density: 'comfortable' })` (F4 de ADR-007 garantiza coexistencia).

El icon button del toggle aparece en el toolbar arriba a la derecha del wrapper de la tabla (excepto si `showDensityToggle={false}` o si no se pasa `onDensityChange`).

> **Por qué**: density es preferencia visual del usuario, no del módulo. Persistirla en URL (en lugar de localStorage) hace que un link compartido reproduzca la misma vista.

#### DT5 — Celdas con popover/inline-edit usan `<DataTable.InteractiveCell>`

Cuando una celda contiene un `<Combobox>`, `<Popover>`, dropdown, o cualquier control que no debe disparar `onRowClick`, envolver en `<DataTable.InteractiveCell>`. El wrapper hace `stopPropagation` automático.

```tsx
{
  key: 'estado',
  label: 'Estado',
  render: (row) => (
    <DataTable.InteractiveCell>
      <Combobox value={row.estado} onChange={(v) => updateEstado(row.id, v)} />
    </DataTable.InteractiveCell>
  ),
}
```

> **Por qué**: alternativa (auto-detect via `event.target` + walking del DOM) es frágil. Convención explícita es trivial de revisar en code review y hace el comportamiento predecible.

#### DT6 — Hereda los 3 estados de ADR-006 por construcción

`<DataTable>` rendea automáticamente:

- `loading=true` → `<TableSkeleton rows={data.length || 8} columns={visibleColumns.length} />` adentro del `<TableBody>`.
- `data.length === 0` → `<EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />` con `colSpan` apropiado.
- `error != null` → `<ErrorBanner error={error} onRetry={onRetry} />` arriba de la tabla.

Caller solo pasa los props; no necesita armar el JSX condicional.

> **Por qué**: ADR-006 §S3 ya dice que el caller distingue "vacío virgen" vs "vacío con filtros activos" via copy. `<DataTable>` no enforza la convención; el caller sigue eligiendo `emptyTitle` y `emptyDescription` según su `activeCount` de `useUrlFilters`.

#### DT7 — Sticky opt-in: header default true, first column manual

`sticky={{ header: true, firstColumn: true }}`. Header sticky por default (recomendado para tablas con muchas filas). First column sticky se opt-in caso por caso — útil para tablas anchas (Cortes con 15 columnas, Productos con 12), no útil para tablas estrechas (RH).

CSS puro vía `position: sticky`. Sin JS. Funciona bajo virtualización.

> **Por qué**: no toda tabla necesita sticky first column (overhead visual de la línea divisoria); pero header sticky sí casi siempre vale (ayuda contexto al scrollear). Default razonable.

#### DT8 — `useSortableTable` y `<SortableHead>` quedan deprecados, no borrados

Ambos están en uso en ~24 sitios (incluyendo módulos no migrados todavía y excepciones aceptables como `levantamientos[id]/diferencias` con state-machine UI). Borrarlos de una sola vez es churn inmenso.

Marcar `@deprecated` JSDoc apuntando a `<DataTable>`. Cuando todos los call sites migren o se decida que las excepciones son permanentes, se borran. Hasta entonces, los nuevos PRs no se aprueban con uso de los deprecados.

> **Por qué**: deprecación incremental respeta el blast radius del repo. El JSDoc avisa en el IDE; lint puede alertar en el futuro si vale la pena (no hace falta hoy).

### A11y mínimo

- `<table>` (default de shadcn) con header `<th scope="col">`.
- Sortable headers con `aria-sort="ascending" | "descending" | "none"`.
- Sticky cells con `position: sticky` (sin atributos especiales — el screen reader lee el contenido normal).
- Botones de header sortable son `<button type="button">` (no `<th onClick>`), por lo que el keyboard nav funciona.
- Toolbar (density toggle) usa `aria-label` explícito para el icon button.

## Implementación

- **PR-A** (`feat/lib-format-centralizado`): centraliza formatters en `lib/format/`. Mergeado.
- **PR-B** (este PR): `<DataTable>` foundation + ADR-010 + migración de `<CortesTable>` (15 columnas, deltas, sticky implícito por ancho) como golden path. **Productos no se migra en este PR** — `app/rdb/productos/page.tsx` tiene 1014 líneas con sheet de receta + categorías + lógica compleja, blast radius muy grande para incluir junto con la creación del componente. Productos sale en PR-D junto con el stack de Inventario.
- **PRs C–K**: migración del resto de tablas, una área por PR. Plan completo en `docs/planning/data-table.md`.

## Consecuencias

### Positivas

- Code review tiene checks binarios: ¿usa `<DataTable>` o tiene comentario JSDoc justificando excepción?
- Una tabla nueva se escribe en ~30 líneas de JSX (vs ~150 con el patrón viejo de `<Table><TableHeader><SortableHead>...`).
- Cuando el sistema de diseño cambie sticky shadow, density spacing, sort icon, etc., se cambia en un lugar.
- `lib/format/` ya elimina drift en formatters; column types lo refuerzan.
- Print stylesheet centralizado: una vez verificado en Cortes, todas las tablas migradas heredan el comportamiento.

### Negativas

- Nueva dependencia `@tanstack/react-table` + `@tanstack/react-virtual`. ~12kb gzipped el primero, react-virtual sin uso todavía (postergado a futuro hasta caso real con >200 filas que muestre lag).
- Migrar las 25 tablas restantes lleva tiempo (PRs C–K). Mientras tanto, hay coexistencia entre el patrón viejo y `<DataTable>` — los tests de la rúbrica deben validar ambos durante la transición.
- `<DataTable>` no soporta v1 selección múltiple, paginación cliente, virtualización, drag-to-reorder columnas, faceted filters. Postergados hasta caso real.

### Cosas que NO cambian

- ADR-006 (`<EmptyState>`, `<TableSkeleton>`, `<ErrorBanner>`) — los 3 componentes se reutilizan internos al `<DataTable>`. Sigue siendo válido usarlos standalone para módulos no-tabulares.
- ADR-007 (`useUrlFilters`) — density se persiste vía este hook. Filters del módulo siguen viviendo en su `<ModuleFilters>` con su `useUrlFilters` propio.
- ADR-009 (`<DetailPage>`) — tablas dentro de detail pages usan `<DataTable>` igual; no hay convención distinta.
- Drawers (`<OrderDetail>`, `<StockDetailDrawer>`, etc.) — siguen siendo sheets, no tablas. Excepción documentada ADR-009 D2.

## Fuera de alcance v1

- **Selección múltiple (bulk actions)**. Postergar.
- **Paginación cliente-side** y **virtualización**. La mayoría de las tablas del repo cargan datasets ≤200 filas; cuando aparezca un caso real con lag, se activa `@tanstack/react-virtual` (ya en deps).
- **Drag-to-reorder columnas** y **column visibility persistence**. Postergar.
- **Faceted filters**. Filtros viven en `<ModuleFilters>` + `useUrlFilters`, no en el toolbar de `<DataTable>`.
- **Editable cells (inline editing)** más allá del wrapper `<DataTable.InteractiveCell>` que solo cancela el row-click. Los popovers/comboboxes existentes se preservan.
- **Server-side sort**. Si surge un caso real (queries que no devuelven todo), se extiende `Column<T>` con flag `serverSort` que delegue a callback. Hoy todas las tablas hacen sort client-side sobre datos ya cargados.

## Referencias

- Componente: [components/module-page/data-table/](../../components/module-page/data-table/)
- Iniciativa: [docs/planning/data-table.md](../planning/data-table.md)
- PR-A (formatters): [#219](https://github.com/beto-sudo/BSOP/pull/219)
- PR-B (este PR): `feat/data-table-foundation`
- ADR-006 — estados (empty/loading/error).
- ADR-007 — `useUrlFilters` (density persistence).
- ADR-009 — `<DetailPage>` (tablas dentro de detail).
