# Iniciativa — Productos · Config + Reportes (RDB)

**Slug:** `rdb-productos-config-reportes`
**Empresas:** RDB (v1); diseñada para enchufar otras cuando aplique
**Schemas afectados:** `erp` (productos, producto_receta), `rdb` (v_productos_tabla)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-29
**Última actualización:** 2026-04-29

> Promovida a iniciativa el 2026-04-29 después de estresar la idea con
> Beto. La gerencia del Deportivo Rincón del Bosque y contabilidad no
> tienen visibilidad sobre cómo están configurados los productos:
> qué recetas existen, qué insumos consumen, en qué cantidad y con
> qué margen vs el precio de venta. La información existe en
> `erp.producto_receta` + `rdb.v_productos_tabla` (último costo, último
> precio) pero no hay pantallas que la expongan ni reportes que la
> auditen — la edición de receta vive enterrada en el drawer del
> producto en `app/rdb/productos/page.tsx`.

## Problema

La gerencia del deportivo (RDB) y contabilidad no tienen forma de:

1. **Ver qué recetas existen** y qué insumos consume cada una, en qué
   cantidad y unidad — hoy solo se ve abriendo el drawer producto por
   producto en el catálogo.
2. **Ver el costo real de una receta** calculado a partir del último
   costo de cada insumo, vs el precio de venta del producto vendible →
   margen visible.
3. **Auditar la configuración**: productos vendibles con receta
   margen-negativo, recetas con insumos sin costo conocido, productos
   vendibles sin receta cuando se esperaría tenerla.
4. **Editar masivamente cantidades de receta** — hoy se edita una
   receta a la vez en el drawer del producto.

Datos del schema (al 2026-04-29):

- `erp.producto_receta` — `producto_venta_id`, `insumo_id`, `cantidad`,
  `unidad`, `notas`. La tabla canónica de "qué insumos consume cada
  producto vendible".
- `rdb.v_productos_tabla` — view ya existente con `ultimo_costo` (de
  movimientos recientes) y `ultimo_precio_venta`. Es la fuente
  pragmática para Sprint 1; precisión vs realidad operativa puede
  refinarse después.
- `erp.productos.parent_id` + `factor_consumo` — modelo legacy de
  porcionamiento que se planeaba usar en paralelo a recetas, pero
  Beto confirmó (2026-04-29) que **el modelo de recetas cubre el caso
  de uso completo** (botella → trago = receta de 1 insumo). Las
  columnas quedan candidatas a deprecar en sub-iniciativa aparte
  (requiere auditar consumidores: la view `rdb.v_productos_grupo`,
  posibles queries, datos vivos a migrar a recetas).

El gap es **100% UI + reportes**, no schema.

## Outcome esperado

Gerencia RDB y contabilidad pueden auditar la configuración de
productos sin escalar consultas:

- Listado consolidado de **recetas existentes** con #insumos, costo
  calculado, precio de venta y margen.
- Drawer detalle por receta con la lista completa de insumos
  (cantidad, unidad, costo unitario, costo subtotal, total).
- **Reporte de huecos**: recetas con margen negativo, recetas sin
  costo conocido (algún insumo sin `ultimo_costo`), recetas con
  insumos eliminados.
- **Edición masiva** de cantidades de receta (sin tener que entrar
  producto por producto).

Componentes en `components/productos/` shared para que cuando otra
empresa requiera el módulo, sumar pages bajo `app/<empresa>/productos/`
cueste decenas de líneas, no centenas — siguiendo la convención
`shared-modules-refactor` (ADR-011).

## Alcance v1

### Sprint 1 — Vista Recetas (read-only) ✅ entregable en este PR

- [x] Layout `app/rdb/productos/layout.tsx` con `<RoutedModuleTabs>`
      (ADR-005): **Catálogo / Recetas / Análisis**. Productos pasa de
      1 page a módulo con sub-tabs sin sumar entradas al sidebar.
- [x] Página `/rdb/productos/recetas` con `<DataTable>` listando los
      productos vendibles que tienen al menos un renglón en
      `erp.producto_receta`.
- [x] Columnas: producto vendible (con categoría), # insumos, costo
      receta, precio venta, margen (%) con color por umbral
      (rojo / ámbar / verde).
- [x] Filtros con `useUrlFilters` (ADR-007): búsqueda libre (matchea
      producto, categoría, insumos) y toggle "solo margen negativo".
- [x] `<DetailDrawer>` (size `lg`, ADR-018) con tabla de insumos:
      nombre, cantidad, unidad, costo unitario, subtotal, total.
