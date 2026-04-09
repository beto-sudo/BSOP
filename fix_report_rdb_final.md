# Fix report: RDB final validation

## Resumen ejecutivo
Se verificó el estado final de `app/rdb/cortes/page.tsx` y `app/rdb/ventas/page.tsx` contra el objetivo de volver a `rdb`.

Conclusión: ambos archivos ya quedaron apuntando a `rdb.*` y no fue necesario introducir cambios funcionales adicionales para completar la reversión del parche temporal.

## Estado por archivo

### `app/rdb/cortes/page.tsx`
Consultas activas confirmadas:
- listado principal: `rdb.cortes`
- detalle: `rdb.v_cortes_totales`, `rdb.movimientos`, `rdb.v_cortes_productos`
- catálogo de cajas: `rdb.cajas`

Notas:
- no usa `rdb.v_cortes_completo`
- las vistas pesadas del detalle (`v_cortes_totales`, `v_cortes_productos`) sí están filtradas por `corte_id`
- el listado principal usa `rdb.cortes` con filtro por fecha

### `app/rdb/ventas/page.tsx`
Consultas activas confirmadas:
- listado principal: `rdb.waitry_pedidos`
- detalle: `rdb.waitry_productos`, `rdb.waitry_pagos`

## Validación de build
Comando:
```bash
npm run build
```

Resultado:
- build exitoso
- TypeScript exitoso
- rutas `/rdb/cortes` y `/rdb/ventas` generadas correctamente

## Validación REST
Usando `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` de `.env.local`.

### `rdb.cortes`
Request:
```http
GET /rest/v1/cortes?select=id&limit=1
Accept-Profile: rdb
```

Resultado:
```json
[{"id":"549adbe1-1dc2-47e3-883b-699edd56e0b5"}]
```

### `rdb.waitry_pedidos`
Request:
```http
GET /rest/v1/waitry_pedidos?select=id&limit=1
Accept-Profile: rdb
```

Resultado:
```json
[{"id":"222f8725-acbd-4655-b1a1-048bd3a136d2"}]
```

## Git / commit
No se detectaron cambios funcionales pendientes en los dos archivos objetivo respecto al estado deseado en `rdb`, así que no hubo diff real que commitear en esos `.tsx`.

Se dejó este reporte como evidencia final de validación.

## Estado final
- `cortes` -> OK en `rdb`
- `ventas` -> OK en `rdb`
- `npm run build` -> OK
- validación REST de tablas principales -> OK
