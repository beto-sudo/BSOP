# Iniciativa — Costo y precio del catálogo RDB desde realidad operativa

**Slug:** `rdb-productos-precios-realidad`
**Empresas:** RDB
**Schemas afectados:** `rdb` (vista `v_productos_tabla`), lectura de `erp.ordenes_compra_detalle` + `rdb.waitry_productos`
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-30
**Última actualización:** 2026-04-30 (Sprint 1 ejecutado en modo autónomo — migración `20260430130000_rdb_v_productos_tabla_costo_precio_realidad.sql` lista para que Beto aplique con psql; regeneración de SCHEMA_REF + types + smoke en preview pendientes post-apply).

## Problema

La pantalla [`/rdb/productos`](../../app/rdb/productos/page.tsx) muestra
columnas **Costo**, **Precio** y **Margen** que se calculan en la vista
[`rdb.v_productos_tabla`](../../supabase/migrations/20260425035021_productos_categorias_y_limpieza.sql:302).
La vista lee `costo` y `precio_venta` de un solo lugar:

```sql
LEFT JOIN erp.productos_precios pp
  ON pp.producto_id = p.id AND pp.vigente = true
```

`erp.productos_precios` es una tabla de historial estilo SCD (una fila
por producto con `vigente=true` que se considera el precio "oficial").
Beto observó dos síntomas:

1. **Muchos productos en $0** (servicios, productos físicos, recién
   creados). Hoy 318 productos en el catálogo de RDB, parte significativa
   con costo o precio en cero.
2. **No es claro cómo se llenó ni quién la mantiene.** El "Costo"
   no es el último costo de compra (no se actualiza al cerrar OC ni al
   recibir mercancía). El "Precio" no es el último precio cobrado en
   Waitry. Es un snapshot.

Investigación confirma:

- **Origen de la data**: cargada **una sola vez** en
  [`20260414000002_erp_migrate_rdb_data_phase1.sql:127`](../../supabase/migrations/20260414000002_erp_migrate_rdb_data_phase1.sql:127)
  desde `rdb.productos` (tabla del sync de Waitry POS), filtrando con
  `WHERE costo_unitario IS NOT NULL OR precio IS NOT NULL`. Lo que tenía
  Waitry capturado entró; lo demás quedó sin fila → la vista LEFT JOIN
  devuelve NULL → la UI muestra `$0.00`.
- **Quién la actualiza**: solo
  [`app/rdb/productos/page.tsx:455`](../../app/rdb/productos/page.tsx:455)
  cuando se crea producto nuevo con precio > 0 desde la UI.
- **Lo que NO la actualiza**: cierre de OC, recepción de mercancía
  (`erp.movimientos_inventario`), venta en Waitry (`rdb.waitry_productos`),
  ningún trigger, ningún job. Búsqueda exhaustiva confirma que no hay
  ninguna escritura adicional a `erp.productos_precios` desde abril.

Resultado operativo: el catálogo refleja un snapshot de abril 2026, no
la realidad. Los costos no se mueven cuando el proveedor cambia precio
en una OC nueva. Los precios no se mueven cuando bartender ajusta en
Waitry. La columna **Margen** está calculada sobre data muerta.

## Outcome esperado

- **`Costo` refleja el último costo realmente pagado** — `precio_unitario`
  de la última línea de OC en estado `recibida` o `cerrada`, por
  producto. Si nunca se ha comprado, NULL → se muestra "—" en vez de
  $0.00.
- **`Precio` refleja el último precio realmente cobrado** — `unit_price`
  del último `rdb.waitry_productos` por producto (match por `codigo` =
  `product_id`). Si nunca se ha vendido, NULL → "—" en vez de $0.00.
- **`Margen` se calcula con esos valores** y solo cuando ambos existen.
  Productos sin venta o sin compra muestran "—" en margen, lo cual es
  más informativo que `$0.00 / $0.00`.
- **`erp.productos_precios` se preserva** como tabla de overrides
  manuales / lista oficial — la pantalla podría exponerla en el futuro
  (ej. botón "Forzar precio oficial $X distinto al último cobrado"),
  pero no para v1.