- [x] Costo del insumo: **opción (a)** confirmada con Beto —
      `rdb.v_productos_tabla.ultimo_costo`. Insumos sin costo dejan la
      receta sin costo total (UI muestra "—" en vez de fingir un
      número incorrecto).
- [x] Smoke test e2e en
      `tests/e2e/smoke/auth-rdb-productos-recetas.spec.ts`.

### Sprint 2 — Reporte de auditoría / validación ✅ entregable en este PR

- [x] Página `/rdb/productos/auditoria` como sub-tab del módulo
      Productos (4ta tab — Catálogo / Recetas / Auditoría / Análisis).
- [x] Refactor: `lib/productos/recetas.ts` extrae types + helpers
      `fetchRecetas()` + `auditarRecetas()` para que Recetas y
      Auditoría compartan lógica.
- [x] 4 alerts en v1 (todas derivables 100% de los datos):
  - **Crítico**: receta con margen negativo (costo > precio_venta).
  - **Warning**: receta con insumo huérfano (eliminado del catálogo).
  - **Warning**: receta con algún insumo sin `ultimo_costo`.
  - **Warning**: receta con insumo no inventariable.
- [x] Click en alert → `/rdb/productos/recetas?focus=<id>` abre el
      drawer canónico de la receta. Recetas page detecta `?focus` y
      auto-abre el drawer al cargar.
- [x] Summary cards arriba: # críticas · # warnings · # recetas
      auditadas.
- [x] Filtros: search libre + select severidad + select tipo de
      alerta (con `useUrlFilters`).
- **Heurística "producto sin receta esperada" deferida**: requiere
  decisión sobre qué señal usar (categoría, flag, regla derivada) y
  datos operativos para calibrar. Sprint posterior cuando emerja
  necesidad.

### Sprint 3 — Edición de recetas en su drawer ✅ entregable en este PR

- [x] `<RecetasEditor>` shared en `components/productos/` — editor
      inline reutilizable. Controla rows (insumos), cantidades, unidad,
      add/remove. Persiste vía `upsertReceta` (server action existente
      del Catálogo, reusada).
- [x] Drawer del Recetas page con 2 modos: lectura (default) y
      edición. Botón "Editar receta" en header del drawer cambia a
      modo edición; el editor exibe Cancelar / Guardar receta.
- [x] Validación cliente: cantidad > 0 + no self-reference + no
      duplicados. Validación servidor existe en `upsertReceta` (cubre
      RDB-only + cantidad > 0 + insumo inventariable).
- [x] `useDirtyConfirm` interno en el editor: `Cancelar` con cambios
      dispara confirm nativo. Guardar exitoso refresca recetas + sale
      de modo edición + drawer queda abierto con datos actualizados.
- [x] `fetchInsumosDisponibles()` agregado al lib para poblar el
      combobox de insumos disponibles (productos inventariables
      activos de RDB).
- [x] Smoke test e2e
      `tests/e2e/smoke/auth-rdb-productos-recetas-edit.spec.ts`.

Decisiones técnicas tomadas:

- **Editor custom (no `<Form>` v1)**: el editor tiene N filas
  dinámicas de insumos. RHF + `useFieldArray` no fue expuesto en
  `<Form>` v1 (ver iniciativa `wizard-pattern` separada). Editor
  custom es más liviano y no contamina la API de `<Form>`. Si emerja
  necesidad de reuso en otros casos similares, se evalúa migrar
  cuando wizard-pattern arranque.
- **Audit trail diferido**: `producto_receta` no tiene trigger de
  auditoría hoy. Sin trigger en este PR (cambios DB los aplica Beto
  manualmente; un trigger de auditoría es scope propio que merece
  decisión sobre granularidad y formato del log). El server action
  `upsertReceta` queda como punto único de mutación, lo que hace que
  agregar audit trail después sea un solo cambio.
- **Editor reusable** en `components/productos/` (shared) para que
  cuando otra empresa entre al módulo, el editor cueste poco
  reutilizar (siguiendo convención `shared-modules-refactor`,
  ADR-011).

### Sprint 4 — Cierre

- [ ] Verificar visualmente las 4 tabs del módulo Productos (Catálogo
      / Recetas / Auditoría / Análisis) en preview con datos reales.
- [ ] Confirmar que `rdb.productos` cubra todas las rutas en
      `ROUTE_TO_MODULE` ([lib/permissions.ts](../../lib/permissions.ts)).
- [ ] Closeout: bitácora, sweep de Reminders, mover iniciativa a
      `## Done` en `INITIATIVES.md` con outcome resumido.

