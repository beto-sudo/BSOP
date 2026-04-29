# Iniciativa — Productos · Config + Reportes (RDB)

**Slug:** `rdb-productos-config-reportes`
**Empresas:** RDB (v1); diseñada para enchufar otras cuando aplique
**Schemas afectados:** `erp` (productos, producto_receta), `rdb` (v_productos_grupo)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-29
**Última actualización:** 2026-04-29

> Promovida a iniciativa el 2026-04-29 después de estresar la idea con
> Beto. La gerencia del Deportivo Rincón del Bosque y contabilidad no
> tienen visibilidad sobre cómo están configurados los productos:
> padres-hijos, recetas, factores de consumo. La información existe en
> el schema (`erp.productos.parent_id`, `erp.productos.factor_consumo`,
> `erp.producto_receta`, view `rdb.v_productos_grupo`) pero no hay
> pantallas que la expongan ni reportes que la auditen — todo se edita
> celda por celda en `app/rdb/productos/page.tsx`.

## Problema

La gerencia del deportivo (RDB) y contabilidad no tienen forma de:

1. **Ver qué productos están configurados como padres** (a granel, ej.
   botella de licor, garrafa) y cuáles son sus hijos (porciones que se
   venden, ej. trago de 45 ml).
2. **Ver qué recetas existen** y qué insumos consume cada una, en qué
   cantidad y unidad.
3. **Auditar la configuración**: productos vendibles sin receta,
   productos hijos sin factor de consumo configurado, padres sin hijos,
   recetas con insumos no inventariables.
4. **Ver el costo real de una receta** calculado a partir de los costos
   de sus insumos vs el precio de venta → margen.
5. **Configurar masivamente factores de consumo**: hoy se edita un
   factor a la vez dentro de una celda en la tabla maestra; no hay
   pantalla dedicada para revisar y ajustar el catálogo en bulk.

Datos cuantitativos del schema (al 2026-04-29):

- `erp.productos` tiene columnas `parent_id` (FK self) y `factor_consumo`
  (numeric, default 1.0) — ya soportan padres-hijos.
- `erp.producto_receta` ya existe con `producto_venta_id`, `insumo_id`,
  `cantidad`, `unidad`, `notas`.
- `rdb.v_productos_grupo` ya agrupa hijos por padre — pero no hay
  pantalla que la consuma hoy.

El gap es **100% UI + reportes**, no schema (con la excepción de
posibles validaciones que se decidirán en Sprint 3-4).

## Outcome esperado

Gerencia RDB y contabilidad pueden auditar y configurar productos sin
escalar preguntas a Beto/Claude:

- Tabla de **grupos padres-hijos** con factor de consumo visible y
  filtrable.
- Listado de **recetas** con insumos, cantidades y costo calculado.
- **Costo-margen** por producto vendible (costo_receta_calculado vs
  precio_venta).
- **Reporte de huecos** de configuración con alertas accionables (sin
  receta, sin factor, margen negativo, padres huérfanos).
- **Vista dedicada para editar factores** masivamente con filtros
  (solo padres, factor=1 sospechoso).

Componentes en `components/productos/` shared para que cuando otra
empresa requiera el módulo, sumar pages bajo `app/<empresa>/productos/`
cueste decenas de líneas, no centenas — siguiendo la convención
`shared-modules-refactor` (ADR-011).

## Alcance v1 (tentativo — refinar al arrancar)

### Sprint 1 — Vista Padres-Hijos (read-only)

- [ ] Página nueva `/rdb/productos/grupos` con `<DataTable>` que
      consume `rdb.v_productos_grupo` (FK cross-schema requiere usar
      el patrón documentado en memory `reference_supabase_cross_schema_fk.md`).
- [ ] Columnas: padre (nombre + sku), total_hijos, lista de hijos (jsonb
      de la view) con factor_consumo de cada uno.
- [ ] Detalle de grupo (drawer o sub-page): tabla de hijos con factor
      editable inline (reusa `<DetailDrawer>` o `<DetailPage>`).
