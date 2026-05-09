# Iniciativa — RDB Waitry · Deduplicación de pedidos fantasma

**Estado:** in_progress
**Empresas:** RDB
**Schemas:** `rdb` (`waitry_pedidos.superseded_by_order_id`, `waitry_items_signature`, `detect_waitry_fantasma`, `refresh_waitry_superseded`, triggers en `waitry_pedidos`+`waitry_productos`)
**Última actualización:** 2026-05-09 (Sprint 2 mergeable)

> **Diferencia vs `rdb-waitry-ingesta-dedup`** (cerrada 2026-05-06):
> esa iniciativa atacaba duplicados por **doble-tap del operador** en
> tablet Android — se resolvió cambiando el hardware POS a Windows +
> emulador. Esta iniciativa ataca un patrón distinto: **Waitry reabre
> pedidos ya cerrados ~10 min después y la cajera los re-cierra de
> buena fe**, generando un nuevo `orderId`+`paymentId` con el mismo
> contenido. Son bugs independientes; el primero queda resuelto, este
> sigue activo.

## Problema

Bug interno del POS Waitry: pedidos cerrados (`status=order_ended`,
`paid=true`) reaparecen como abiertos en la pantalla de la cajera unos
minutos después de cerrarse. Para liberar la mesa, la cajera los
re-cierra **sin cobrar de nuevo** (lo confirmó por audio). Waitry,
internamente, asigna nuevo `orderId` + `paymentId` para ese segundo
cierre conservando el resto del record (mismos items, total,
`externalDeliveryId` capturado manualmente, mismo place/table). El
webhook BSOP recibe ese segundo evento como un nuevo pedido cobrado y
lo persiste en `rdb.waitry_pedidos` + `_productos` + `_pagos`.

Resultado: las ventas RDB en BSOP se inflan con cobros fantasma que no
existen físicamente. Caja física cuadra (cobro real único), pero
reportes mienten.

**Importante:** la presencia del campo `external_delivery_id`
(`P-XXXXXX` formato Playtomic) es **señal correlacionada, no causa**.
Waitry y Playtomic NO están integrados; la cajera captura el folio
Playtomic en Waitry como referencia para conciliar después manualmente
(ver iniciativa `rdb-pagos-cancha-conciliacion`). Cuando Waitry duplica
internamente, el campo se duplica también porque copia el record
completo.

**Waitry confirmó al equipo que no van a arreglar el bug de su lado.**
La hostess reportó que el mismo síntoma se observaba ya con Coda como
sink antes de migrar a BSOP — el bug es viejo, no es regresión de la
migración.

### Magnitud histórica (heurística cerrada — ver §Heurística)

| Métrica                         | Valor                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| Pares fantasma desde 2025-11-06 | **41**                                                      |
| Monto fantasma acumulado        | **$8,425**                                                  |
| Span entre original y fantasma  | promedio 3.3 min · máximo **12.4 min**                      |
| Mes peor reciente               | feb-2026 (9 pares · $3,160)                                 |
| Hoy (2026-05-09)                | 2 pares · $650 (cancha coach Aníbal $600 + Electrolife $50) |

Distribución mensual: arrancó nov-2025, oscila entre 2-11 pares/mes.

## Outcome esperado

1. Reportes de ventas RDB exactos en `/rdb/ventas`, `/rdb/cortes` y
   `/rdb/playtomic/conciliacion` — 0 fantasmas alta-confianza
   contabilizados.
2. La cajera puede seguir su flujo actual sin cambios operativos —
   re-cerrar un pedido reaparecido es seguro porque BSOP detecta y
   marca automáticamente.
3. Auditoría completa: ningún dato crudo se borra, los fantasmas
   quedan marcados con `superseded_by_order_id` referenciando al
   canónico.
4. Backfill histórico aplicado: los 41 pares pasados quedan marcados
   sin re-calcular cortes ya cerrados (sólo metadata).

## Heurística de detección (cerrada)

Un pedido B es **fantasma** del pedido A (canónico) si TODAS las
condiciones se cumplen:

1. `external_delivery_id` NOT NULL y **igual** entre A y B
2. `total_amount` igual
3. **Firma de items igual** — hash MD5 de `string_agg(product_id ||
':' || quantity, '|' ORDER BY product_id, quantity)` sobre
   `rdb.waitry_productos`
4. `paid = true` en ambos
5. `B.timestamp - A.timestamp <= 15 minutos`
6. `A.timestamp < B.timestamp` (B es el segundo en aparecer); si los
   timestamps son **idénticos** (caso real observado en `16421246`
   ↔ `16421247`, mismo `2026-03-07 01:33:31`), se rompe el empate por
   `A.order_id < B.order_id` — Waitry numera los `orderId` de forma
   secuencial, así que el menor es el original.