### Follow-ups (sub-iniciativas pendientes, no v1)

- **Audit trail de `producto_receta`**: agregar trigger SQL para
  registrar cambios al editar receta. Decidir formato del log
  (tabla audit canónica del repo, granularidad, retención).
- **Deprecación `parent_id` + `factor_consumo`** de `erp.productos`:
  auditar consumidores (`v_productos_grupo`, otras queries),
  migrar datos vivos a `erp.producto_receta`, DROP columnas + view.
- **Heurística "producto sin receta esperada"** para Auditoría:
  decidir señal (categoría, flag, regla derivada) cuando haya
  datos operativos para calibrar.

## Fuera de alcance v1

- **Vista de Padres-Hijos** (`erp.productos.parent_id` +
  `factor_consumo`). Confirmado con Beto el 2026-04-29: el modelo de
  recetas cubre el caso de uso completo (botella → trago = receta de
  1 insumo con cantidad). Las columnas `parent_id` y `factor_consumo`
  quedan **candidatas a deprecar**, sub-iniciativa aparte:
  - Auditar consumidores: `rdb.v_productos_grupo` (view), queries
    posibles en otros módulos, datos vivos en `erp.productos` con
    `parent_id` no nulo.
  - Migrar datos vivos de padres-hijos a `erp.producto_receta` (un
    hijo con `factor_consumo = N` se vuelve una receta de 1 insumo
    con `cantidad = N`).
  - DROP `parent_id` + `factor_consumo` + view `v_productos_grupo`.
  - Requiere migración SQL aplicada por Beto + regeneración de
    SCHEMA_REF + types.
- **Cross-empresa rollout** (ANSA / COAGAN / DILESA). Los componentes
  se construyen pensados para reutilizarse, pero la liberación v1 es
  **solo RDB**. Cuando otra empresa requiera el módulo, será sub-iniciativa.
- **Wizard de alta masiva de recetas** (importar desde CSV / Excel).
  Si la operación de carga inicial lo amerita, se evalúa como
  sub-iniciativa.
- **RBAC granular nuevo** (`rdb.productos.recetas`,
  `rdb.productos.auditoria`, etc.). Confirmado con Beto 2026-04-29:
  por ahora todo bajo `rdb.productos` único, se resuelve vía rol.
- **Histórico de cambios de receta** (versionado). Audit trail básico
  entra en Sprint 3, pero un sistema de versiones de receta queda
  fuera v1.
- **Drift consumo real vs configurado** (comparar lo que la receta
  dice que se consume vs los movimientos de inventario reales).
  Reporte separado, evaluar después de v1.

## Bloqueos / Dependencias

- **Costo del insumo precisión** (ya decidido v1): `ultimo_costo` de
  `rdb.v_productos_tabla` puede estar stale o desviado del costo
  promedio real. Para v1 es suficiente; si Sprint 2 (auditoría)
  expone problemas reales con datos, considerar costo ponderado vía
  RPC en sprint posterior.
- **Unidades**: `producto_receta.unidad` puede no coincidir con
  `productos.unidad` del insumo. El cálculo costo_subtotal =
  ultimo_costo × cantidad asume coincidencia. Para v1 lo dejamos así
  y la UI lo señala visualmente cuando difiere ("unidad base: X" en
  el drawer). Conversión real entra en Sprint 3 si se vuelve común.
- **Patron de audit trail** (Sprint 3): verificar si `producto_receta`
  ya tiene trigger o si lo agregamos.
- **Deprecación padres-hijos** (sub-iniciativa): NO se toca schema en
  esta iniciativa, queda como follow-up.

## Métrica de éxito

- Gerencia RDB + contabilidad operan sin escalar consultas de
  configuración de productos a Beto / Claude (señal cualitativa).
- Reporte de auditoría (Sprint 2) llega a **0 alerts críticas
  pendientes** dentro de las primeras 4 semanas post-Sprint 2 — el
  closing del backlog inicial es la señal de que el reporte funciona
  y la operación lo está usando.
- Productos con margen negativo se vuelven visibles y accionables
  (count baja mes a mes).

## Sprints / hitos

### Sprint 1 — Vista Recetas (read-only) · 2026-04-29

**Estado:** mergeado pendiente · PR Sprint 1 (este PR).

Entregable:

- Layout `app/rdb/productos/layout.tsx` con `<RoutedModuleTabs>` y 3
  tabs: **Catálogo** (`/rdb/productos`) · **Recetas**
  (`/rdb/productos/recetas`) · **Análisis** (`/rdb/productos/analisis`).
  Sidebar entry "Productos" del módulo Inventario sigue siendo único
  (las sub-tabs no agregan nada al sidebar).