- [ ] Filtros con `useUrlFilters` + `<ActiveFiltersChip>` (ADR-007).
- [ ] Estados via `<EmptyState>` + `<TableSkeleton>` + `<ErrorBanner>`
      (ADR-006).
- [ ] Test smoke: carga sin auth-block, filter funciona, drawer abre.

### Sprint 2 — Vista Recetas

- [ ] Página `/rdb/productos/recetas` con `<DataTable>` listando los
      productos vendibles que tienen al menos un renglón en
      `erp.producto_receta`.
- [ ] Columnas: producto venta (nombre + sku), # insumos,
      `costo_receta_calculado`, `precio_venta`, margen ($, %).
- [ ] Drawer detalle (`<DetailDrawer>`): lista de insumos con cantidad,
      unidad, costo unitario por insumo, costo subtotal.
- [ ] Helper nuevo: `lib/productos/recetas.ts` con
      `calcularCostoReceta(producto_venta_id)` — cliente + RPC opcional
      si la performance lo justifica.
- [ ] Decidir fuente de costo del insumo: `erp.productos.costo_unitario`
      vs costo histórico de movimientos (ver Riesgos).

### Sprint 3 — Configuración masiva de factores

- [ ] Página `/rdb/productos/factores` con grid editable
      (`<DataTable>` + `<Form>` + `useZodForm` per-row, ADR-016).
- [ ] Filtros: solo padres / solo hijos / factor=1 (sospechoso) /
      factor faltante.
- [ ] Edición inline por fila con validación zod (factor > 0).
- [ ] Audit trail: cambios en `factor_consumo` quedan registrados en
      la tabla audit estándar del repo (verificar si ya hay trigger;
      si no, agregar uno o usar el patrón de `actualizar_*` existente).
- [ ] Bulk edit (postergable a Sprint 3.B si surge necesidad).

### Sprint 4 — Reporte de auditoría / validación

- [ ] Página `/rdb/productos/auditoria` (o sección dentro de
      `/rdb/productos/analisis`).
- [ ] Lista alerts agrupadas por severidad:
  - **Crítico**: receta con margen negativo (costo > precio_venta).
  - **Crítico**: producto vendible sin receta (si tiene insumo
    inventariable razonablemente esperado — heurística por categoría
    o flag manual a definir).
  - **Warning**: producto hijo sin factor configurado o factor=1.
  - **Warning**: padre sin hijos (orfandad de configuración).
  - **Warning**: receta con insumo no inventariable (ya existe
    validación en `upsertReceta`, pero datos legacy pueden tenerlo).
- [ ] Cada alert linkea al detalle del producto / receta / grupo.
- [ ] Dashboard summary cards arriba: # alerts críticas, # warnings.

### Sprint 5 — Sidebar + permisos + cierre

- [ ] Sub-items en sidebar bajo Inventario (RDB): Productos / Grupos /
      Recetas / Factores / Auditoría. Seguir convención de
      `sidebar-taxonomia` ADR-014 (sección Inventario para RDB).
- [ ] Verificar que `rdb.productos` cubra todas las rutas en
      `ROUTE_TO_MODULE` ([lib/permissions.ts](../../lib/permissions.ts)).
      Probable: sí, todo es lectura/escritura del mismo módulo y no
      requiere slugs nuevos (decisión confirmada con Beto 2026-04-29).
- [ ] Closeout: bitácora, ADR si aplica, sweep de Reminders, mover
      iniciativa a `## Done` en `INITIATIVES.md`.

## Fuera de alcance v1

- **Cross-empresa rollout** (ANSA / COAGAN / DILESA). Los componentes
  se construyen en `components/productos/` shared, pero la liberación
  v1 es **solo RDB**. Cuando otra empresa requiera el módulo, será
  iniciativa hija o expansión — typically pages nuevos bajo
  `app/<empresa>/productos/...` que consumen los mismos componentes
  pasando `empresa_id`.
