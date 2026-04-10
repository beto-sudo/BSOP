# Validation Report Phase 2 — Quick

Fecha: 2026-04-09 03:26 CDT aprox
Repo: /Users/Beto/BSOP

## Resumen corto

- La REST API de Supabase para `rdb` ya está expuesta, pero **solo responde bien en parte**.
- Confirmado en vivo: `rdb.productos` y `rdb.ordenes_compra` responden `200` por REST.
- Confirmado en vivo: `rdb.cortes`, `rdb.cajas`, `rdb.movimientos`, `rdb.waitry_pedidos`, `rdb.waitry_productos` y `rdb.waitry_pagos` responden `403 permission denied`.
- El problema operativo de esta noche no parece ser “schema no expuesto” ni “URL equivocada” como causa principal.
- Lo que sí aparece es una combinación de:
  1. **faltan grants/permisos REST** en varias tablas críticas de `rdb`, y
  2. **esas tablas críticas además siguen vacías** en `rdb`.

## 1) REST API para `rdb`

### Endpoints que sí respondieron
- `GET /rest/v1/productos?select=id&limit=1` con `Accept-Profile: rdb` → `200 OK`
  - Respuesta: 1 fila devuelta
- `GET /rest/v1/ordenes_compra?select=id&limit=1` con `Accept-Profile: rdb` → `200 OK`
  - Respuesta: 1 fila devuelta

### Endpoints que fallaron por permisos
- `GET /rest/v1/cortes?select=id&limit=1` con `Accept-Profile: rdb` → `403`
  - `permission denied for table cortes`
- `GET /rest/v1/cajas?select=id&limit=1` → `403`
  - `permission denied for table cajas`
- `GET /rest/v1/waitry_pedidos?select=id&limit=1` → `403`
  - `permission denied for table waitry_pedidos`
- `GET /rest/v1/waitry_productos?select=id` → `403`
- `GET /rest/v1/waitry_pagos?select=id` → `403`
- `GET /rest/v1/v_cortes_totales?select=corte_id` → `403`
- `GET /rest/v1/v_cortes_productos?select=corte_id` → `403`
- `GET /rest/v1/v_stock_actual?select=id` → `403`

### Confirmación adicional
- El OpenAPI de PostgREST para `rdb` lista 33 rutas en vivo, incluyendo:
  - `cajas`, `cortes`, `movimientos`
  - `waitry_inbound`, `waitry_pedidos`, `waitry_productos`, `waitry_pagos`
  - `productos`, `inventario_movimientos`, `ordenes_compra`, `requisiciones`, etc.

**Conclusión práctica:** sí, `rdb` ya está expuesto en REST. El bloqueo actual es de permisos en tablas clave, no de exposición del schema.

## 2) Tablas reales en `rdb` (más relevantes)

Tablas / vistas detectadas en OpenAPI:

- `cajas`
- `cortes`
- `movimientos`
- `waitry_inbound`
- `waitry_pedidos`
- `waitry_productos`
- `waitry_pagos`
- `waitry_duplicate_candidates`
- `productos`
- `inventario_movimientos`
- `productos_waitry_map`
- `proveedores`
- `requisiciones`
- `requisiciones_items`
- `ordenes_compra`
- `ordenes_compra_items`
- `inv_productos`
- `inv_entradas`
- `inv_ajustes`
- vistas `v_cortes_*`, `v_stock_actual`, `v_kardex`, `v_waitry_*`

## 3) Conteos en vivo (table-stats remoto)

### Con datos
- `rdb.productos` → **310**
- `rdb.inventario_movimientos` → **11166**
- `rdb.proveedores` → **30**
- `rdb.requisiciones` → **185**
- `rdb.ordenes_compra` → **156**
- `rdb.ordenes_compra_items` → **654**
- `rdb.productos_waitry_map` → **185**

### Vacías
- `rdb.cajas` → **0**
- `rdb.cortes` → **0**
- `rdb.movimientos` → **0**
- `rdb.waitry_inbound` → **0**
- `rdb.waitry_pedidos` → **0**
- `rdb.waitry_productos` → **0**
- `rdb.waitry_pagos` → **0**
- `rdb.waitry_duplicate_candidates` → **0**
- `rdb.inv_productos` → **0**
- `rdb.inv_entradas` → **0**
- `rdb.inv_ajustes` → **0**
- `rdb.requisiciones_items` → **0**

### Referencia de schemas viejos
- `waitry.pedidos` → **9439**
- `waitry.productos` → **13330**
- `waitry.pagos` → **535**
- `waitry.inbound` → **9438**
- `waitry.duplicate_candidates` → **807**
- `caja.cortes` → **419**
- `caja.cajas` → **5**
- `caja.movimientos` → **390**

## 4) Mismatch de nombres en BSOP

### Bien alineado
- `app/rdb/ventas/page.tsx` usa `.schema('rdb').from('waitry_pedidos')`
- `app/rdb/cortes/page.tsx` usa `.schema('rdb').from('cortes')`
- `app/rdb/cortes/page.tsx` usa `.from('cajas')`, `.from('movimientos')`, `.from('v_cortes_totales')`, `.from('v_cortes_productos')`
- No encontré llamadas activas a `.from('pedidos')` dentro del módulo `app/rdb`

### Mismatch real detectado
- En `rdb` **no existe** una tabla `pedidos`; el nombre correcto es **`waitry_pedidos`**.
- Ese mismatch ya parece corregido en el código principal de BSOP.
- El problema fuerte ya no es tanto nombre incorrecto en frontend, sino que `waitry_pedidos` y `cortes` están vacías y además REST da 403 en esos objetos.

## 5) Edge Functions

### Código revisado
- `/Users/Beto/.openclaw/workspace/supabase/functions/waitry-webhook/index.ts`
  - crea cliente con `db: { schema: 'rdb' }`
  - inserta en `.from('waitry_inbound')`
- `/Users/Beto/.openclaw/workspace/supabase/functions/coda-sync-corte/index.ts`
  - lee `.schema('rdb').from('v_cortes_totales_30d')`
  - lee `.schema('rdb').from('cortes')`
  - lee `.schema('rdb').from('v_cortes_productos_30d')`

### Estado remoto
- `waitry-webhook` → `ACTIVE` v12
- `coda-sync-corte` → `ACTIVE` v1
- `corte-webhook` → `ACTIVE` v4
- `sync-cortes` → `ACTIVE` v1

**Conclusión:** en código y en despliegue, las Edge Functions sí parecen apuntar al lugar correcto (`rdb`).

## 6) Veredicto práctico para esta noche

Lo más probable para mañana:

- **Ventas / cortes por UI NO van a jalar bien todavía**.
- La causa principal no parece ser cache ni URL equivocada.
- Lo más probable es esta combinación:
  - **nombres ya mayormente alineados en BSOP**, pero
  - **tablas críticas de `rdb` siguen vacías**, y
  - **REST tiene permisos mal aplicados en varias tablas/vistas críticas**.

### Traducción operativa
- Inventario / compras / requisiciones: **sí podrían funcionar parcial o bastante bien**, porque ahí sí hay datos y REST responde en tablas clave.
- Ventas / cortes / caja / waitry consolidado: **no confiaría en que funcionen mañana** sin corregir permisos y/o poblar datos en `rdb`.

## Bottom line

- `rdb` ya está expuesto por REST.
- No es principalmente tema de cache.
- No veo un mismatch grave de nombres en el frontend actual.
- El cuello de botella real esta noche es: **permisos REST + tablas críticas vacías en `rdb`**.
