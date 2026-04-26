# ADR-006 — Componentes compartidos para empty / loading / error de módulo

- **Status**: Accepted
- **Date**: 2026-04-26
- **Authors**: Beto, Claude Code (iniciativa `module-states`)
- **Subordinate to**: [ADR-004](../../supabase/adr/004_module_page_layout_convention.md) R10

---

## Contexto

ADR-004 definió la anatomía de `<ModulePage>` y, en R10, fijó que los banners contextuales (errores de fetch, fecha histórica, alertas) viven entre `<ModuleFilters>` y `<ModuleContent>`. Pero R10 dice **dónde** vive un banner, no **qué** banner. Tampoco resuelve los otros dos estados visuales que toda página tabular tiene: cargando y vacío.

Auditoría sobre Ventas (`/rdb/ventas`) e Inventario (`/rdb/inventario`):

1. **Skeleton ad-hoc.** Cada `TableBody` con `loading` arma `Array.from({length:8}).map(<TableRow>...<Skeleton/>...)` con shape ligeramente distinto entre módulos. Inventario usa 8 columnas; Ventas tiene un bug heredado con 4 columnas para una tabla de 6.
2. **Empty inline.** Cada módulo escribe su propio `<TableRow><TableCell colSpan={…} className="py-12 text-center text-muted-foreground">No se encontraron…</TableCell></TableRow>`, con copy distinto y sin distinguir "vacío sin filtros" de "vacío con filtros activos".
3. **Error como `<div>` artesanal.** Mismo `rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive` copiado en cada módulo. Sin botón de reintentar, sin icono, sin `role="alert"`.

A 20 módulos en el horizonte, esto produce 20× decisiones repetidas + drift visual + copy disperso. Antes de seguir migrando módulos a `<ModulePage>`, fijamos los 3 componentes.

## Decisión

Tres componentes en `components/module-page/`:

```
EmptyState       (centered icon + title + description? + action?)
TableSkeleton    (N rows × M cols of <Skeleton>; renders inside <TableBody>)
ErrorBanner      (role="alert" red banner with optional onRetry; lives per R10)
```

Exportados desde el barrel `components/module-page/index.ts` junto a los slots existentes.

### Las 5 reglas (S1–S5)

#### S1 — `<ErrorBanner>` vive entre filters y content

Aplicación directa de ADR-004 R10. El banner se renderiza condicional al estado de `error`, después de `<ModuleFilters>` y antes de `<ModuleContent>` (o entre filtros locales y la tabla en módulos pre-`<ModulePage>`). Nunca dentro de `<ModuleContent>`.

> **Por qué**: un error de fetch es estructural a la página, no parte del contenido. Si vive dentro del contenido, se pierde cuando el contenido es una tabla con datos parciales.

#### S2 — `<TableSkeleton>` reemplaza el `Array.from(...).map(<TableRow>...)`

Cualquier `<TableBody>` que rendea filas de skeleton durante `loading` lo hace vía `<TableSkeleton rows={N} columns={M | string[]} />`. Permite columnas con widths heterogéneos (ej. `['w-32', 'w-full', 'w-20']`) cuando el shape de la tabla lo amerita.

> **Por qué**: el ojo entrenado distingue 6 cells uniformes de 6 cells con widths reales. Un skeleton honesto sobre el shape baja el "salto visual" cuando llegan los datos.

#### S3 — `<EmptyState>` distingue "módulo virgen" de "filtros activos"

El componente es presentacional y agnóstico — recibe `title`, `description`, `action` que el caller construye según su estado. La convención de copy es:

- **Vacío sin filtros**: `title="Aún no hay [entidad]"` + `description="Registra el primer [entidad] para que aparezca aquí."` + opcionalmente `action` (mismo botón del header).
- **Vacío con filtros**: `title="Ningún [entidad] coincide con los filtros"` + `description="Limpia los filtros para ver [el inventario / los pedidos / etc.] completo."`.

Cuando el `<EmptyState>` aparece dentro de una tabla, se envuelve en `<TableRow><TableCell colSpan={N} className="p-0">…</TableCell></TableRow>` para preservar el ancho.

