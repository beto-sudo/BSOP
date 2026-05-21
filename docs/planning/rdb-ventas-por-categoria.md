# Iniciativa — Ventas por categoría (RDB)

**Slug:** `rdb-ventas-por-categoria`
**Empresas:** RDB
**Schemas afectados:** `rdb` (vista nueva `v_waitry_productos_categoria`), `erp` (lectura de `productos` + `categorias_producto`; alta de productos-servicio en Sprint 2)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-21
**Última actualización:** 2026-05-21

> Promovida el 2026-05-21 después de revisar el módulo de ventas de RDB
> y estresar la idea con Beto. Gerencia y contabilidad no pueden ver
> las ventas agrupadas por categoría de producto sin exportar el CSV
> por producto y agrupar a mano.

## Problema

El módulo de ventas de RDB (`/rdb/ventas`, `components/ventas/`) lee los
pedidos del POS Waitry y los presenta en dos tabs: **Pedidos** (órdenes
individuales) y **Por producto** (agregado por producto). No hay forma de
ver las ventas **agrupadas por categoría** — gerencia y contabilidad no
pueden responder "¿cuánto vendió el bar vs. los torneos esta semana?"
sin exportar el CSV por producto y agrupar a mano.

La categoría de cada producto vive en
`erp.productos.categoria_id → erp.categorias_producto` (12 categorías
activas en RDB: Cervezas, Licores, Refrescos, Aguas, Bebidas Prep.,
Comida, Snacks, Cigarros, Servicios, Merchandise, Insumos, Otros). Pero
las líneas de venta de Waitry (`rdb.waitry_productos`) no traen
categoría — solo `product_id` (texto) y `product_name`.

## Diagnóstico (2026-05-21)

El enlace producto→categoría que ya usan las vistas de métricas
(`rdb.v_producto_metricas`) es: `rdb.waitry_productos.product_id =
erp.productos.codigo`, luego `erp.productos.categoria_id`. **No** pasa
por `rdb.productos_waitry_map` (esa tabla es para recetas/consumo de
inventario, con `factor_salida`).

Cobertura medida sobre las ~18.5k líneas de venta históricas (toda la
data sincronizada de Waitry cabe en los últimos 90 días):

| Métrica                                   | Cobertura           |
| ----------------------------------------- | ------------------- |
| Líneas de venta que resuelven a categoría | 94.8%               |
| **Importe** que resuelve a categoría      | **75.6%** (~$2.27M) |
| Importe sin categoría                     | ~24% (~$730k)       |

El 24% de importe sin categoría son **servicios deportivos de alto
ticket** no dados de alta en `erp.productos`: Torneo Pádel Open
(~$331k), torneos de tenis (~$150k), Master Class, Academia Tenis,
Rey/Reina de la Cancha, uso de cancha con coach. El catálogo
`erp.productos` está poblado con consumo de bar/restaurante; los
torneos/clases/canchas se cobran en Waitry pero no existen como
producto ERP. El top-15 sin resolver concentra ~$636k (~87% del gap) —
trabajo de datos acotado.

Datos de catálogo relevantes para el diseño de la vista:

- `erp.productos.codigo` **no es único**: 7 códigos duplicados en RDB.
  La vista debe desambiguar el JOIN o multiplicaría líneas de venta.
- 86 productos del catálogo sin `codigo` — nunca enlazan con Waitry
  (esperado; son productos que no se venden por el POS).

## Outcome esperado

- Tercer tab **"Por categoría"** en `/rdb/ventas` que agrega las ventas
  por categoría respetando los filtros de fecha/corte/estado que el
  módulo ya tiene.
