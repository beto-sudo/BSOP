# ADR-036 — RDB Waitry: fantasmas tardíos (fuera del cap de 15 min) + propagación a cortes/inventario

**Status:** Accepted + aplicado a prod (2026-05-28). Beto autorizó "corregir todo
retroactivo + ventana 48h". Migración
[`20260528234944_rdb_waitry_f1_fantasmas_superseded.sql`](../../supabase/migrations/20260528234944_rdb_waitry_f1_fantasmas_superseded.sql).
**Iniciativa:** [`rdb-waitry-fantasmas-tardios`](../planning/rdb-waitry-fantasmas-tardios.md)
(el "F1" del triage de mayo 2026).
**Empresas afectadas:** RDB (único cliente Waitry).
**Relación:** completa [ADR-031](031_rdb_waitry_dedup_heuristic.md) (fantasmas) y es
hermana de [ADR-035](035_rdb_waitry_paid_false_no_venta.md) (F3, `paid=false`). Comparte
las mismas 7 vistas y triggers.

## Contexto

El triage de mayo 2026 separó tres fenómenos en los datos Waitry (ver ADR-035 §Contexto).
Este ADR cierra **F1**, que resultó ser dos defectos compuestos:

**(A) Fantasmas tardíos.** La heurística de ADR-031 (`rdb.detect_waitry_fantasma`) marca
un pedido como fantasma cuando comparte `external_delivery_id` + `total_amount` + firma de
items con otro, **pero solo dentro de una ventana de 15 min**. 23 grupos de duplicados
idénticos quedaban fuera del cap (spread 17 min – 5.9 h) → **24-25 pedidos extra ($6,678)**
se contaban como venta real.

**(B) ADR-031 marcó pero no propagó.** Al diagnosticar (A) se descubrió que **solo
`rdb.v_waitry_pedidos` filtraba `superseded_by_order_id`**. `v_cortes_totales`,
`v_cortes_productos`, las 5 vistas de reportería de producto/ventas y el trigger de
inventario **NO lo filtraban** → los 40 fantasmas ya marcados por ADR-031 **seguían
inflando** cortes, reportería e inventario.

### Magnitud medida (2026-05-28, prod, post-apply)

- **65 fantasmas marcados** (40 históricos de ADR-031 + 25 nuevos por la ventana 48h).
- **$14,353** en pagos de fantasmas **excluidos de 42 cortes** (antes contados como venta).
  De eso, ~$4,193 era efectivo → había inflado `efectivo_esperado` y contribuido a
  faltantes de cajera que en realidad eran duplicados del POS.
- **~72 salidas de inventario** ('salida', `venta_waitry`) de fantasmas **revertidas**
  (≈30 al marcar los nuevos vía trigger + 42 en el backfill one-shot).
- **13,084 pedidos crudos intactos** — no se borró ni mutó ningún pedido/pago.

## Decisión

Un fantasma (duplicado del POS) **NO es una segunda venta**: no cuenta en cortes,
reportería ni descuenta inventario — exactamente el tratamiento que F3 dio a `paid=false`.
El registro crudo se preserva (auditoría).

Decisiones operativas (Beto, 2026-05-28):

- **Corregir TODO retroactivo** (incluidos cortes cerrados). Justificación: un fantasma
  infló ingresos/efectivo que **nunca fueron una segunda venta real**; corregir enmienda
  un dato erróneo y **exonera faltantes de cajera** atribuidos al duplicado. (Igual lógica
  que F3; deroga WAITRY-DEDUP-4 — ver abajo.)
- **Ventana de detección 48 h** (ampliada de 15 min). El ancla real es
  `external_delivery_id` + `total` + items signature; los 23 grupos caen todos <6 h, así
  que 48 h da margen sin falsos positivos (el `external_delivery_id` es único por
  transacción; solo se reutiliza a muy largo plazo — ahí entra el guardrail temporal).

## Alcance (migración `20260528234944`, espejo de F3 con `superseded` en vez de `paid`)

1. `rdb.detect_waitry_fantasma` — `INTERVAL '15 minutes'` → `'48 hours'`. El re-backfill
   de detección marca los 25 nuevos; el trigger los marca a futuro.
2. **Las 7 vistas que F3 tocó por `paid` ahora también excluyen `superseded_by_order_id`:**
   `v_cortes_totales`, `v_cortes_productos`, `v_producto_ultima_venta`,
   `v_producto_metricas`, `v_producto_tendencia_semanal`, `v_productos_tabla`,
   `v_waitry_productos_categoria`. (`v_waitry_pedidos` ya lo filtraba.) Vistas
   no-materializadas → corrigen los 42 cortes retroactivo al leer.
