# Fix report: BSOP RDB night fix

## Resumen ejecutivo
Se identificó que el problema de esta noche no era un bug de UI sino un corte incompleto en la migración hacia `rdb` para los módulos de `ventas` y `cortes`.

Apliqué un fix mínimo en código para que esos dos módulos vuelvan a leer del schema legado que sí está respondiendo (`waitry` y `caja`), sin tocar otros módulos y sin hacer push.

## 1) Diagnóstico de `cortes`

### Ruta/query usada por BSOP
Archivo: `app/rdb/cortes/page.tsx`

La pantalla estaba consultando:
- `rdb.cortes`
- `rdb.v_cortes_totales`
- `rdb.movimientos`
- `rdb.v_cortes_productos`
- `rdb.cajas`

### Causa raíz
La lectura vía PostgREST devuelve:
- `permission denied for table cortes`
- también falla para `rdb.cajas`, `rdb.movimientos` y `rdb.v_cortes_totales`

Esto apunta a permisos/grants en Postgres sobre objetos `rdb` usados por caja, no a un error de React ni de la capa de fetch.

Importante: el schema legado `caja` sí responde correctamente para:
- `caja.cortes`
- `caja.v_cortes_completo`
- `caja.v_cortes_totales`
- `caja.movimientos`
- `caja.v_cortes_productos`
- `caja.cajas`

### Rol usado por BSOP
La pantalla usa `createSupabaseBrowserClient()`, o sea acceso por navegador con Supabase Auth / API key pública, no conexión directa SQL. En la práctica el módulo depende de permisos PostgREST del cliente autenticado del front.

### Fix aplicado
Se cambió `app/rdb/cortes/page.tsx` para leer temporalmente del schema legado `caja`:
- listado principal: `caja.v_cortes_completo`
- detalle: `caja.v_cortes_totales`, `caja.movimientos`, `caja.v_cortes_productos`
- catálogo de cajas: `caja.cajas`

No apliqué GRANTs SQL porque no tenía una vía segura e inmediata para ejecutar SQL remoto esta noche sin abrir más superficie de riesgo. El fix de código era el cambio mínimo, reversible y validable.

## 2) Diagnóstico de `ventas`

### Ruta/query usada por BSOP
Archivo: `app/rdb/ventas/page.tsx`

La pantalla estaba consultando:
- `rdb.waitry_pedidos`
- `rdb.waitry_productos`
- `rdb.waitry_pagos`

### Causa raíz
La lectura vía PostgREST devuelve:
- `permission denied for table waitry_pedidos`

Además confirmé que el schema legado `waitry` sí responde para:
- `waitry.pedidos`

La pantalla NO estaba consultando `rdb.pedidos`; estaba consultando `rdb.waitry_pedidos`.

### Existencia/datos
- `waitry.pedidos` existe y sí tiene datos.
- `rdb.waitry_pedidos` estaba fallando por permisos desde la API.
- Los views/compat objects en schema legado apuntando a `rdb` (`waitry.waitry_pedidos_rdb`, `caja.cortes_rdb`) no eran buena salida para tonight porque respondían vacíos.

### Fix aplicado
Se cambió `app/rdb/ventas/page.tsx` para leer temporalmente del schema legado `waitry`:
- listado principal: `waitry.pedidos`
- detalle: `waitry.productos`, `waitry.pagos`

## 3) Cambios exactos

### Editados
- `app/rdb/ventas/page.tsx`
- `app/rdb/cortes/page.tsx`

### Cambios funcionales
- `ventas` deja de leer `rdb.*` y vuelve a `waitry.*`
- `cortes` deja de leer `rdb.*` y vuelve a `caja.*`

## 4) Validación realizada

### Validación de permisos/respuesta remota
Con consultas directas a Supabase REST:
- `rdb.cortes` -> `permission denied for table cortes`
- `rdb.waitry_pedidos` -> `permission denied for table waitry_pedidos`
- `caja.v_cortes_completo` -> responde OK con datos
- `caja.v_cortes_totales` -> responde OK con datos
- `caja.movimientos` -> responde OK con datos
- `caja.v_cortes_productos` -> responde OK con datos
- `caja.cajas` -> responde OK con datos
- `waitry.pedidos` -> responde OK con datos

### Validación de build
- `npm run build` -> OK

## 5) Qué quedó pendiente

1. Corregir de raíz los permisos/grants de los objetos `rdb` usados por caja y ventas:
   - `rdb.cortes`
   - `rdb.cajas`
   - `rdb.movimientos`
   - `rdb.v_cortes_totales`
   - `rdb.v_cortes_productos`
   - `rdb.waitry_pedidos`
   - posiblemente `rdb.waitry_productos` y `rdb.waitry_pagos`

2. Revalidar si los datos de caja/ventas ya están realmente migrados a `rdb` y no solo algunos módulos (`requisiciones`, `productos`) porque hoy quedó mezclado: parte de `rdb` sí responde y parte no.

3. Si se quiere completar la migración correctamente, el siguiente paso bueno es arreglar SQL/grants en `rdb` y luego regresar estas pantallas a `rdb`.

## Estado final
- `ventas`: fix aplicado en código, build validado
- `cortes`: fix aplicado en código, build validado
- No hice push