- Página `/rdb/productos/recetas` con `<DataTable>` consumiendo
  `erp.producto_receta` joined con `rdb.v_productos_tabla` (costo +
  precio).
- Columnas: producto + categoría · #insumos · costo receta · precio
  venta · margen (con color por umbral).
- Filtros con `useUrlFilters` (ADR-007): búsqueda libre y toggle
  "solo margen negativo".
- `<DetailDrawer>` (size `lg`, ADR-018) con tabla de insumos: nombre,
  cantidad, unidad, costo unitario, subtotal, total. Indica unidad
  base del insumo cuando difiere de la unidad de receta.
- Smoke test e2e en `tests/e2e/smoke/auth-rdb-productos-recetas.spec.ts`.

Cierre técnico:

- Costo del insumo viene de `rdb.v_productos_tabla.ultimo_costo`
  (opción a, decisión Beto 2026-04-29). Insumos sin costo dejan la
  receta sin costo total — UI muestra "—" en vez de fingir.
- Recetas huérfanas (producto vendible eliminado) se filtran y no
  rompen render.
- `<RequireAccess empresa="rdb" modulo="rdb.productos">` en cada page
  individual (defense in depth) — no en el layout para no contaminar
  el árbol con un wrapper extra.
- Edición de receta sigue viviendo en la pestaña Catálogo, en el
  drawer del producto. Edición masiva consolidada llega en Sprint 3.

### Sprint 2 — Reporte de auditoría · 2026-04-29

**Estado:** mergeado pendiente · PR Sprint 2 (este PR).

Entregable:

- Refactor `lib/productos/recetas.ts`: types `ProductoInfo`,
  `InsumoReceta`, `Receta`, `RecetaAlert` + helpers `fetchRecetas()`,
  `auditarReceta()`, `auditarRecetas()`, `alertLabel()`. Recetas y
  Auditoría comparten lógica sin duplicar.
- Nueva sub-tab "Auditoría" en el layout (4 tabs: Catálogo / Recetas
  / Auditoría / Análisis).
- Página `/rdb/productos/auditoria` con summary cards (críticas /
  warnings / recetas auditadas), DataTable de alerts, filtros con
  `useUrlFilters` (search + severidad + tipo).
- 4 tipos de alerta: margen negativo (crítico), insumo huérfano,
  insumo sin costo, insumo no inventariable (warnings).
- Click en alert → `/rdb/productos/recetas?focus=<id>` abre drawer
  canónico de la receta.
- Recetas page actualizado: detecta `?focus=<id>` y auto-abre el
  drawer al cargar (deep-link compartible).
- Smoke test e2e en
  `tests/e2e/smoke/auth-rdb-productos-auditoria.spec.ts`.

Decisiones técnicas tomadas:

- **Sub-tab "Auditoría"** (no dentro de Análisis que ya tiene ~800
  líneas).
- **4 alerts en v1** todas 100% derivables de los datos. Heurística
  "producto sin receta esperada" deferida porque requiere calibración
  con datos operativos.
- **Deep-link via URL** (`?focus=<id>`) en lugar de duplicar el
  drawer en Auditoría: una sola fuente de verdad para el detalle de
  receta, URL compartible.
- **Insumos huérfanos visibles en Recetas** (en rojo dentro del
  drawer) para que el operador los identifique sin ir solo a
  Auditoría.

### Sprint 3 — Edición masiva de recetas (próximo)

Pendiente de arrancar. Decisiones técnicas a cerrar al arrancar:

