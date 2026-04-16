# Validation Report - Supabase Schema Migration Phase 2

Date: 2026-04-09
Project: ybklderteyhuugzfmxbi
Repo: /Users/Beto/BSOP

## Summary

La migración quedó **parcialmente validada**.

- El deploy de código sí está en `main` con el commit esperado `b2415af`.
- El schema `rdb` **sí existe** y contiene tablas/vistas.
- Pero la validación de datos muestra una inconsistencia importante: varias tablas críticas en `rdb` están vacías o no existen con el nombre esperado.
- Las Edge Functions requeridas están desplegadas.
- No fue posible extraer logs con la versión instalada del Supabase CLI (`v2.75.0`), porque no soporta `supabase functions logs`.
- PostgREST **no expone** todavía la relación `cortes` bajo la URL REST probada, devolviendo `404 / PGRST205`.

---

## 1. Estado del deploy en Vercel / repo

- ✅ `git log --oneline -5` confirma que `b2415af` está en `main`
- ✅ `git merge-base --is-ancestor b2415af HEAD` => `yes`
- ❌ `git status` muestra cambios sin trackear en el repo

### `git log --oneline -5`

```text
b2415af feat: Fase 2 — migrar app/rdb/* al schema rdb
e88427a chore: expose exact error message in UI for cortes
72694fa fix: ajustar colSpan en empty state de tabla Cortes para cuadrar con nuevas columnas
f687220 feat: reemplazar fecha por rango horario y agregar contador de pedidos a la tabla de Cortes
5f3b801 fix: re-engineer print css
```

### `git status --short --branch`

```text
## main...origin/main
?? caja_prompt.md
?? docs/email_miguel.txt
?? migration_phase2_report.md
?? prompt_oc.md
?? prompt_req.md
?? query_supa.js
?? supabase/.temp/gotrue-version
?? supabase/.temp/pooler-url
?? supabase/.temp/postgres-version
?? supabase/.temp/project-ref
?? supabase/.temp/rest-version
?? supabase/.temp/storage-migration
?? supabase/.temp/storage-version
```

---

## 2. Verificación del schema `rdb`

- ✅ El schema `rdb` existe
- ✅ Tiene tablas y vistas creadas

### Objetos encontrados en `rdb`

```text
cajas
cortes
inv_ajustes
inv_entradas
inv_productos
inventario_movimientos
movimientos
ordenes_compra
ordenes_compra_items
productos
productos_waitry_map
proveedores
requisiciones
requisiciones_items
v_cortes_productos
v_cortes_productos_30d
v_cortes_totales
v_cortes_totales_30d
v_inv_stock_actual
v_kardex
v_stock_actual
v_waitry_pagos_30d
v_waitry_pedidos_30d
v_waitry_pending_duplicates
v_waitry_productos_30d
waitry_duplicate_candidates
waitry_inbound
waitry_pagos
waitry_pedidos
waitry_productos
```

---

## 3. Tablas críticas y datos

### Resultado directo sobre las tablas pedidas

- ⚠️ `rdb.cortes` => `0`
- ❌ `rdb.pedidos` => **no existe** (`relation "rdb.pedidos" does not exist`)
- ✅ `rdb.productos` => `310`
- ⚠️ `rdb.cajas` => `0`
- ✅ `rdb.inventario_movimientos` => `11166`

### Conteos

| Tabla | Resultado |
|---|---:|
| `rdb.cortes` | 0 |
| `rdb.pedidos` | NO EXISTE |
| `rdb.productos` | 310 |
| `rdb.cajas` | 0 |
| `rdb.inventario_movimientos` | 11166 |

### Hallazgos relevantes

- En `rdb` no existe `pedidos`, sino `waitry_pedidos`.
- `rdb.waitry_pedidos` también devolvió `0` registros.
- Como referencia, el schema original `waitry.pedidos` sí tiene datos: `9439`.
- Como referencia, `caja.cortes` tiene `419` y `caja.cajas` tiene `5`.

Esto sugiere que la consolidación estructural sí existe, pero **la capa de datos en `rdb` no quedó alineada con los nombres y/o con la copia esperada para las tablas operativas críticas**.

---

## 4. Edge Functions desplegadas

- ✅ `waitry-webhook` existe y está `ACTIVE`
- ✅ `corte-webhook` existe y está `ACTIVE`

### `supabase functions list`