7. A.status NO está cancelado al momento de evaluar (si A se cancela
   posteriormente, se invierte: B se promueve a canónico)

Cuando el match procede: se setea `B.superseded_by_order_id = A.order_id`.

**Por qué este shape:**

- El cap de 15 min evita falsos positivos masivos (con cap de 8h
  detectaríamos 805 pares legítimos: cliente vuelve y pide el mismo
  Electrolife $50 días/semanas después — operación normal en
  Tiendita).
- El span máximo histórico real es 12.4 min, así que 15 da margen sin
  abrir la puerta a falsos positivos.
- Requerir `external_delivery_id` no nulo descarta los 3 pares
  ambiguos sin Playtomic (low-confidence). Si en producción aparecen
  patrones nuevos, se promueve a auto-marker en una v2.
- Items signature evita los falsos positivos donde dos clientes piden
  exactamente el mismo monto ($50) en mismo Playtomic ticket pero
  productos distintos.

## Alcance v1

### Sprint 1 — schema delta + UPDATE puntual de hoy (PR chico)

1. Migración `supabase/migrations/<ts>_rdb_waitry_superseded_column.sql`:
   - `ALTER TABLE rdb.waitry_pedidos ADD COLUMN superseded_by_order_id text`.
   - Index parcial `WHERE superseded_by_order_id IS NULL` para queries
     read del UI.
   - `COMMENT ON COLUMN` explicativo.
   - `UPDATE` puntual de los 2 fantasmas de hoy (`17251086 → 17250975`,
     `17251090 → 17250984`).
   - `NOTIFY pgrst, 'reload schema'`.
2. Filtro inline en `components/ventas/ventas-view.tsx` query: agregar
   `.is('superseded_by_order_id', null)` al `select` de
   `rdb.waitry_pedidos`. (Aún sin vista canónica — eso es Sprint 3.)
3. Regenerar `supabase/SCHEMA_REF.md` y `types/supabase.ts`.
4. Smoke: `/rdb/ventas` filtrado a hoy debe mostrar 7 pedidos (no 9),
   total $1,795 (no $2,445) — confirma que el corte queda corregido.

### Sprint 2 — detección automática + backfill histórico (PR mediano)

1. Migración `supabase/migrations/<ts>_rdb_waitry_detect_fantasma.sql`:
   - Función `rdb.detect_waitry_fantasma(p_order_id text) RETURNS text`
     (devuelve el `order_id` del canónico si match, NULL si no).
     `STABLE` `SECURITY INVOKER` `SET search_path = pg_catalog, public`.
   - Trigger `AFTER INSERT OR UPDATE OF status, total_amount,
external_delivery_id ON rdb.waitry_pedidos`: corre la función,
     setea `superseded_by_order_id` si match.
   - Trigger sibling: si un canónico se marca como `cancelled`,
     re-evaluar su fantasma (lo libera) y re-evaluar pedidos
     posteriores (uno se promueve a canónico).
   - Backfill one-shot: corre la función contra todo el histórico de
     `rdb.waitry_pedidos` (debe marcar los 39 fantasmas restantes; los
     2 de hoy ya están).
2. Tests SQL en `supabase/tests/rdb_waitry_dedup.test.sql`:
   - Insertar par sintético → fantasma detectado.
   - Insertar par con items distintos → NO se marca.
   - Cancelar canónico → fantasma se promueve, libera el marker.
   - Insertar pedido aislado → NO se marca.
3. Regenerar `supabase/SCHEMA_REF.md`.

### Sprint 3 — vista canónica + UI completa + cortes/conciliación (PR grande)

1. Migración: `CREATE VIEW rdb.v_waitry_pedidos AS SELECT *,
superseded_by_order_id IS NOT NULL AS es_fantasma FROM
rdb.waitry_pedidos`. (`security_invoker=on` per
   `views_security_invoker` migration policy.)
2. `/rdb/ventas`:
   - Cambiar query a la vista canónica (default: filtrar fantasmas).
   - Toggle "Mostrar duplicados detectados (X)" (default off).
   - Cuando toggle activo: badge tone=warning con tooltip "Detectado
     como duplicado del pedido <link a canónico>".
   - Quitar el `.is('superseded_by_order_id', null)` inline
     introducido en Sprint 1 (ya queda en la vista).