- ¿Vista de edición sobre la misma página de Recetas (toggle "modo
  edición") o sub-tab dedicada?
- Audit trail: verificar si `producto_receta` ya tiene trigger de
  auditoría o si lo agregamos.

## Decisiones registradas

### 2026-04-29 · Promoción a iniciativa

Beto promovió la idea a iniciativa después de estresar el alcance.
Decisiones tomadas en la conversación de promoción:

- **Slug:** `rdb-productos-config-reportes` — prefijo `rdb-` porque
  outcome v1 es 100% RDB. Componentes shared en `components/productos/`
  para que cross-empresa cueste poco después.
- **Reportes en alcance:** validación de configuración (a) + análisis
  costo/margen (b). Drift consumo real vs configurado (c) **fuera de
  v1**.
- **Empresas:** RDB only v1. Componentes shared para enchufar otras
  empresas barato cuando llegue el caso.
- **RBAC:** sin granularidad nueva. Sigue `rdb.productos` único, se
  resuelve vía rol.

### 2026-04-29 · Padres-Hijos descartado de v1 · Recetas absorbe el caso

Beto revisó el preview del Sprint 1 (vista Padres-Hijos) y aclaró que
el modelo de recetas cubre el caso de uso completo: un trago "consume"
de la botella exactamente como una margarita "consume" tequila — son
recetas. Padres-Hijos en `erp.productos` queda candidato a deprecar
en sub-iniciativa aparte (requiere auditoría de consumidores y
migración de datos antes de DROP).

Cambios en este Sprint 1:

- Vista de Recetas reemplaza la vista de Grupos.
- Tab del módulo Productos: **Catálogo / Recetas / Análisis** (sin
  Grupos).
- Schemas afectados ajustados: ya no consumimos `v_productos_grupo`.

### 2026-04-29 · Costo del insumo (Sprint 1) — ultimo_costo

Confirmado con Beto: `rdb.v_productos_tabla.ultimo_costo` es la
fuente para v1. Es lo más simple y suficiente para que gerencia +
contabilidad vean orden de magnitud del margen. Si Sprint 2 expone
desviaciones que confunden la auditoría, considerar costo ponderado
en sprint posterior.

## Bitácora

### 2026-04-29 · Sprint 1 mergeado pendiente · transición proposed → in_progress

PR Sprint 1 (este PR). Originalmente arrancó como vista Padres-Hijos
sobre `rdb.v_productos_grupo`. Layout con tabs (ADR-005). Smoke test
creado. Estado de iniciativa cambia a `in_progress`.

### 2026-04-29 · Sprint 1 corrección post-review · sub-tabs en vez de sidebar entry

Beto revisó el preview y apuntó que Grupos no debe ser entrada
separada en sidebar — debe vivir como sub-tab del módulo Productos
(ADR-005). Sidebar entry removida; `/rdb/productos/grupos` removido
de `ROUTE_TO_MODULE`; `h1` redundante removido del page.

### 2026-04-29 · Sprint 3 mergeado pendiente · Edición de recetas

PR Sprint 3 (este PR). `<RecetasEditor>` shared en
`components/productos/` con add/remove/edit de insumos + Save/Cancel +
dirty confirm. Drawer del Recetas page con modo lectura ↔ edición vía
botón "Editar receta". `fetchInsumosDisponibles()` agregado al lib
para poblar combobox. Validación cliente (cantidad > 0, no
duplicados, no self-reference) + servidor (`upsertReceta` existente).
Editor custom (no RHF) porque `<Form>` v1 no expone `useFieldArray`
— eso queda para iniciativa `wizard-pattern`. Audit trail diferido
como follow-up. Próximo: Sprint 4 (cierre) cuando Beto lo desbloquee.

### 2026-04-29 · Sprint 2 mergeado pendiente · Auditoría

PR Sprint 2 (este PR). Sub-tab "Auditoría" en módulo Productos con
reporte de huecos sobre recetas. Refactor: `lib/productos/recetas.ts`
extrae types + helpers para que Recetas y Auditoría compartan lógica
(antes el `computeReceta` y los types vivían inline en
`recetas/page.tsx`). 4 alerts implementadas; heurística "producto sin
receta esperada" deferida por requerir calibración con datos
operativos. Click en alert → `/rdb/productos/recetas?focus=<id>` abre
drawer canónico (deep-link compartible). Próximo: Sprint 3 (edición
masiva de recetas) cuando Beto lo desbloquee.

### 2026-04-29 · Sprint 1 redirección · Recetas reemplaza Padres-Hijos

Segunda revisión de preview. Beto observó que Padres-Hijos y Recetas
no son lo mismo y que el modelo de recetas cubre el caso de uso real.
Reescritura del Sprint 1:

- Borrada `app/rdb/productos/grupos/page.tsx`; creada
  `app/rdb/productos/recetas/page.tsx` con vista nueva sobre
  `erp.producto_receta` + `rdb.v_productos_tabla`.
- Renombrado smoke test: `auth-rdb-productos-grupos.spec.ts` →
  `auth-rdb-productos-recetas.spec.ts`.
- Layout actualizado: tab "Grupos · Padres-Hijos" → "Recetas".
- Plan de iniciativa reordenado: Sprint 2 ahora es Reporte de
  auditoría (subió de Sprint 4); Sprint 3 ahora es Edición masiva
  de recetas (en lugar de configuración masiva de factores). Vista
  de Padres-Hijos descartada de v1 con nota de deprecación pendiente
  de las columnas `parent_id` + `factor_consumo`.