- **Validación de ciclos padre-hijo** a nivel constraint DB
  (ej. CHECK `parent_id != id` y prevención transitiva). Hoy no hay
  constraint que prevenga "A es padre de B y B es padre de A". Se
  evaluará en Sprint 3 al tocar el editor de factores; si crece a
  ADR aparte, se promueve.
- **Wizard de alta masiva de productos / recetas** (importar desde
  CSV / Excel). Si la operación de carga inicial lo amerita, se
  evalúa como sub-iniciativa.
- **RBAC granular nuevo** (`rdb.productos.recetas`,
  `rdb.productos.factores`, `rdb.productos.reportes`). Confirmado
  con Beto 2026-04-29: por ahora todo bajo `rdb.productos` único, se
  resuelve vía rol. Si más adelante contabilidad debe ver _menos_
  que gerencia, será refactor de permisos en iniciativa nueva.
- **Histórico de cambios de receta** (versionado). El audit trail
  básico de `factor_consumo` entra en Sprint 3, pero un sistema de
  versiones de receta queda fuera v1.

## Bloqueos / Dependencias

- **Schema cross-schema FK** (`erp.productos.parent_id` + view
  `rdb.v_productos_grupo`): supabase-js no embebe FKs entre schemas
  vía `.schema('rdb')`. Mitigación: dos queries con `.in()` o consumir
  la view `rdb.v_productos_grupo` directamente cuando ya tiene los
  hijos serializados como jsonb. Documentado en memory
  `reference_supabase_cross_schema_fk.md`.
- **`v_productos_grupo` no se consume hoy**: verificar shape real
  antes de construir UI encima — si la view no devuelve lo esperado,
  hay que ajustarla en Sprint 1.
- **Costo del insumo** (Sprint 2): `erp.productos.costo_unitario` es
  el dato más simple, pero puede estar stale o no reflejar costo real
  promedio. Alternativa: costo ponderado de movimientos de entrada
  recientes (vía RPC). Decidir antes de implementar — afecta margen
  reportado.
- **Patron de audit trail**: verificar si `factor_consumo` ya tiene
  trigger de auditoría o si hay que agregarlo en Sprint 3.

## Métrica de éxito

- Gerencia RDB y contabilidad operan sin escalar consultas de
  configuración de productos a Beto / Claude (señal cualitativa).
- Reporte de auditoría (Sprint 4) llega a **0 alerts críticas
  pendientes** dentro de las primeras 4 semanas post-Sprint 4 — el
  closing del backlog inicial es la señal de que el reporte funciona
  y la operación lo está usando.
- Productos con margen negativo se vuelven visibles y accionables
  (count baja mes a mes).

## Sprints / hitos

_(se llena cuando arranque ejecución)_

## Decisiones registradas

### 2026-04-29 · Promoción a iniciativa

Beto promovió la idea a iniciativa después de estresar el alcance.
Decisiones tomadas en la conversación de promoción:

- **Slug:** `rdb-productos-config-reportes` — prefijo `rdb-` porque
  outcome v1 es 100% RDB. Componentes shared en `components/productos/`
  para que cross-empresa cueste poco después.
- **Reportes en alcance:** validación de configuración (a) + análisis
  costo/margen (b). Drift consumo real vs configurado (c) **fuera de
  v1** — se evalúa cuando los reportes a/b estén operando.
- **Factores de consumo:** foco en _ver y configurar fácilmente_
  (Sprint 3). Bulk edit / detección de drift queda para v2.
- **Padres-hijos:** visualización tabular (Sprint 1). Árbol jerárquico
  / drilldown queda fuera v1 — se evalúa si surge necesidad operativa.
- **Empresas:** RDB only v1. Componentes shared para enchufar otras
  empresas barato cuando llegue el caso.
- **RBAC:** sin granularidad nueva. Sigue `rdb.productos` único, se
  resuelve vía rol.

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
