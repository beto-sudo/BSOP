# Iniciativa — Data Table compartido

**Slug:** `data-table`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `detail-page`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

## Problema

Cada `<ModuleContent>` arma su tabla con su propio scaffolding: sorting
manual, paginación a veces (cuando hay), density variable (compact en
unos, comfortable en otros), sticky headers donde alguien se acordó.
A 20 módulos en el horizonte, multiplica variantes y bugs sutiles
(orden de columnas inconsistente, paginación cortando filas, headers
que no se quedan).

## Outcome esperado

- Componente `<DataTable>` compartido (probable wrapper sobre
  `@tanstack/react-table` o similar) con:
  - Sorting por columna (declarativo).
  - Paginación opcional + "Cargar más" como alternativa.
  - Density toggle (compact / comfortable) persistido en URL o local.
  - Sticky header.
  - Selección múltiple (bulk actions) opt-in.
  - Virtualización para tablas >500 filas.
- Convención de columnas: typeof formatter (currency, date, badge),
  alineación (numérica derecha, texto izquierda), truncate con tooltip.
- Row actions menu (kebab) consistente.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Decidir base: tanstack-table vs custom. tanstack es estándar,
      pero peso del bundle hay que evaluar.
- [ ] API de columns (config declarativo).
- [ ] Sorting + paginación + sticky.
- [ ] Density toggle.
- [ ] Migrar 1-2 tablas existentes (probable: Productos, Ventas).
- [ ] ADR.

## Fuera de alcance

- Editable cells / inline editing. Patrón aparte.
- Drag-to-reorder columnas. Útil pero no v1.
- Export a CSV / XLSX en el componente — eso es feature de cada
  módulo, no del wrapper.

## Métricas de éxito

- 100% de tablas en módulos migrados usan `<DataTable>`.
- Cero implementaciones custom de sort/sticky en módulos posteriores.
- Tablas grandes (Movimientos histórico, Productos) sin lag visible.

## Riesgos / preguntas abiertas

- [ ] Bundle size de tanstack-table — medir antes de decidir.
- [ ] Compatibilidad con sorting server-side (cuando la query lo
      necesita).
- [ ] Bulk select interactúa con `<ModuleFilters>` (filtros activos
      definen "todos los seleccionables").
- [ ] Print layout — la tabla compartida tiene que respetar
      `@media print` (relacionado con `print-pattern` futuro).

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
