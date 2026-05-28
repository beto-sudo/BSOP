# ADR-035 — RDB Waitry: pago no completado (`paid=false`) NO es venta

**Status:** Accepted + aplicado a prod (2026-05-28). Beto autorizó; migración
`20260528210000` aplicada vía `supabase db push`. Resultado verificado: el
backfill revirtió 118 movimientos de inventario (198.16 unidades devueltas al
stock), 134 cortes recalculan al leer, y 361 pedidos `paid=false` quedan
preservados en la tabla base como auditoría.
**Iniciativa:** [`rdb-waitry-deduplicacion`](../planning/rdb-waitry-deduplicacion.md)
(follow-up; bug distinto al de fantasmas pero comparte la vista canónica).
**Migración:** [`20260528210000_rdb_waitry_paid_false_no_venta_f3.sql`](../../supabase/migrations/20260528210000_rdb_waitry_paid_false_no_venta_f3.sql).
**Empresas afectadas:** RDB (único cliente Waitry).
**Relación:** complementa [ADR-031](031_rdb_waitry_dedup_heuristic.md) (fantasmas)
y **deroga WAITRY-DEDUP-4 solo para `paid=false`** (ver más abajo).

## Contexto

Dos reportes en mayo 2026 destaparon tres fenómenos distintos en los datos
Waitry de RDB:

- **Correo "Movimientos duplicados" (Pablo, RDB).**
- **Pedido BSOP `17444675`**: no aparece en Waitry, en Stripe figura como
  **"Pago Fallido"**, y aun así estaba en BSOP como venta.

El triage separó tres fenómenos:

| ID     | Fenómeno                                              | Estado           |
| ------ | ----------------------------------------------------- | ---------------- |
| **F1** | Fantasmas que escapan al cap de 15 min de ADR-031     | Diferido         |
| **F2** | Multi-pago sobre el mismo folio (cosmético)           | Explicar a Pablo |
| **F3** | **Pagos fallidos (`paid=false`) contados como venta** | **Este ADR**     |

F3 es la raíz del caso `17444675`: el POS Waitry persiste el pedido con
`paid=false` cuando el cobro Stripe falla, pero BSOP lo trataba como venta:
aparecía en `rdb.v_waitry_pedidos`, sumaba en los totales de corte, inflaba la
reportería por producto/categoría, y **disparaba salidas de inventario** (el
trigger `erp.fn_trg_waitry_to_movimientos` solo excluía `order_canceled`, no el
no-pagado).

### Magnitud medida (2026-05-28, prod)

- **361 pedidos `paid=false`** históricos, span **2025-09-08 → 2026-05-25**,
  **$16,215.00** en `total_amount`.
- **359** tienen `corte_id` → tocan **134 cortes** distintos cuyos totales se
  recalculan al leer la vista corregida.
- **137 líneas de producto** (222 unidades, **$15,656.80**) que inflaban la
  reportería por producto/categoría.
- **118 movimientos de inventario** ('salida', `referencia_tipo='venta_waitry'`)
  ya creados para esos pedidos → unidades a devolver al stock vía backfill.
- Solo **$60.00** de los `paid=false` se cobraron como `cash` (resto Stripe) →
  el impacto en la conciliación de efectivo es marginal (ver Trade-offs).

## Decisión

Semántica fijada por Beto (verbatim):

> _"si `paid=false` debería de aparecer el pedido como pago cero y venta no
> hecha, productos no descontados, que quede el registro y el intento de venta
> hecho pero no terminado, no vendido, no salidas de producto"_

Es decir: un pedido `paid<>true` **se preserva como registro/auditoría** (el
intento de venta queda), pero **no es venta** — pago cero, no cuenta en
totales ni reportería, no descuenta inventario.

Decisiones operativas asociadas (vía AskUserQuestion):

- **Históricos → "corregir todo retroactivo"**: se corrigen TODOS los cortes,
  incluso cerrados. Justificación: un pago fallido **nunca fue** una venta real
  (a diferencia de un fantasma, que sí fue una venta real pero duplicada); por
  eso corregirlo no re-litiga un hecho de negocio cerrado, sino que **enmienda
  un dato erróneo**.