3. `erp.fn_trg_waitry_to_movimientos` — guard: no crea salida si el pedido está
   `superseded` (sumado a los guards de cancel/paid de F3).
4. `erp.fn_trg_waitry_pedidos_cancel` — borra salidas también cuando el pedido pasa a
   `superseded` (NULL → no-NULL). El trigger dispara `AFTER UPDATE` (cualquier columna),
   así que reacciona al marcado.
5. Backfill: re-marca los 25 nuevos (ventana 48 h) + revierte las ~72 salidas de inventario
   de todos los `superseded`. Idempotente.

## Reglas duras

**WAITRY-FANT-1.** Todo read financiero / de reportería de venta lee de las vistas (las 7 +
`v_waitry_pedidos`), nunca de las tablas base directo. Las vistas excluyen `superseded`
(fantasmas) y `paid<>true`.

**WAITRY-FANT-2.** Los datos crudos NUNCA se borran ni mutan por F1. El fantasma se preserva
en la tabla base y en `rdb.v_waitry_pedidos_con_fantasmas` (con flag `es_fantasma`).

**WAITRY-FANT-3.** El inventario NO registra salida por pedido `superseded`. Al marcarse
fantasma, su salida se borra; si dejara de serlo (se re-evalúa), el webhook la re-crea.

**WAITRY-FANT-4 (refuerza la derogación de WAITRY-DEDUP-4).** Los fantasmas **sí** corrigen
cortes cerrados retroactivamente — porque nunca fueron una segunda venta. F3 ya había
derogado WAITRY-DEDUP-4 para `paid=false` (WAITRY-PAID-4); F1 lo extiende a fantasmas. La
inmutabilidad de cortes cerrados de ADR-031 queda **obsoleta** para ambos casos de dato
erróneo.

## Por qué este shape

- **Ventana 48 h, no más:** los 23 grupos están todos <6 h; 48 h es holgura segura porque
  `external_delivery_id`+total+items ya es discriminante (96.4% de cobertura, único por
  transacción). Subir más arriesgaría capturar reutilización legítima del ID.
- **Espejo de F3:** las 7 vistas y los 2 triggers son los mismos; solo cambia el predicado
  (`superseded_by_order_id IS NULL` en vez de `paid IS TRUE`). Reduce superficie de error.
- **Retroactivo "gratis" vía vista:** `v_cortes_totales` no es materializada → el filtro
  corrige los 42 cortes al leer, sin backfill de columnas congeladas.

## Trade-offs

- **Cortes cerrados cambian de total.** Decisión explícita ("corregir todo"). En la
  práctica reduce faltantes de cajera (los duplicados inflaban `efectivo_esperado`).
- **8 grupos ambiguos** (mismo `external_delivery_id`, total distinto) NO se auto-detectan
  — quedan para revisión manual. No se marcan para evitar falsos positivos.
- **Falso positivo teórico a 48 h:** dos compras legítimas idénticas con el mismo
  `external_delivery_id` en <48 h. No observado; el ID es único por transacción.

## Alternativas consideradas

- **Solo ampliar la ventana (sin propagar a cortes/inventario):** descartado — habría dejado
  los 40 fantasmas de ADR-031 (+ los 25 nuevos) inflando cortes/reportería/inventario.
- **`--include-all` para aplicar out-of-order:** descartado — se renombró la migración a un
  timestamp posterior para mantener el historial cronológico.
- **Vista de auditoría sin marcar (detección pura):** descartado por Beto a favor de
  corregir directo.

## Pendientes (fuera de alcance de F1)

- **F2** — explicar a Pablo el multi-pago sobre el mismo folio (cosmético).
- **8 grupos ambiguos** (mismo `external_delivery_id`, total distinto) — revisión manual.

## Referencias

- ADR base (fantasmas): [ADR-031](031_rdb_waitry_dedup_heuristic.md).
- ADR hermano (F3, `paid=false`): [ADR-035](035_rdb_waitry_paid_false_no_venta.md).
- Iniciativa: [`docs/planning/rdb-waitry-fantasmas-tardios.md`](../planning/rdb-waitry-fantasmas-tardios.md).
- Migración: [`20260528234944_rdb_waitry_f1_fantasmas_superseded.sql`](../../supabase/migrations/20260528234944_rdb_waitry_f1_fantasmas_superseded.sql).
