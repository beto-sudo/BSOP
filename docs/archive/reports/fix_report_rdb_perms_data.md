# Fix report: rdb permisos y migración de datos

Fecha: 2026-04-09
Proyecto: ybklderteyhuugzfmxbi
Repo: /Users/Beto/BSOP

## Resumen ejecutivo

Se dejó `rdb` funcional para lectura vía PostgREST con `anon` en las tablas críticas que estaban fallando con `permission denied`, y se migraron los datos faltantes desde los schemas legados `caja` y `waitry` sin modificar las tablas origen.

La causa raíz no era solo falta de datos: también había permisos/RLS incompletos en varias tablas de `rdb`, y además el repo local tenía el historial de migraciones desalineado con el remoto, lo que impedía aplicar el fix por CLI.

## 1. Diagnóstico inicial

### Síntoma reproducido antes del fix
Pruebas REST con `Accept-Profile: rdb` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` devolvían `403 permission denied` en:

- `rdb.cortes`
- `rdb.cajas`
- `rdb.movimientos`
- `rdb.waitry_pedidos`
- `rdb.waitry_productos`
- `rdb.waitry_pagos`
- `rdb.waitry_inbound`

Mientras tanto, otras tablas de `rdb` sí respondían correctamente, por ejemplo:

- `rdb.productos`
- `rdb.inventario_movimientos`
- `rdb.proveedores`
- `rdb.requisiciones`
- `rdb.ordenes_compra`
- `rdb.ordenes_compra_items`

### Estado de datos antes del fix
Tablas vacías o faltantes en `rdb` que se validaron antes:

- `rdb.cortes`: 0
- `rdb.cajas`: 0
- `rdb.movimientos`: 0
- `rdb.waitry_pedidos`: 0
- `rdb.waitry_productos`: 0
- `rdb.waitry_pagos`: 0
- `rdb.waitry_inbound`: 0

Fuentes legadas con datos:

- `caja.cortes`: 419
- `caja.cajas`: 5
- `caja.movimientos`: 390
- `waitry.pedidos`: 9439
- `waitry.productos`: ~13327 estimados antes del fix
- `waitry.pagos`: ~9547 estimados antes del fix
- `waitry.inbound`: 9438

## 2. Bloqueo adicional encontrado

El historial de migraciones local no coincidía con el remoto. Para poder aplicar una migración correctiva por `supabase db push` se hizo lo siguiente:

- Se movieron las migraciones locales “compactadas” a `supabase/migrations_archive_pre_fix/`
- Se crearon placeholders locales para igualar las versiones remotas ya aplicadas
- Se creó una sola migración correctiva nueva:
  - `supabase/migrations/20260409040000_rdb_fix_perms_data.sql`

Esto permitió ejecutar `supabase db push --linked` sin tocar las tablas legadas.

## 3. Permisos y RLS aplicados

La migración correctiva aplicó:

### Grants
- `GRANT USAGE ON SCHEMA rdb TO anon, authenticated, service_role`
- `GRANT SELECT ON ALL TABLES IN SCHEMA rdb TO anon, authenticated, service_role`
- `GRANT SELECT ON ALL SEQUENCES IN SCHEMA rdb TO anon, authenticated, service_role`
- `GRANT INSERT, UPDATE, DELETE` a `authenticated` sobre tablas operativas:
  - `rdb.cajas`
  - `rdb.cortes`
  - `rdb.movimientos`
  - `rdb.productos`
  - `rdb.inventario_movimientos`
  - `rdb.proveedores`
  - `rdb.requisiciones`
  - `rdb.ordenes_compra`
  - `rdb.ordenes_compra_items`

### Default privileges
- `SELECT` futuro para `anon, authenticated, service_role`
- `INSERT/UPDATE/DELETE` futuro para `authenticated`

### RLS / Policies
Se dejó RLS habilitado en tablas críticas y se agregaron policies `fix_rdb_*` para:

- lectura (`SELECT`) con `anon` y `authenticated` en:
  - `cajas`
  - `cortes`
  - `movimientos`
  - `waitry_inbound`
  - `waitry_pedidos`
  - `waitry_productos`
  - `waitry_pagos`
  - `productos`
  - `inventario_movimientos`
  - `proveedores`
  - `requisiciones`
  - `ordenes_compra`
  - `ordenes_compra_items`
- escritura (`ALL`) con `authenticated` en tablas operativas de BSOP

## 4. Migración de datos aplicada

Se copiaron datos únicamente desde tablas legadas hacia `rdb`, usando `INSERT ... SELECT` idempotente con `ON CONFLICT DO NOTHING` y sin modificar origen.

### Mapeos aplicados
- `caja.cajas` → `rdb.cajas`
- `caja.cortes` → `rdb.cortes`
- `caja.movimientos` → `rdb.movimientos`
- `waitry.inbound` → `rdb.waitry_inbound`
- `waitry.pedidos` → `rdb.waitry_pedidos`
- `waitry.productos` → `rdb.waitry_productos`
- `waitry.pagos` → `rdb.waitry_pagos`

### Ajustes de columnas realizados
No fue necesario remapear nombres de columnas en estas tablas. Las estructuras relevantes coincidían para la copia directa en los objetos migrados.

## 5. Conteos finales en `rdb`

Validados por REST con `Accept-Profile: rdb` y `Prefer: count=exact`.

| Tabla | Antes | Después |
|---|---:|---:|
| `rdb.cortes` | 0 | 419 |
| `rdb.cajas` | 0 | 5 |
| `rdb.movimientos` | 0 | 390 |
| `rdb.waitry_pedidos` | 0 | 9439 |
| `rdb.waitry_productos` | 0 | 13327 |
| `rdb.waitry_pagos` | 0 | 9547 |
| `rdb.waitry_inbound` | 0 | 9438 |
| `rdb.productos` | 310 | 310 |
| `rdb.inventario_movimientos` | 11166 | 11166 |
| `rdb.proveedores` | 30 | 30 |
| `rdb.requisiciones` | 185 | 185 |
| `rdb.ordenes_compra` | 156 | 156 |
| `rdb.ordenes_compra_items` | 654 | 654 |

## 6. Validaciones REST

### OK después del fix
Todas estas rutas ya responden sin `permission denied` usando `anon`:

- `GET /rest/v1/cortes?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/cajas?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/movimientos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/waitry_pedidos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/waitry_productos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/waitry_pagos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/waitry_inbound?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/productos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/inventario_movimientos?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/proveedores?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/requisiciones?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/ordenes_compra?select=id&limit=1` + `Accept-Profile: rdb`
- `GET /rest/v1/ordenes_compra_items?select=id&limit=1` + `Accept-Profile: rdb`

Resultado HTTP observado: `206` con `content-range` válido en todos los casos anteriores.

### Vistas
- `rdb.v_cortes_completo`: no existe
- `rdb.v_cortes_totales`: existe, pero la validación REST simple cayó en `statement timeout`
- `rdb.v_cortes_productos`: existe, pero la validación REST simple cayó en `statement timeout`

Nota: el problema principal de permisos/datos quedó resuelto en las tablas base. Las vistas necesitan revisión aparte de performance o de filtros de consulta para consumo REST.

## 7. Archivo / SQL aplicado

Migración aplicada exitosamente:

- `supabase/migrations/20260409040000_rdb_fix_perms_data.sql`

Comando ejecutado:

```bash
supabase db push --linked
```

## 8. Pendientes / follow-up recomendado

1. Revisar consumo REST de `rdb.v_cortes_totales` y `rdb.v_cortes_productos` porque hoy responden con timeout en una consulta genérica.
2. Si se quiere mantener ordenado el repo, reconciliar oficialmente la estrategia de migraciones porque antes estaba desalineada contra el remoto.
3. Validar desde la app BSOP que ya puede volver a apuntar a `rdb.*` en las pantallas que usaban fallback temporal a `caja.*` y `waitry.*`.

## Conclusión

`rdb` quedó funcional para las tablas críticas pedidas:

- ya no reproducen `permission denied` por REST con `anon`
- ya tienen los datos migrados desde `caja` y `waitry`
- no se modificaron tablas legadas