- **Inventario → "revertir y devolver al stock"**: se borran las salidas ya
  creadas para pedidos `paid=false`.

## Alcance (migración `20260528210000`)

La corrección vive **completamente en BSOP** (vistas + triggers), sin mutar ni
borrar datos crudos del webhook.

**Vistas — excluyen `paid<>true` (semántica "no vendido"):**

1. `rdb.v_waitry_pedidos` — canónica financiera: `WHERE superseded_by_order_id
IS NULL AND paid IS TRUE`.
2. `rdb.v_cortes_totales` — `AND paid IS TRUE` en los CTEs de pagos y conteo;
   al ser vista (no materializada) corrige los 134 cortes al recalcularse en
   cada lectura.
3. `rdb.v_cortes_productos` — desglose por producto del corte (path financiero);
   ya hacía JOIN a pedidos, solo se añade `AND wp.paid IS TRUE`.
4. **Reportería producto/ventas (5 vistas)** que leían `rdb.waitry_productos`
   crudo **sin join a pedidos**: `v_producto_metricas`,
   `v_producto_tendencia_semanal`, `v_producto_ultima_venta`,
   `v_productos_tabla` (CTE `ultimo_precio_waitry`) y
   `v_waitry_productos_categoria`. Se añade el filtro vía
   `EXISTS (SELECT 1 FROM rdb.waitry_pedidos pe WHERE pe.order_id = wp.order_id
AND pe.paid IS TRUE)`. Estas alimentan `/rdb/productos` y `/rdb/ventas` (por
   producto / por categoría) — sin el filtro seguirían mostrando los $15,656.80
   de intentos fallidos como venta.

**Triggers — espejo de la cancelación para `paid`:**

5. `erp.fn_trg_waitry_to_movimientos` — lee `paid` del pedido y **no crea
   salida** si `paid<>true` (igual que ya hacía con `order_canceled`).
6. `erp.fn_trg_waitry_pedidos_cancel` — generalizado: borra las salidas también
   cuando `paid` pasa de `true` a no-true.

**Backfill (one-shot, idempotente):**

7. Borra las salidas `'venta_waitry'` de pedidos `paid=false` históricos →
   devuelve unidades al stock. Un segundo run borra 0 filas.

### Por qué este shape

- **Filtro `EXISTS` (no JOIN) en la reportería**: `order_id` es único en
  `waitry_pedidos` (0 duplicados) y no hay líneas de producto huérfanas (0), así
  que `EXISTS` no altera la cardinalidad ni descarta productos sin venta — solo
  excluye las líneas `paid=false`. Un JOIN dentro de un `LEFT JOIN` habría
  cambiado la semántica (productos sin venta desaparecerían).
- **Retroactivo "gratis" vía vista**: `v_cortes_totales` no es materializada;
  el filtro corrige los 134 cortes al leer. Las columnas congeladas
  `erp.cortes_caja.total_*` están sin uso (0/495 pobladas) → no requieren
  backfill. `efectivo_contado` (efectivo físico) no se toca.
- **El guard del trigger de productos basta para los flips por webhook**:
  `supabase/functions/waitry-webhook` upsertea `waitry_pedidos` (con `paid`)
  **antes** del delete+insert de `waitry_productos`. El trigger de productos lee
  el `paid` ya actualizado:
  - `paid false→true` (re-pago): productos se re-insertan → crea salidas. ✓
  - `paid true→false`: productos se re-insertan con `paid=false` → no crea, y el
    trigger de pedidos borra las viejas. ✓
    El guard del trigger de pedidos es defensa en profundidad para un flip de
    `paid` que NO venga por webhook (UPDATE manual).

## Reglas duras

**WAITRY-PAID-1.** Todo read financiero / de reportería de venta lee de las
vistas (`v_waitry_pedidos`, `v_cortes_totales`, `v_cortes_productos`, las 5 de
producto/ventas), nunca de `rdb.waitry_pedidos`/`waitry_productos` directo. Las
vistas ya excluyen `paid<>true`.