```text
ID                                   | NAME            | SLUG            | STATUS | VERSION | UPDATED_AT (UTC)
17f4fcc5-30d8-4ad0-8647-19ff0c191b06 | waitry-webhook  | waitry-webhook  | ACTIVE | 12      | 2026-04-09 01:14:15
4dba80ad-aa4f-4941-b8a8-8efcdb81a9e7 | coda-sync-corte | coda-sync-corte | ACTIVE | 1       | 2026-04-06 17:03:36
d570f757-e68b-48c0-8498-356576ba4a9f | corte-webhook   | corte-webhook   | ACTIVE | 4       | 2026-04-07 02:25:26
5bb60e17-e431-4e31-943a-1c03d8f88833 | sync-cortes     | sync-cortes     | ACTIVE | 1       | 2026-04-07 02:48:58
```

---

## 5. Logs recientes de Edge Functions

- ❌ No fue posible validar logs recientes con la herramienta local disponible.

### Motivo
La versión instalada del CLI es `supabase v2.75.0` y **no soporta** el subcomando/flag usado para logs. Al intentar:

```bash
supabase functions logs waitry-webhook --limit 20
supabase functions logs corte-webhook --limit 20
```

regresa:

```text
unknown flag: --limit
```

y el CLI mostrado localmente no incluye `logs` dentro de `supabase functions`.

### Error encontrado en logs

- No se pudo revisar si existen errores recientes relacionados con `rdb` o tablas faltantes, por limitación del CLI local.

---

## 6. Verificación PostgREST

- ❌ Falló la prueba REST

### Request

```bash
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/cortes?limit=1&select=id"
```

### Resultado

```text
HTTP/2 404
proxy-status: PostgREST; error=PGRST205
```

### Interpretación

PostgREST **no está exponiendo** esa relación en la forma esperada. Esto es consistente con que todavía falte configurar manualmente `rdb` en **Extra API Schemas** en el dashboard, o con que la tabla no esté disponible en el schema API expuesto por defecto.

---

## 7. Verificación de archivos modificados por Agente 2

- ✅ Se encontraron archivos clave bajo `app/rdb` usando `rdb.` o referencias al schema `rdb`

### Archivos encontrados

```text
/Users/Beto/BSOP/app/rdb/requisiciones/actions.ts
/Users/Beto/BSOP/app/rdb/requisiciones/page.tsx
/Users/Beto/BSOP/app/rdb/ventas/page.tsx
/Users/Beto/BSOP/app/rdb/ordenes-compra/page.tsx
/Users/Beto/BSOP/app/rdb/cortes/actions.ts
/Users/Beto/BSOP/app/rdb/cortes/page.tsx
/Users/Beto/BSOP/app/rdb/proveedores/page.tsx
/Users/Beto/BSOP/app/rdb/inventario/page.tsx
/Users/Beto/BSOP/app/rdb/productos/page.tsx
```

---

## Final verdict by checkpoint

- ✅ 1. Deploy / repo apunta a `b2415af`
- ✅ 2. Schema `rdb` existe y contiene objetos
- ❌ 3. Tablas críticas no quedaron consistentes con lo esperado
- ✅ 4. Edge Functions requeridas están desplegadas
- ❌ 5. Logs recientes no pudieron validarse con el CLI local actual
- ❌ 6. PostgREST no expone `cortes` como se esperaba
- ✅ 7. Archivos clave del app sí usan `rdb`

---

## Próximos pasos manuales recomendados

1. **Configurar `rdb` en Supabase Dashboard > API > Extra API Schemas**.
   - Este paso sigue pendiente y probablemente explica el `404 / PGRST205` en REST.

2. **Validar la migración real de datos hacia `rdb`**.
   - Revisar por qué `rdb.cortes = 0`, `rdb.cajas = 0`, `rdb.waitry_pedidos = 0` mientras los schemas originales sí tienen datos.
   - Confirmar si la migración pretendía:
     - renombrar `waitry.pedidos` a `rdb.pedidos`, o
     - conservar nombre `rdb.waitry_pedidos`.

3. **Corregir el desalineamiento de nombres**.
   - El app/validación esperaba `rdb.pedidos`, pero en la base existe `rdb.waitry_pedidos`.
   - Eso puede romper consultas si alguna parte del stack todavía espera `pedidos` sin prefijo Waitry.

4. **Actualizar Supabase CLI** para revisar logs de Edge Functions.
   - Recomendado: actualizar a una versión reciente y volver a correr la validación de logs de las últimas 2 horas.

5. **Hacer smoke test funcional de BSOP** después de corregir 2 y 3.
   - Especialmente módulos: Cortes, Ventas, Inventario, Cajas y webhooks.
