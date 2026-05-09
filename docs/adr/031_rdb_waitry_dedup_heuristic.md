# ADR-031 — RDB Waitry: deduplicación de pedidos fantasma BSOP-side

**Status:** Accepted (2026-05-09)
**Iniciativa:** [`rdb-waitry-deduplicacion`](../planning/rdb-waitry-deduplicacion.md)
**Sprints:** 1 ([PR #464](https://github.com/beto-sudo/BSOP/pull/464)) +
2 ([PR #465](https://github.com/beto-sudo/BSOP/pull/465)) + 3 (este PR).
**Empresas afectadas:** RDB (único cliente Waitry).

## Contexto

El POS Waitry de RDB (Rincón del Bosque) emite pedidos duplicados cuando
la cajera "re-cierra" un pedido que reaparece en pantalla después del
primer cierre. Cada re-cierre genera un **nuevo `orderId` + `paymentId`**
con los mismos items, total, mesa, y el mismo `externalDeliveryId`
(captura manual del folio Playtomic — Waitry y Playtomic NO están
integrados; el campo es informativo). El webhook BSOP recibe el segundo
evento como un pedido distinto y lo persiste en `rdb.waitry_pedidos`,
inflando los reportes.

Magnitud histórica: **41 pares fantasma** desde 2025-11-06 ($8,425
acumulado), span típico 3 min entre original y fantasma (máximo 12.4
min). Caja física no se afecta — los reportes mienten, no la caja.

## Causa raíz operativa (descubierta 2026-05-09)

Pablo (encargado RDB) confirmó que la configuración de Waitry es
intencional y NO se puede cambiar sin romper la operación de cocina:

| Toggle Waitry POS                              | Estado RDB | Razón                                                                                              |
| ---------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| **Cerrar pedidos de mostrador luego del pago** | **OFF** ❌ | Si está ON, los pedidos cobrados no aparecen en pantalla de cocina y Leslie no los puede preparar. |
| No enviar a cocina sin cobrar                  | ON ✅      |                                                                                                    |
| No cerrar pedido sin registro de pago          | ON ✅      |                                                                                                    |
| No emitir comprobante sin registro de pago     | ON ✅      |                                                                                                    |

El modelo de Waitry tiene un **trade-off forzado**: o los pedidos se
cierran al cobrar (sin duplicación pero invisibles para cocina), o
quedan abiertos para que cocina los vea (visibles pero re-cerrables, lo
que genera duplicación). RDB priorizó "cocina los ve" sobre "no se
duplican". Soporte de Waitry confirmó verbalmente "no podemos hacer
nada" — su modelo no admite ambas necesidades simultáneamente.

## Decisión

La deduplicación de fantasmas Waitry vive **completamente en BSOP**, sin
mutar datos crudos del webhook ni cambiar el flujo operativo de la cajera.

### Heurística cerrada

Un pedido B es **fantasma** del pedido A (canónico) si TODAS:

1. `external_delivery_id` NOT NULL e **igual** entre A y B.
2. `total_amount` igual.
3. **Firma de items igual** — `md5(string_agg(product_id || ':' ||
quantity, '|' ORDER BY product_id, quantity))` sobre
   `rdb.waitry_productos`.
4. `paid = TRUE` en ambos.
5. `B.timestamp - A.timestamp ≤ 15 minutos`,
   `A.timestamp < B.timestamp`. **Tiebreaker** cuando los timestamps
   son idénticos (caso real `16421246` ↔ `16421247` el 2026-03-07
   01:33:31): `A.order_id < B.order_id` (Waitry numera secuencialmente).
6. Ninguno con `status` cancel-like (cancellation flip cascada: si un
   canónico se cancela posteriormente, su fantasma se promueve a
   canónico).

### Por qué este shape

- **Cap 15 min** evita falsos positivos masivos. Sin cap, había 805
  "pares" detectables que en realidad eran ventas legítimas a días o
  semanas de distancia (cliente vuelve a comprar el mismo Electrolife
  $50 en Tiendita).
- **Span máximo histórico real: 12.4 min**, así que 15 min da margen
  sin abrir la puerta a falsos positivos.
- **Items signature** evita falsos positivos donde dos clientes en el
  mismo Playtomic ticket (bug muy raro pero observable) piden montos
  iguales pero productos distintos.
- **Requerir `external_delivery_id`** descarta los 3 pares ambiguos
  históricos sin Playtomic (low-confidence). Si emerge patrón nuevo,
  se promueve a auto-marker en una v2.

### Schema

- `rdb.waitry_pedidos.superseded_by_order_id text NULL` con index
  parcial canónicos (Sprint 1 — [migración
  `20260509190634`](../../supabase/migrations/20260509190634_rdb_waitry_superseded_column.sql)).
- `rdb.waitry_items_signature(text)`,
  `rdb.detect_waitry_fantasma(text)`,
  `rdb.refresh_waitry_superseded(text)` (Sprint 2 — [migración
  `20260509192652`](../../supabase/migrations/20260509192652_rdb_waitry_detect_fantasma.sql)).
- Triggers AFTER en `rdb.waitry_pedidos` (cols clave) y
  `rdb.waitry_productos` con guard `pg_trigger_depth() > 1`.
- Index parcial `waitry_pedidos_external_delivery_id_idx` para acelerar
  lookups del trigger.
- Vistas `rdb.v_waitry_pedidos` (canónica) y
  `rdb.v_waitry_pedidos_con_fantasmas` (auditoría con flag
  `es_fantasma`) — ambas `security_invoker=on` (Sprint 3).

### UI

- `/rdb/ventas`, `/rdb/ventas` "Por producto", `/rdb/home` KPIs y
  `/rdb/playtomic/conciliacion` leen de `rdb.v_waitry_pedidos` por
  default (fantasmas ocultos).
- `/rdb/ventas` tiene toggle **"Mostrar duplicados"** que cambia la
  fuente a `rdb.v_waitry_pedidos_con_fantasmas` y agrega badge
  "Duplicado" en cada fila marcada con tooltip apuntando al canónico.
- `app/rdb/playtomic/conciliacion/actions.ts` rechaza la asignación
  cuando el `order_id` es fantasma (la vista canónica devuelve null).

## Reglas duras

**WAITRY-DEDUP-1.** El webhook entrante (`supabase/functions/waitry-webhook`)
es write-only sobre `rdb.waitry_pedidos`/`_productos`/`_pagos` con upsert por
`order_id`. NO toca `superseded_by_order_id` — el upsert construye `pedidoRow`
con campos específicos, así que los re-emisiones del webhook no pisan el
marker.

**WAITRY-DEDUP-2.** Todos los reads de UI, reportes y conciliación que
necesitan totales financieros leen de `rdb.v_waitry_pedidos`, no de
`rdb.waitry_pedidos` directo.

**WAITRY-DEDUP-3.** Los datos crudos en `rdb.waitry_pedidos` NUNCA se
borran. Los fantasmas se marcan con `superseded_by_order_id` apuntando al
canónico. Auditoría preservada.

**WAITRY-DEDUP-4.** Cortes ya cerrados NO se re-calculan al detectar
fantasmas post-cierre. Los datos históricos quedan con su total
original; las vistas canónicas reflejan la realidad pero los cierres
contables son inmutables.

**WAITRY-DEDUP-5.** Si Waitry alguna vez ofrece deduplicación a nivel
de webhook (idempotency keys, sub-eventos `order.reopened`), se
mantiene la solución BSOP-side como red de seguridad pero se actualiza
el ADR.

## Trade-offs

- **Falsos positivos posibles**: 2 compras legítimas con mismo
  `externalDeliveryId` + total + items signature dentro de 15 min.
  Items signature reduce el riesgo a casi cero. Si emerge en
  producción, la columna `superseded_by_order_id` se puede limpiar con
  `UPDATE … SET superseded_by_order_id = NULL` puntual (idempotente —
  el trigger lo re-evalúa).
- **No detecta fantasmas sin `external_delivery_id`**: 3 casos
  históricos. Aceptable en v1; si crece se promueve a auto-marker.
- **Performance del trigger**: detect función llama
  `waitry_items_signature` 1 + N veces por pedido modificado (1 para
  target, N para candidatos). Bajo volumen real (~50 pedidos/día), no
  hay problema. Backfill one-shot evitó las llamadas per-row con
  CTE+self-join (single SQL UPDATE).
- **El trigger en `waitry_productos` re-evalúa el parent en cada
  cambio**. El webhook hace DELETE+INSERT de productos por update; el
  trigger fire por cada row. Recursión cortada con
  `pg_trigger_depth()`. Costo aceptable.

## Alternativas consideradas

- **Activar el toggle "Cerrar pedidos de mostrador luego del pago"**
  en Waitry: descartado por Pablo — rompe la operación de cocina.
- **Migrar a Waitry POS** (módulo dedicado con KDS): no descartado pero
  fuera del scope; conversación comercial pendiente.
- **Webhook dedupe inline** (modificar `waitry-webhook` para detectar
  duplicados antes del upsert): descartado — el webhook es passive
  recorder, agregar lógica de negocio acopla la edge function al bug.
- **Cron diario de re-evaluación**: descartado en v1 — el trigger
  cubre detección en línea. Se reconsidera si emerge caso de borde
  donde el trigger no dispara (e.g., backfill desde import manual).

## Referencias

- Iniciativa: [`docs/planning/rdb-waitry-deduplicacion.md`](../planning/rdb-waitry-deduplicacion.md).
- Sprint 1 (schema delta + manual marks): [PR #464](https://github.com/beto-sudo/BSOP/pull/464).
- Sprint 2 (función + triggers + backfill): [PR #465](https://github.com/beto-sudo/BSOP/pull/465).
- Bug previo distinto (resuelto): `rdb-waitry-ingesta-dedup` (cerrada
  2026-05-06) — atacaba doble-tap operacional en tablet Android, se
  resolvió cambiando hardware POS a Windows + emulador.
- Help center Waitry (sin acceso al toggle desde panel RDB):
  [Configuraciones generales](https://help.waitry.net/es/article/waitry-pos-configuraciones-generales-4kdxga/).