**WAITRY-PAID-2.** Los datos crudos (`rdb.waitry_pedidos`, `_productos`,
`_pagos`) NUNCA se borran ni se mutan por F3. El intento de venta fallido se
preserva para auditoría en la tabla base y en
`rdb.v_waitry_pedidos_con_fantasmas` (que NO filtra `paid`).

**WAITRY-PAID-3.** El inventario NO registra salida por pedido `paid<>true`. Si
`paid` se vuelve `true`, la salida se (re)crea; si vuelve a no-true, se borra.

**WAITRY-PAID-4 (deroga WAITRY-DEDUP-4 solo para `paid`).** A diferencia de los
fantasmas (cortes cerrados inmutables), los pedidos `paid=false` **sí** corrigen
cortes cerrados, porque nunca fueron venta. El resto de WAITRY-DEDUP-4 (fantasmas
no recalculan cierres) sigue vigente.

## Trade-offs

- **Conciliación de efectivo en `paid=false` + `cash`**: si la cajera cobró
  efectivo físico pero Waitry marcó `paid=false`, `efectivo_esperado` baja y
  podría aparecer un sobrante de caja. Impacto histórico: **$60.00 en toda la
  serie** — marginal. Si crece, se reconsidera un override por método.
- **Pedido legítimamente pagado con `paid=false` por bug del POS**: quedaría
  oculto como venta. No observado; el registro crudo permite detectarlo y, de
  pasar, basta corregir `paid` (el trigger y las vistas se re-evalúan solos).
- **Reportería de "intentos fallidos"**: las vistas default ya no los muestran;
  para verlos hay que leer la tabla base o la vista de auditoría. Aceptable —
  el default debe mostrar ventas reales.

## Alternativas consideradas

- **Filtrar `paid` solo en `v_waitry_pedidos` y dejar que el resto herede**:
  descartado — la reportería de producto/ventas y `v_cortes_*` leen tablas
  crudas o sus propios CTEs, no la canónica, así que no heredan el filtro.
- **Dedupe/validación en el webhook** (`waitry-webhook`): descartado por la
  misma razón que ADR-031 — el webhook es recorder pasivo; la lógica de negocio
  no se acopla a la edge function.
- **No tocar reportería de producto (solo lo financiero)**: descartado — dejaría
  $15,656.80 de intentos fallidos visibles como venta en `/rdb/ventas`,
  contradiciendo "no vendido".

## Pendientes (fuera de alcance de F3)

- **F1** — fantasmas que escapan al cap de 15 min de ADR-031.
- **F2** — explicar a Pablo el multi-pago sobre el mismo folio (cosmético).
- ~~**`rdb.handle_sc_corte_on_open`**~~ — **resuelto 2026-05-28** (migración
  `20260528221756`). El diagnóstico encontró **dos** funciones gemelas: la `rdb`
  (código muerto — sin trigger, porque `rdb.cortes` nunca existió y el guard de
  su migración original nunca creó el trigger) se **eliminó**; la `erp`
  (viva — trigger `trg_sc_corte_on_open_erp` en `erp.cortes_caja`, 93 Corte-SC
  creados) se **corrigió** (`'order_cancelled'`→`'order_canceled'` y
  `+ AND paid IS TRUE` en el conteo y la asignación de huérfanos). Confirmado
  latente: el typo no vive en ninguna vista (solo en estas funciones) y
  `v_cortes_totales` ya filtraba correcto, por eso no afectó totales. Sin
  backfill, consistente con F3 (la vista ya excluye). Huella histórica
  cosmética: 35 pedidos no-pagados/cancelados quedaron en algún Corte-SC, 9/93
  Corte-SC sin venta real — su saneamiento, si se desea, es paso aparte.

## Referencias

- ADR hermano (fantasmas): [ADR-031](031_rdb_waitry_dedup_heuristic.md).
- Iniciativa: [`docs/planning/rdb-waitry-deduplicacion.md`](../planning/rdb-waitry-deduplicacion.md).
- Migración F3: [`supabase/migrations/20260528210000_rdb_waitry_paid_false_no_venta_f3.sql`](../../supabase/migrations/20260528210000_rdb_waitry_paid_false_no_venta_f3.sql).