> **Por qué**: "no hay datos" y "no hay datos para esos filtros" son dos preguntas distintas del usuario. Confundirlas le hace dudar entre crear una entidad o limpiar filtros.

#### S4 — Recargas con datos previos NO reemplazan tabla por skeleton

Cuando hay datos cargados y el usuario dispara un refetch (cambio de filtro, botón ↺), el módulo mantiene la tabla anterior visible y muestra un indicador discreto (spinner pequeño en el botón de refresh, opacity en KPI strip) — no reemplaza la tabla por `<TableSkeleton>` cada refetch.

> **Por qué**: el flicker tabla → skeleton → tabla es agresivo cuando el usuario ya tenía contexto visual. El skeleton es para la primera carga (sin datos previos).

#### S5 — `onRetry` solo cuando la operación es idempotente

`<ErrorBanner onRetry={…} />` solo se conecta cuando la acción que falló se puede reintentar sin efectos secundarios (un fetch GET, un RPC de lectura). Para mutaciones (POST/PUT/DELETE), el retry vive cerca del componente que disparó la acción, no en el banner global.

> **Por qué**: un retry global de una mutación duplica el efecto. El banner no sabe si la mutación llegó al backend, solo que respondió error.

### A11y mínimo

- `<TableSkeleton>` rows con `role="status"` y `aria-label="Cargando"` para screen readers.
- `<ErrorBanner>` con `role="alert"` y `aria-live="polite"`.
- `<EmptyState>` usa `<h3>` semántico para el título.

Estos son piso, no techo. La iniciativa `a11y-baseline` (cola UI #7) profundiza WCAG 2.1 AA.

## Implementación

- **PR de creación + adopción** (este PR): los 3 componentes, exportados desde el barrel; Ventas e Inventario adoptan los 3. Inventario es el caso completo (los 3 estados activos en una página). Ventas adopta `<ErrorBanner>` y `<TableSkeleton>` + `<EmptyState>` en `<VentasTable>` — la migración de Ventas a `<ModulePage>` completo es trabajo separado de la iniciativa `module-page` Fase 2.
- **Adopción incremental**: los demás módulos los adoptan en sus PRs de migración a `<ModulePage>`. No se abre un PR de "migrar todo a los nuevos estados" — eso es churn.

## Consecuencias

### Positivas

- Una migración a `<ModulePage>` ahora viene con los 3 estados resueltos por construcción.
- Code review tiene checks binarios: ¿usa `<ErrorBanner>`? ¿usa `<TableSkeleton>`? ¿usa `<EmptyState>` con copy diferenciado?
- Cuando el sistema de diseño cambie color de error o estilo de skeleton, se cambia en un lugar.
- Bug oculto encontrado durante migración: `<VentasTable>` skeleton tenía 4 columnas para una tabla de 6 — el reemplazo con `<TableSkeleton columns={6} />` lo corrige.

### Negativas

- Páginas no-tabulares (dashboards, formularios largos) no usan `<TableSkeleton>` directamente — `<EmptyState>` y `<ErrorBanner>` siguen siendo reusables. La heterogeneidad de loading-states en páginas no-tabulares queda fuera de v1.
- `<EmptyState>` es agnóstico al copy — depende del code review para que el caller use la convención de copy "virgen vs filtros". No se enforza en runtime.

### Cosas que NO cambian

- ADR-004 R10 sigue siendo la regla de posición — este ADR provee el componente, no cambia dónde vive.
- Estilos de `<Skeleton>` (componente base de shadcn) — `<TableSkeleton>` lo wrappea.
- Lógica de fetch / abort / dedupe — los componentes son presentacionales puros.

## Referencias

- [ADR-004](../../supabase/adr/004_module_page_layout_convention.md) — anatomía y R10.
- Iniciativa: [docs/planning/module-states.md](../planning/module-states.md).
- PR de implementación: `feat/ui-module-states`.
- Rúbrica QA: [docs/qa/ui-rubric.md](../qa/ui-rubric.md) Sections 1-2 (checks de skeleton + empty).
