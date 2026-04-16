# Migración Fase 2 — Reporte de Ejecución

**Fecha:** 2026-04-08
**Commit:** b2415af → `feat: Fase 2 — migrar app/rdb/* al schema rdb`
**Branch:** main (pushed a origin)

---

## Resumen

Migración del código BSOP del acceso a schemas `waitry`, `caja` e `inventario` al schema consolidado `rdb`. La Fase 1 (DDL de tablas, funciones, triggers, vistas) ya estaba completa. Esta fase actualiza:
- Migraciones SQL de permisos y RLS
- Código Next.js en `app/rdb/`
- Edge Functions en `.openclaw/workspace/supabase/functions/`
- Scripts operativos en `.openclaw/workspace/coda/RDB/waitry-supabase/`

---

## PASO 1 — Exposición de rdb en PostgREST

**Archivo:** `supabase/migrations/20260408_rdb_expose_postgrest.sql`

- `GRANT USAGE ON SCHEMA rdb TO anon, authenticated`
- `GRANT SELECT ON ALL TABLES IN SCHEMA rdb TO anon, authenticated`
- `GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rdb TO authenticated`
- `ALTER DEFAULT PRIVILEGES` para tablas futuras

**⚠️ Acción manual requerida:**
Agregar `rdb` en la lista de "Extra API Schemas" en el Dashboard de Supabase:
**Settings → API → Extra API Schemas → agregar "rdb"**

---

## PASO 2 — RLS Policies

**Archivo:** `supabase/migrations/20260408_rdb_rls.sql`

RLS habilitado y policies creadas en las 11 tablas:

| Tabla | SELECT | INSERT | UPDATE |
|-------|--------|--------|--------|
| `waitry_inbound` | authenticated | — (service role vía webhook) | — |
| `waitry_pedidos` | authenticated | — | — |
| `waitry_productos` | authenticated | — | — |
| `waitry_pagos` | authenticated | — | — |
| `waitry_duplicate_candidates` | authenticated | — | — |
| `cajas` | authenticated | — | — |
| `cortes` | authenticated | authenticated | authenticated |
| `movimientos` | authenticated | authenticated | authenticated |
| `inv_productos` | authenticated | authenticated | authenticated |
| `inv_entradas` | authenticated | authenticated | — |
| `inv_ajustes` | authenticated | authenticated | authenticated |

---

## PASO 3 — Cliente Supabase

Sin cambios necesarios. Los clientes en `lib/` usan `.schema()` por query, lo que es el patrón correcto. No se requiere un schema default diferente.

---

## PASO 4 — Archivos app/rdb/ actualizados

### `cortes/actions.ts`
- `.schema('caja').from('cortes')` → `.schema('rdb').from('cortes')` (check de turno abierto)
- `.schema('caja').from('cortes').insert({...})` → `.schema('rdb').from('cortes').insert({...})`
- **Quitado:** campo `corte_nombre` del INSERT (no existe en `rdb.cortes`)

### `cortes/page.tsx`
| Antes | Después |
|-------|---------|
| `.schema('caja').from('v_cortes_completo')` | `.schema('rdb').from('cortes')` |
| `.schema('caja').from('v_cortes_totales')` | `.schema('rdb').from('v_cortes_totales')` |
| `.schema('caja').from('movimientos')` | `.schema('rdb').from('movimientos')` |
| `.schema('caja').from('v_cortes_productos')` | `.schema('rdb').from('v_cortes_productos')` |
| `.schema('caja').from('cajas')` | `.schema('rdb').from('cajas')` |

**Nota:** `v_cortes_completo` no existe en rdb. Se reemplazó por `rdb.cortes` directamente (SELECT *). Los totales se cargan lazy en el detail drawer desde `rdb.v_cortes_totales`.

### `ventas/page.tsx`
| Antes | Después |
|-------|---------|
| `.schema('waitry').from('pedidos')` | `.schema('rdb').from('waitry_pedidos')` |
| `.schema('waitry').from('productos')` | `.schema('rdb').from('waitry_productos')` |
| `.schema('waitry').from('pagos')` | `.schema('rdb').from('waitry_pagos')` |

### Sin cambios (ya usaban `.schema('rdb')`)
- `ordenes-compra/page.tsx` ✓
- `inventario/page.tsx` ✓
- `productos/page.tsx` ✓
- `proveedores/page.tsx` ✓
- `requisiciones/page.tsx` ✓
- `requisiciones/actions.ts` ✓

---

## PASO 5 — Edge Functions (`.openclaw/workspace/supabase/functions/`)

### `waitry-webhook/index.ts`
- `db: { schema: 'waitry' }` → `db: { schema: 'rdb' }`
- `.from('inbound')` → `.from('waitry_inbound')`

### `coda-sync-corte/index.ts`
- `.schema('caja').from('v_cortes_totales_30d')` → `.schema('rdb').from('v_cortes_totales_30d')`
- `.schema('caja').from('v_cortes_productos_30d')` → `.schema('rdb').from('v_cortes_productos_30d')`
- Agregada query a `rdb.cortes` para obtener `fecha_operativa` y `caja_nombre`
- `corte_nombre` se computa como `caja_nombre + ' — ' + fecha_operativa`
- `total_pedidos` → `null` (no disponible en `rdb.v_cortes_totales`)