- **El catálogo deja de mentir.** Ops puede confiar en lo que ven.

## Alcance v1 (Opción A — solo cambiar la vista)

### Sprint 0 — Promoción

- [x] Doc de planning + fila en `INITIATIVES.md` con estado `planned`.

### Sprint 1 — Cambiar vista `rdb.v_productos_tabla`

- [x] **Migración** creada:
      [`supabase/migrations/20260430130000_rdb_v_productos_tabla_costo_precio_realidad.sql`](../../supabase/migrations/20260430130000_rdb_v_productos_tabla_costo_precio_realidad.sql)
      con `CREATE OR REPLACE VIEW rdb.v_productos_tabla` (preserva
      `SECURITY INVOKER`). Implementación final con dos CTEs:
  - **`ultimo_costo_oc`**: `DISTINCT ON (producto_id)` sobre
    `erp.ordenes_compra_detalle` JOIN `erp.ordenes_compra` filtrado por
    `oc.estado IN ('recibida','cerrada')` + `empresa_id = RDB`. Costo =
    `COALESCE(ocd.precio_real, ocd.precio_unitario)` (preserva el
    override admin del Sprint 3 de `oc-recepciones`). Ranking por
    `COALESCE(oc.cerrada_at, oc.autorizada_at, ocd.created_at) DESC` —
    si `cerrada_at` existe es lo más representativo de "cuándo se
    concretó", `autorizada_at` cubre OC enviada/parcial/recibida sin
    cerrar todavía, `created_at` de la línea es fallback.
  - **`ultimo_precio_waitry`**: `DISTINCT ON (product_id)` sobre
    `rdb.waitry_productos` filtrado por `product_id IS NOT NULL` +
    `unit_price > 0` (excluye cortesías/ajustes en cero). Precio =
    `wp.unit_price`. Ranking por `wp.created_at DESC` (fecha de
    ingestión; suficientemente representativa — si hay drift con
    `pedido.timestamp`, follow-up).
  - **`margen_pct`**: `NULL` cuando `ultimo_precio_venta` o
    `ultimo_costo` son NULL (más honesto que mostrar 100% cuando no
    hay costo conocido).
- [x] **Índices verificados**: `idx_ordenes_compra_detalle_producto_id`
      (Sprint 4 FK indexes) + `waitry_productos_product_id_idx`
      (bootstrap) cubren los `DISTINCT ON` por producto. No se agregan
      compuestos `(producto_id, fecha DESC)` para v1 — la escala
      actual (cientos de líneas en `ordenes_compra_detalle`, miles en
      `waitry_productos`) tolera el sort secundario en memoria. Si el
      smoke detecta lentitud > 200ms, follow-up con índices compuestos.
- [ ] **Aplicar migración con psql** (Beto, manual — regla operativa
      del repo; harness bloquea apply desde CC).
- [ ] **Regenerar SCHEMA_REF + types** post-apply: `npm run schema:ref` + `npm run db:types`. Las views aparecen como `_(view)_` en
      SCHEMA_REF y como tipos generados en `types/supabase.ts`.
- [x] **CI verde** en pre-push: typecheck + test:run + lint +
      format:check (los 4 checks que corre CI). El SQL no se valida en
      CI sin DB live; el chequeo real es post-apply.
- [ ] **Smoke test manual en preview**: tras apply, abrir
      `/rdb/productos`, validar que productos con OCs recibidas
      muestran costo distinto a $0 y que productos vendidos en Waitry
      muestran precio. Comparar 5-10 productos contra realidad
      esperada. Productos sin compra ni venta deben mostrar "—".

### Sprint 2 — Cierre

- [ ] **Bitácora + Decisiones registradas** del doc de planning.
- [ ] **`INITIATIVES.md`** transiciona `planned → done`, fila se mueve
      a `## Done`.
- [ ] **Reminders** de la lista `Claude: BSOP` relacionados a esta
      iniciativa: completar (sub-tareas mueren con la iniciativa).

## Fuera de alcance

- **Opción B (triggers que mantienen `productos_precios` al día)**.
  Más complejo, más estado, mismo outcome. Si en el futuro queremos un
  override manual oficial distinto al último-cobrado, ahí sí
  reconsideramos triggers — pero para v1, la vista es suficiente y
  refleja realidad sin estado adicional.
