# Iniciativa — Catálogo de categorías navegable (RDB)

**Slug:** `rdb-productos-categorias`
**Empresas:** RDB
**Schemas afectados:** `core` (`modulos`, `permisos_rol` — sub-slug nuevo), `erp` (lectura de `categorias_producto` + `productos`)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-05-21
**Última actualización:** 2026-05-21

> Promovida el 2026-05-21. El catálogo de categorías de productos
> (`erp.categorias_producto`) existe en la DB pero no se expone en
> ninguna pantalla — solo aparece de pasada como filtro y como badge.

## Problema

Las categorías de productos de RDB (`erp.categorias_producto`, 15
activas) no tienen una pantalla propia. Hoy solo aparecen:

- como combobox de filtro en el tab Catálogo de `/rdb/productos`,
- como badge de categoría en cada producto,
- como barras de comparativa en el tab Análisis.

No hay forma de ver el catálogo de categorías como tal, ni de saltar
rápido de una categoría a los productos que la componen. Quien quiere
"ver qué hay en Torneos" tiene que ir al Catálogo y armar el filtro a
mano.

## Outcome esperado

- Una tab **"Categorías"** en el módulo Productos que lista las
  categorías de RDB con su color y su conteo de productos.
- Hacer click en una categoría lleva al tab **Catálogo** con el filtro
  de esa categoría ya aplicado — drill-down, espejo del que se hizo en
  `/rdb/ventas` (iniciativa `rdb-ventas-por-categoria`, Sprint 3).

## Alcance v1

Alcance cerrado con Beto al promover: **solo navegable** (read-only). El
catálogo lista y navega; crear / editar / eliminar categorías NO entra
en v1 y sigue siendo vía SQL/migración. Beto eligió esta opción sobre
"navegable + editar existentes" y "CRUD completo".

### Sprint 1 — Tab "Categorías" + drill-down

- **Migración**: `INSERT` del sub-slug `rdb.productos.categorias` en
  `core.modulos` (`ON CONFLICT DO NOTHING`) + backfill defensivo de
  `core.permisos_rol` clonando los permisos de un slug hermano existente
  (`rdb.productos.catalogo`) para cada rol de RDB. `NOTIFY pgrst` al
  final. Plantilla: `20260509162620_modulos_subscope_permissions.sql`.
- Regenerar `supabase/SCHEMA_REF.md` + `types/supabase.ts`.
- **RBAC application layer** (regla "Liberación de módulo nuevo /
  sub-slugs" del `CLAUDE.md`): entry en `TABS` de
  `app/rdb/productos/layout.tsx`, entry en `ROUTE_TO_MODULE`
  (`lib/permissions.ts`), slug en `EXPECTED_DB_MODULE_SLUGS`
  (`lib/permissions.test.ts`).
- **Página** `/rdb/productos/categorias` con
  `<RequireAccess modulo="rdb.productos.categorias">`: lista las
  categorías activas de RDB (`erp.categorias_producto`) con nombre,
  badge de color y conteo de productos. `<DataTable>` con filas
  clicables.
- **Drill-down**: el filtro de categoría del tab Catálogo
  (`app/rdb/productos/page.tsx`) hoy es estado local (`useState('all')`);
  se vuelve URL-aware para que `/rdb/productos?categoria=<id>` lo
  pre-seleccione. Click en una categoría → navega ahí.
- Smoke test e2e.

### Sprint 2 — Cierre

- Verificación visual de Beto en preview.
- Barrido de Reminders.
- Mover la iniciativa a `## Done` en `INITIATIVES.md`.

## Fuera de alcance v1

- **Gestión de categorías** (crear / renombrar / recolorar / reordenar /
  activar-desactivar desde la UI). Beto eligió el alcance navegable. Si
  la gestión emerge como necesidad, es sub-iniciativa o v2.
- **Métricas por categoría** en la tab nueva — el tab Análisis ya tiene
  la comparativa de importe/utilidad 30d. La tab Categorías es
  navegación, no analítica.
- **Cross-empresa.** El módulo Productos hoy es solo RDB.

## Riesgos / impacto en producción

- **Migración de `core.modulos` + `core.permisos_rol`.** El backfill
  defensivo de permisos es obligatorio: sin él, agregar el sub-slug
  **esconde** la tab a los usuarios no-admin (`canAccessModulo` retorna
  `false` cuando el slug no está en `permissions.modulos`). Contexto en
  la regla "Liberación de módulo nuevo" del `CLAUDE.md` y ADR-030.
- **Drift de SCHEMA_REF.** Regenerar `SCHEMA_REF.md` + `types/supabase.ts`
  tras la migración.
- Riesgo bajo en lo demás: la página nueva es read-only; volver el
  filtro del Catálogo URL-aware es un cambio acotado y compatible — sin
  searchParam el default sigue siendo "all".

## Métricas de éxito

- Gerencia puede ver el catálogo de categorías y saltar de una categoría
  a sus productos sin armar el filtro a mano (señal cualitativa).

## Sprints / hitos

- **Sprint 1 — Tab "Categorías" + drill-down.** Listo para arrancar.
- **Sprint 2 — Cierre.** Pendiente Sprint 1.

## Decisiones registradas

### 2026-05-21 · Promoción a iniciativa

Beto propuso exponer el catálogo de categorías (hoy solo en la DB) en el
módulo Productos, con drill-down de categoría a productos. Decisiones al
promover:

- **Alcance v1 = solo navegable** (read-only). Beto lo eligió sobre
  "navegable + editar existentes" y "CRUD completo". La gestión de
  categorías queda fuera de v1.
- **Tab nueva** en el módulo Productos (no página suelta) — sub-slug
  `rdb.productos.categorias`, patrón ADR-005/ADR-030.
- **Drill-down** reusa el patrón del Sprint 3 de
  `rdb-ventas-por-categoria` (filtro URL-aware + navegación).
- **Slug `rdb-productos-categorias`** — prefijo `rdb-` porque el módulo
  Productos hoy es solo RDB.

## Bitácora

### 2026-05-21 · Promoción

Doc de planning creado + fila agregada a `INITIATIVES.md` (estado
`planned`). Próximo: Sprint 1 (tab "Categorías" + drill-down).