**Pendiente PASO 8 para edge functions:**
```bash
supabase functions deploy waitry-webhook --project-ref ybklderteyhuugzfmxbi
supabase functions deploy coda-sync-corte --project-ref ybklderteyhuugzfmxbi
```

---

## PASO 6 — Scripts operativos (`.openclaw/workspace/coda/RDB/waitry-supabase/`)

### `sync_v2.js`
| Antes | Después |
|-------|---------|
| `waitry.v_pedidos_30d` | `rdb.v_waitry_pedidos_30d` |
| `waitry.v_pagos_30d` | `rdb.v_waitry_pagos_30d` |
| `waitry.v_productos_30d` | `rdb.v_waitry_productos_30d` |
| `caja.v_cortes_totales_30d` | `rdb.v_cortes_totales_30d` |
| `caja.v_cortes_productos_30d` | `rdb.v_cortes_productos_30d` |

Ajustes de columnas para pagos/productos (las vistas rdb no tienen columna `pk` sintética):
- Pagos: `source: 'pk'` → `source: 'payment_id'`
- Productos: `source: 'pk'` → `source: 'id'`
- Cortes Totales: `corte_nombre` → `caja_nombre`; `fecha_operativa` → `hora_inicio`; `total_pedidos` → `total_ingresos`

---

## PASO 7 — Migración de Datos

**Archivo:** `supabase/migrations/20260408_rdb_data_migration.sql`

Script de INSERT con `ON CONFLICT DO NOTHING` para las 11 tablas. Respeta el orden de dependencias de foreign keys:
1. `waitry_inbound`
2. `waitry_pedidos`
3. `waitry_productos` (FK → waitry_pedidos)
4. `waitry_pagos` (FK → waitry_pedidos)
5. `waitry_duplicate_candidates`
6. `cajas`
7. `cortes` (FK → cajas)
8. `movimientos` (FK → cortes)
9. `inv_productos`
10. `inv_entradas` (FK → inv_productos)
11. `inv_ajustes` (FK → inv_productos)

Incluye SELECT de validación de row counts al final.

**⚠️ Ejecutar en ventana de mantenimiento** vía SQL Editor del Dashboard o `supabase db push`.

---

## PASO 8 — Deploy

- **BSOP (Vercel):** commit `b2415af` pusheado a `main` → deploy automático
- **Edge Functions:** pendiente ejecución manual de `supabase functions deploy`

---

## PASO 9 — Validación post-deploy (pendiente)

Checklist a ejecutar tras deploy y migración de datos:

- [ ] Ejecutar `20260408_rdb_expose_postgrest.sql` en Supabase SQL Editor
- [ ] Ejecutar `20260408_rdb_rls.sql` en Supabase SQL Editor
- [ ] Agregar `rdb` en Dashboard → Settings → API → Extra API Schemas
- [ ] Ejecutar `20260408_rdb_data_migration.sql` y verificar row counts
- [ ] Verificar `/rdb/ventas` — pedidos cargando desde `rdb.waitry_pedidos`
- [ ] Verificar `/rdb/cortes` — lista cargando desde `rdb.cortes`
- [ ] Abrir un corte nuevo → debe insertarse en `rdb.cortes`
- [ ] Verificar drawer de corte → totales desde `rdb.v_cortes_totales`, movimientos desde `rdb.movimientos`
- [ ] Deploy `waitry-webhook` → enviar webhook de prueba → verificar en `rdb.waitry_inbound`
- [ ] Deploy `coda-sync-corte` → ejecutar sync de prueba
- [ ] Ejecutar `sync_v2.js` → verificar tablas Coda actualizadas

---

## Mapeo de tablas: original → rdb

| Schema original | Tabla original | rdb tabla |
|----------------|----------------|-----------|
| `waitry` | `inbound` | `rdb.waitry_inbound` |
| `waitry` | `pedidos` | `rdb.waitry_pedidos` |
| `waitry` | `productos` | `rdb.waitry_productos` |
| `waitry` | `pagos` | `rdb.waitry_pagos` |
| `waitry` | `duplicate_candidates` | `rdb.waitry_duplicate_candidates` |
| `caja` | `cajas` | `rdb.cajas` |
| `caja` | `cortes` | `rdb.cortes` |
| `caja` | `movimientos` | `rdb.movimientos` |
| `inventario` | `productos` | `rdb.inv_productos` |
| `inventario` | `entradas` | `rdb.inv_entradas` |
| `inventario` | `ajustes` | `rdb.inv_ajustes` |

## Diferencias de columnas rdb vs originales

| Campo | Schema original | rdb | Notas |
|-------|----------------|-----|-------|
| `corte_nombre` | `caja.cortes` | ❌ no existe | Campo computado; eliminado del INSERT |
| `coda_id` | `caja.cortes` | ❌ no existe | No migrado |
| `turno`, `tipo`, `observaciones` | `caja.cortes` | ❌ no existe | No migrado |
| `c_corte_desc` | `caja.movimientos` | ❌ no existe | No migrado |
| `total_pedidos` | `caja.v_cortes_totales` | ❌ no en rdb view | Null en coda-sync |
| `pk` | `waitry.v_pagos_30d` | → `payment_id` | Columna equivalente |
| `pk` | `waitry.v_productos_30d` | → `id` | Columna equivalente |