- **UI para override manual de precio** (ej. "este producto cuesta $X
  oficialmente, ignora la última venta"). Útil cuando se quiere
  cambiar precio antes de que se refleje en Waitry, pero requiere
  diseñar la UX de "vigente vs último cobrado" — postergado hasta que
  emerja la necesidad.
- **Multi-empresa rollout**. La vista es 100% RDB-específica
  (`empresa_id` hardcoded + JOIN con `rdb.waitry_productos`). Si
  DILESA/COAGAN/ANSA en el futuro tienen su propio catálogo con
  fuente operativa de costos/precios, se hace su propia vista — esta
  no se generaliza.
- **Histórico vs. último**. La vista solo expone "el último". Si ops
  quiere ver "cómo cambió el costo en el tiempo", eso vive en la sub-tab
  Análisis (iniciativa `rdb-productos-config-reportes`, cerrada) o
  tab Auditoría — fuera de v1.
- **Cambio en `erp.productos_precios`**. La tabla se preserva intacta.
  No se borra, no se trunca, no se cambia el schema. Sigue siendo la
  fuente del producto creado desde la UI con precio > 0 (que se queda
  como override manual implícito por ahora).

## Métricas de éxito

- **Productos con costo o precio en $0 baja significativamente**:
  hoy ~50%+ visualmente. Tras el cambio, solo productos sin OC y sin
  venta deberían quedar en "—" (que es honesto). El conteo concreto
  se valida post-rollout.
- **Coincidencia con realidad operativa**: para 5-10 productos
  spot-checked manualmente, el costo mostrado coincide con el
  `precio_unitario` de la última OC recibida y el precio coincide con
  el `unit_price` del último `rdb.waitry_productos`.
- **Margen sin falsos negativos**: productos con margen mostrado como
  "—" son los que realmente no tienen ambos lados (compra y venta), no
  artefactos del seed de abril.
- **Performance preservada**: la vista responde en < 200ms con 318
  productos. Validar con `EXPLAIN ANALYZE` antes de mergear.

## Riesgos / preguntas abiertas

- [ ] **Recepción vs. orden cerrada**: ¿qué evento "fija" el costo —
      cuando la OC pasa a `recibida` (puede ser parcial) o a `cerrada`?
      Decisión Sprint 1: usar **última línea con OC en
      `('recibida','cerrada')`** porque desde Sprint 1 de
      `oc-recepciones` esos estados implican que el costo se concretó.
      `parcial` queda fuera para evitar oscilación si una recepción
      parcial cambió de precio antes de la final.
- [ ] **Waitry tiene precios distintos por evento (happy hour, promos)**:
      `unit_price` puede variar. Mostrar "el último cobrado" es más
      útil que un promedio porque refleja el precio actual del POS. Si
      ops quiere "precio promedio últimos 30d" o similar, eso es un
      follow-up con sub-tab nueva.
- [ ] **Productos eliminados / inactivos en Waitry**: si un producto
      dejó de venderse en Waitry hace meses, su precio quedará
      congelado en el último valor. Aceptable — el filtro "Sin
      movimiento >30d" en la UI ya lo señala.
- [ ] **Match por código vs ID**: la vista de "Última venta" hoy usa
      `wp.product_id = p.codigo`. La nueva subquery de precio debe
      usar el mismo match. Si hay productos sin código, no aparecen
      ventas — comportamiento consistente con la columna actual de
      "Última venta".
- [ ] **Performance con muchas líneas históricas**: si en 6 meses
      tenemos 100k+ líneas de waitry_productos y 50k+ de
      ordenes_compra_detalle, las subqueries con
      `ORDER BY created_at DESC LIMIT 1` deben tener índice. Confirmar
      índices existentes antes de mergear; agregar si faltan.
- [ ] **`SECURITY INVOKER` en la vista**: la vista actual ya está
      cubierta por
      [`20260425130000_security_invoker_productos_analisis_views.sql`](../../supabase/migrations/20260425130000_security_invoker_productos_analisis_views.sql).
      La nueva versión debe preservar `SECURITY INVOKER` para que RLS
      de las tablas subyacentes aplique.
- [ ] **Rollback plan**: si por algo el cambio rompe algo en producción
      (ej. performance), revertir es trivial — `CREATE OR REPLACE VIEW`
      con la versión anterior que está commiteada en
      `20260425035021_productos_categorias_y_limpieza.sql:302`. No hay
      data destructiva.

## Sprints / hitos

| #   | Scope                                                                                   | Estado          | PR  |
| --- | --------------------------------------------------------------------------------------- | --------------- | --- |
| 0   | Promoción: doc planning + fila en INITIATIVES.md (estado `planned`, alcance v1 cerrado) | done 2026-04-30 | —   |
| 1   | Migración + nueva vista `rdb.v_productos_tabla` con CTEs costo/precio realidad + smoke  | pending apply   | —   |
| 2   | Cierre: bitácora + decisiones + transición `planned → done` + barrido de Reminders      | pending         | —   |

## Decisiones registradas

### 2026-04-30 — Decisiones de promoción

- **Opción A sobre B**: cambiar solo la vista en lugar de mantener
  `productos_precios` al día con triggers. Razón: A entrega el outcome
  sin estado adicional ni complejidad de triggers; B requiere triggers
  en 3 fuentes (OC recibida, recepciones, waitry_productos) que pueden
  fallar silenciosamente o desincronizarse. La vista refleja la verdad
  por construcción.
- **`erp.productos_precios` se preserva intacta**: sigue siendo la
  tabla de "lista oficial" donde cae el INSERT de productos creados
  desde la UI con precio > 0. Es un override manual implícito por
  ahora; en el futuro la UI podría exponerla como override explícito,
  pero no en v1.
- **Fuente de costo: `ordenes_compra_detalle`** (precio acordado en OC
  recibida/cerrada) en lugar de `movimientos_inventario.costo_unitario`.
  Razón: `movimientos_inventario` mezcla recepciones de OC con
  ajustes de levantamientos físicos y transferencias entre almacenes;
  esos no son "costos de compra". Si ops prefiere "costo realmente
  asentado en stock" en lugar de "precio acordado", se cambia
  fácil — pero el default es lo que el operador espera al ver "Costo"
  en el catálogo.
- **NULL en lugar de $0 para productos sin compra/venta**: hoy
  productos sin fila en `productos_precios` muestran $0.00. Tras el
  cambio, productos sin OC ni Waitry muestran "—". Más honesto. La
  UI ya maneja NULL en `MargenBadge` (`text-muted-foreground` "—") y
  `formatCurrency` (depende de la implementación; verificar Sprint 1).
- **Sin multi-empresa rollout**: la vista es RDB-only por construcción
  (`rdb.waitry_productos` no existe para otras empresas). Si DILESA o
  COAGAN en el futuro tienen su propio catálogo con fuente operativa
  diferente, se hace su propia vista entonces.
- **Modo de ejecución**: por confirmar con Beto al arrancar Sprint 1.
  Si autoriza modo autónomo (CC genera PR + mergea con CI verde),
  puede cerrarse en una sesión. Si no, al ritmo de Beto.

### 2026-04-30 — Decisiones de Sprint 1

- **`COALESCE(precio_real, precio_unitario)` para costo**: la columna
  `precio_real` se introdujo en Sprint 3 de `oc-recepciones` para
  permitir override admin del precio en recepciones (trigger gate por
  `core.fn_is_admin()`). Cuando existe `precio_real`, ese es el costo
  realmente pagado/asentado y debe ganar sobre `precio_unitario`. Si
  no, `precio_unitario` (precio acordado) es el costo. Consistente
  con lo que ya hace la lógica de `total_a_pagar` al cerrar OC.
- **Estados terminales: solo `recibida` y `cerrada`**, NO `parcial`.
  Razón: `parcial` significa que la OC está mitad-recibida; el precio
  podría cambiar en el remanente cuando llegue. Esperar a que pase a
  `recibida` (todo recibido) o `cerrada` (cerrada manualmente con o
  sin pendientes) garantiza que el costo no oscile.
- **Ranking por `COALESCE(cerrada_at, autorizada_at, created_at)`**:
  `cerrada_at` es la fecha más representativa de "cuándo se concretó
  el costo"; `autorizada_at` cubre OCs en estado `recibida` que aún
  no se cerraron; `created_at` de la línea es fallback para OCs
  legacy sin esos timestamps. El orden refleja prioridad temporal
  real, no del lifecycle del registro.
- **Filtrar `unit_price > 0` en Waitry**: ventas con `unit_price = 0`
  son cortesías, ajustes o errores de captura del POS — no
  representan precio real cobrado y contaminarían el "último precio".
  Productos en este filtro mantienen su precio Waitry anterior (NULL
  si nunca tuvieron una venta cobrada).
- **`DISTINCT ON` en lugar de `LATERAL JOIN` o subqueries
  correlacionadas**: idiomático de Postgres, óptimo con índice en
  `(producto_id, fecha)`. A escala actual (cientos de OCs, miles de
  ventas Waitry, 318 productos) los índices simples por `producto_id`
  bastan; el sort secundario por fecha en memoria es trivial. Si el
  smoke detecta lentitud, follow-up con índices compuestos.
- **Ranking Waitry por `wp.created_at`** en lugar de `pedido.timestamp`:
  evita JOIN extra. `created_at` es la fecha de ingestión a BSOP, que
  está cerca de `pedido.timestamp` salvo en backfills. Si emerge
  drift importante, follow-up con JOIN a `waitry_pedidos`.
- **`margen_pct` NULL si falta cualquier pieza**: regla más estricta
  que la versión anterior (que mostraba 100% si costo era NULL/0).
  Margen indeterminado debe leerse como "no podemos saber", no como
  "margen perfecto".
- **NO tocar `INITIATIVES.md` en este PR**: Sprint 1 es ejecución
  intermedia. La transición `planned → done` se hará en Sprint 2 al
  cierre, una sola vez (regla 1 del CLAUDE.md de proyecto sobre
  hotspot de conflicto entre sesiones paralelas).

## Bitácora

### 2026-04-30 — Promoción

Beto pidió revisar cómo se determinan costo y precio en
`/rdb/productos` porque sospechaba que no eran el último costo de compra
ni el último precio de venta. Investigación confirmó: la vista lee de
`productos_precios.vigente=true`, tabla cargada una sola vez en abril
desde Waitry, sin actualizaciones automáticas posteriores. Beto
autorizó **opción A** (cambiar solo la vista) y promoción a iniciativa
con alcance v1 cerrado en este doc. Estado inicial: `planned`.

### 2026-04-30 — Sprint 1 (modo autónomo)

Beto autorizó modo autónomo: "haz push y merge cuando esté en verde,
hay otra sesión con iniciativa en paralelo". Tomado en cuenta:
**no toco `INITIATIVES.md` en este PR** (Sprint 1 es intermedio,
hotspot de conflicto con la sesión paralela; la transición a `done`
se hace en Sprint 2 una sola vez).

Migración creada en
[`supabase/migrations/20260430130000_rdb_v_productos_tabla_costo_precio_realidad.sql`](../../supabase/migrations/20260430130000_rdb_v_productos_tabla_costo_precio_realidad.sql)
con la nueva definición de `rdb.v_productos_tabla` usando dos CTEs
(`ultimo_costo_oc` + `ultimo_precio_waitry`) con `DISTINCT ON` por
producto. `SECURITY INVOKER` preservado. `NOTIFY pgrst, 'reload schema'`
al final para refrescar PostgREST sin esperar el polling automático.

Decisiones técnicas documentadas en sección anterior. Índices
existentes verificados — no se agregan compuestos en v1 (escala
actual los tolera; follow-up si smoke detecta > 200ms).

Pendiente para Beto: aplicar migración con psql en main DB. Tras
apply, regenerar `SCHEMA_REF.md` + `types/supabase.ts` (commit
subsiguiente al PR antes de mergear, o post-merge si Beto prefiere).
Smoke test manual en preview verifica que productos con OCs y ventas
muestran números reales en lugar de \$0.