3. `/rdb/cortes`: switchear a vista canónica para totales. NO
   re-calcula cortes ya cerrados; solo agrega nota informativa
   ("X pedidos detectados como duplicados Waitry post-cierre, monto:
   $Y") en metadata cuando corresponda.
4. `/rdb/playtomic/conciliacion`: switchear a vista canónica.
5. ADR cross-iniciativa: `docs/adr/<n>_rdb_waitry_dedup.md` con la
   heurística + por qué vive en BSOP en lugar de Waitry +
   trade-offs.
6. Smoke: cuadrar reportes vs caja física en 3 cortes recientes
   (debe coincidir con el efectivo recibido por la cajera).

## Decisiones registradas

- **2026-05-09** Heurística cerrada: requerir `external_delivery_id`
  no nulo + cap de 15 min entre original y fantasma + items signature
  - mismo `total_amount`. Rationale: span máximo histórico real 12.4
    min; 15 min da margen sin abrir falsos positivos. Pares sin
    `external_delivery_id` (3 históricos) quedan fuera del marker
    automático en v1.
- **2026-05-09** Cortes históricos NO se re-calculan (datos
  inmutables). Sólo se agrega metadata informativa "N fantasmas
  detectados post-cierre" donde aplique.
- **2026-05-09** UI muestra fantasmas ocultos por default + toggle
  para verlos cuando se necesita auditoría.
- **2026-05-09** No se agrega cron en v1; el trigger cubre detección
  en línea. Se agrega solo si emerge caso de borde donde el trigger no
  dispara (ej. backfill desde import manual).
- **2026-05-09** Cuando el canónico se cancela posteriormente, el
  fantasma se promueve a canónico (libera el marker). Trigger sibling
  lo maneja.
- **2026-05-09** Sprint 1 land hoy mismo para corregir el corte de
  hoy. Backfill histórico difiere a Sprint 2 (no urgente; los datos
  pasados llevan meses con el ruido).

## Bitácora

- **2026-05-09 — Sprint 1 mergeado** ([PR #464](https://github.com/beto-sudo/BSOP/pull/464)).
  Schema delta + UPDATE puntual de los 2 fantasmas detectados hoy +
  filtro inline en 3 readers (`/rdb/ventas` view + por-producto + `/rdb/home` KPIs).
  Corte del día corregido: 7 pedidos / $1,795 (no 9 / $2,445).
- **2026-05-09 — Sprint 2 mergeable** (este PR).
  Función `rdb.detect_waitry_fantasma(text)` + helper
  `rdb.waitry_items_signature(text)` + `rdb.refresh_waitry_superseded(text)`
  - triggers AFTER en `waitry_pedidos` (cols clave) y `waitry_productos`
    con guard `pg_trigger_depth() > 1`. Backfill SQL nativo (CTE + self-join)
    marcó los 37 fantasmas históricos restantes; total ahora 39 marcados.
    Refinamiento de heurística durante backfill: timestamps idénticos
    (caso real `16421246`↔`16421247`) requirieron tiebreaker por
    `order_id`. 4 smoke tests pasan: par sintético, items distintos,
    cascada cancelación, span > 15 min. Index nuevo
    `waitry_pedidos_external_delivery_id_idx` (parcial WHERE NOT NULL AND
    paid=TRUE) acelera lookups del trigger live.

## Riesgos y mitigaciones

| Riesgo                                                                          | Mitigación                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Falso positivo: 2 compras legítimas con mismo external + total dentro de 15 min | Items signature elimina el caso casi por completo. Trigger se puede desactivar manualmente si emerge un patrón inesperado.                                                                                            |
| Original cancelado después → fantasma queda como canónico                       | Trigger sibling re-evalúa al cambio de `status`.                                                                                                                                                                      |
| Webhook re-emite el pedido fantasma con cambios → trigger se confunde           | El upsert del webhook no toca `superseded_by_order_id` (no está en `pedidoRow`); columna queda intacta. Trigger re-evalúa solo si cambian las columnas relevantes (`status`, `total_amount`, `external_delivery_id`). |
| Performance: trigger ejecuta query sobre `waitry_productos` para items sig      | Bajo volumen real (~50 pedidos/día); items signature precomputable en Sprint 2 si emerge problema.                                                                                                                    |
| Backfill marca falsos positivos en histórico                                    | Backfill corre con la misma función + heurística cerrada. Si emerge caso, se rolledback con `UPDATE … SET superseded_by_order_id = NULL` con WHERE.                                                                   |

## Métricas de éxito

- Sprint 1: corte de hoy refleja $1,795 en /rdb/ventas (no $2,445).
- Sprint 2: 41/41 fantasmas históricos marcados tras backfill. Tests
  SQL pasan.
- Sprint 3: cortes de las últimas 2 semanas cuadran con caja física
  reportada por la cajera (margen <0.5%).
- Operativo: 0 reportes nuevos de "veo ventas duplicadas" durante 30
  días post-merge Sprint 3.