- KPI cards + tabla por categoría (categoría, unidades, importe,
  # pedidos, ticket promedio, % del total) + barra comparativa + export
  CSV.
- Fila explícita **"Sin categoría"** con su importe visible — el gap no
  se oculta.
- El catálogo `erp.productos` cubre los servicios deportivos de alto
  ticket → el reporte refleja ≥95% del importe en categorías reales.

## Alcance v1

### Sprint 1 — Vista DB + tab "Por categoría"

- **Migración**: `CREATE VIEW rdb.v_waitry_productos_categoria` —
  `rdb.waitry_productos` enriquecida fila-por-fila con
  `producto_catalogo_id`, `categoria_id`, `categoria_nombre`,
  `categoria_color` vía `LEFT JOIN`. El JOIN código→producto resuelve
  con `DISTINCT ON (codigo)` (priorizando `activo` + más reciente) para
  no multiplicar líneas por los 7 códigos duplicados. `NOTIFY pgrst,
'reload schema';` al final.
- Regenerar `supabase/SCHEMA_REF.md` + `types/supabase.ts`.
- **Componente** `components/ventas/ventas-por-categoria.tsx` — clona el
  patrón de `ventas-por-producto.tsx`: fetch de pedidos válidos del
  rango/corte (vista canónica `v_waitry_pedidos`, excluye cancelados y
  fantasmas) → fetch de líneas de `v_waitry_productos_categoria` en
  chunks de 500 → agrega por `categoria_id` (NULL → "Sin categoría").
  KPI cards + `<DataTable>` con `<CategoriaBadge>` + barra comparativa
  CSS (patrón de `app/rdb/productos/analisis/page.tsx`) + export CSV.
- **`VentasView`**: agregar `'por-categoria'` al tipo `VentasTab` y al
  render de tabs.
- Smoke test e2e en `tests/e2e/smoke/`.

### Sprint 2 — Limpieza del catálogo · top-15 servicios deportivos (paralelo a Sprint 1)

- Dar de alta en `erp.productos` los servicios deportivos del top-15 sin
  resolver, con su `codigo` = `product_id` de Waitry y una
  `categoria_id`.
- **Decisión pendiente para Beto**: ¿los servicios deportivos van todos
  a la categoría existente "Servicios", o conviene crear categorías más
  finas (Torneos / Academias / Uso de cancha) para que el reporte
  distinga el negocio deportivo? CC propone la lista exacta
  `product_id → nombre → categoría`; Beto la aprueba antes de aplicar.
- Migración con los `INSERT` (aditivos, sin `UPDATE`/`DELETE`). Cambio
  de datos en producción → Beto aprueba la asignación final.
- Re-medir cobertura post-alta (objetivo ≥95% del importe).

### Sprint 3 — Cierre

- Verificación en preview por Beto con datos reales.
- Barrido de Reminders.
- Mover la iniciativa a `## Done` en `INITIATIVES.md`.

## Fuera de alcance v1

- **Filtro por categoría** en `VentasFilters` (combobox que filtre
  también los tabs Pedidos / Por producto). Mejora natural de fase 2 —
  se evalúa si emerge la necesidad.
- **Categorización de la cola larga** más allá del top-15 (el ~13%
  restante del gap, importes chicos). Si tras Sprint 2 el "Sin
  categoría" sigue molesto, sub-iniciativa de limpieza.
- **Margen / utilidad por categoría** en el tab de ventas.
  `rdb.v_categoria_resumen` ya da eso con ventana fija de 30 días en
  `/rdb/productos/analisis`. Cruzar costo con rango arbitrario en el tab
  de ventas es scope mayor (requiere costo histórico) — fuera de v1.
- **Cross-empresa.** Solo RDB usa Waitry.
- **Librería de charts.** Se mantiene el patrón de barras CSS del repo.

## Riesgos / impacto en producción

- **Códigos duplicados (7 en RDB).** Sin desambiguar, el `LEFT JOIN`
  multiplica líneas de venta e infla el importe. Mitigación:
  `DISTINCT ON (codigo)` en la vista. Verificar en el smoke que el
  importe total del tab "Por categoría" cuadra con el de "Por producto".
- **Vista aditiva, bajo riesgo.** `CREATE VIEW` nuevo, no toca tablas ni
  vistas existentes. Reversible con `DROP VIEW`.
- **Sprint 2 toca datos en producción.** Alta de productos en
  `erp.productos`. Mitigación: Beto aprueba la lista exacta antes de
  aplicar; los `INSERT` son aditivos; el `codigo` nuevo no colisiona
  (son `product_id` de Waitry que hoy no existen en el catálogo).
- **Drift de SCHEMA_REF.** Tras cada migración, regenerar
  `SCHEMA_REF.md` + `types/supabase.ts` (regla del repo, enforced por
  pre-commit hook + CI).

## Métricas de éxito

- Gerencia / contabilidad obtiene el desglose de ventas por categoría
  para cualquier rango/corte sin exportar a mano (señal cualitativa).
- Post-Sprint 2: ≥95% del importe de ventas atribuido a una categoría
  real (vs 75.6% hoy).
- El importe total del tab "Por categoría" cuadra ±$0 con el del tab
  "Por producto" para el mismo rango (consistencia — ambos parten del
  mismo conjunto de pedidos válidos).

## Sprints / hitos

- **Sprint 1 — Vista DB + tab "Por categoría".** ✅ Entregado.
- **Sprint 2 — Limpieza del catálogo (servicios deportivos).** ✅ Entregado.
- **Sprint 3 — Cierre.** Pendiente verificación visual de Beto en preview.

## Decisiones registradas

### 2026-05-21 · Promoción a iniciativa

Beto pidió revisar el módulo de ventas de RDB para sacar reportes por
categoría de productos. Tras diagnóstico contra la DB de producción
(read-only):

- **Alcance v1**: tab "Por categoría" + limpieza del top-15 sin
  resolver, en paralelo. Beto eligió esta opción sobre "solo bucket Sin
  categoría sin tocar catálogo" y "limpiar todo el catálogo antes del
  tab".
- **Enfoque técnico**: vista DB `v_waitry_productos_categoria` que
  concentra el JOIN producto→categoría, consumida client-side igual que
  hoy se consume `waitry_productos`. Sobre un enfoque client-only puro:
  la vista mantiene la lógica de negocio (matching, desambiguación de
  códigos) en un solo lugar y la hace reusable (el tab "Por producto"
  podría mostrar la categoría de cada producto sin lógica nueva).
- **Slug `rdb-ventas-por-categoria`** — prefijo `rdb-` porque solo RDB
  usa Waitry.

## Bitácora

### 2026-05-21 · Promoción

Doc de planning creado + fila agregada a `INITIATIVES.md` (estado
`planned`). Diagnóstico de cobertura corrido contra la DB de producción:
94.8% de las líneas / 75.6% del importe resuelven a categoría hoy.
Próximo: Sprint 1 (vista DB + tab).

### 2026-05-21 · Sprint 1 — vista DB + tab "Por categoría" (este PR)

Migración `20260521151757_rdb_v_waitry_productos_categoria.sql`: vista
`rdb.v_waitry_productos_categoria` (`security_invoker=on`) que enriquece
cada línea de `waitry_productos` con su categoría vía CTE
`DISTINCT ON (codigo)`. Verificación inline en la migración confirma que
la vista es 1:1 con la tabla base (sin multiplicar por los 7 códigos
duplicados). Aplicada a producción; `SCHEMA_REF.md` + `types/supabase.ts`
regenerados.

Componente `components/ventas/ventas-por-categoria.tsx` clonando el
patrón de `ventas-por-producto.tsx`, + tercer tab "Por categoría" en
`VentasView`. Smoke test `auth-rdb-ventas.spec.ts` extendido. Verificado
contra datos reales vía la vista: el desglose da Servicios 38% · Sin
categoría 24.7% · Cervezas 10.2% · resto del bar/restaurante. La
verificación visual del tab queda para Beto en preview.

Estado de la iniciativa: `planned → in_progress`. Próximo: Sprint 2
(limpieza del catálogo — requiere decisión de Beto sobre el mapeo de
categorías de los servicios deportivos del top-15).

### 2026-05-21 · Sprint 2 — alta de servicios deportivos en el catálogo (este PR)

Migración `20260521164159_rdb_ventas_categoria_alta_servicios_deportivos.sql`:
3 categorías nuevas en `erp.categorias_producto` (Torneos, Academias,
Uso de cancha — orden 91-93) + 19 productos en `erp.productos` con
`codigo` = `product_id` de Waitry. Lista revisada y aprobada
explícitamente por Beto antes de aplicar.

Hallazgo: Waitry **reutiliza `product_id`** entre productos (ej. 1298687
factura "Torneo Pádel Open" y "Torneo Master Class"). Por eso se dio de
alta 1 producto por `product_id` distinto, con nombre representativo;
todos los IDs reusados agrupan productos de la misma familia, así que la
categoría sale correcta. El mapping estable es alcance de la iniciativa
`rdb-waitry-catalog-sync`.

Cobertura post-alta (verificada vía la vista): "Sin categoría" bajó de
24.7% a **2.1%** del importe; el ~98% restante quedó categorizado.
Torneos quedó en 19.4% (~$575k), Academias y Uso de cancha en 1.6% c/u.
Supera la meta de ≥95%.

Próximo: Sprint 3 — verificación visual de Beto en preview y cierre.
