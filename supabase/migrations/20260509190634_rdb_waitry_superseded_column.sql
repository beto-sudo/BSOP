-- MIGRATION: rdb.waitry_pedidos — columna superseded_by_order_id (Sprint 1)
--
-- CONTEXTO (iniciativa rdb-waitry-deduplicacion):
--   Bug interno del POS Waitry: pedidos cerrados (status=order_ended,
--   paid=true) reaparecen como abiertos en la pantalla de la cajera unos
--   minutos después de cerrarse. Para liberar la mesa, la cajera los
--   re-cierra sin cobrar de nuevo. Waitry asigna nuevo orderId/paymentId
--   conservando el resto del record (mismos items, total, mismo
--   external_delivery_id capturado manualmente como folio Playtomic). El
--   webhook BSOP recibe ese segundo evento como un nuevo pedido cobrado y
--   lo persiste en rdb.waitry_pedidos como fila distinta.
--
--   Magnitud histórica (heurística cerrada — ver planning doc): 41 pares,
--   $8,425 acumulado desde 2025-11-06; span máximo 12.4 min, promedio 3.3
--   min entre original y fantasma.
--
--   Waitry confirmó al equipo que no van a arreglar el bug. Solución vive
--   en BSOP.
--
--   NO confundir con rdb-waitry-ingesta-dedup (cerrada 2026-05-06): esa era
--   por doble-tap operacional en tablet Android, resuelta cambiando hardware
--   POS. Esta es bug del POS Waitry (reapariciones), distinta causa raíz.
--
-- ALCANCE Sprint 1 (este archivo):
--   1. ADD COLUMN superseded_by_order_id text NULL.
--   2. Index parcial WHERE superseded_by_order_id IS NULL (la mayoría de
--      reads del UI son sobre canónicos).
--   3. UPDATE puntual de los 2 fantasmas detectados HOY 2026-05-09 para
--      corregir el corte del día:
--        - 17251086 (Uso cancha coach Aníbal x3, $600, P-F7D5DF) → 17250975
--        - 17251090 (Electrolife Zero Fresa Kiwi, $50, P-5D099A) → 17250984
--      Ambos fantasmas están a ~10 min de su canónico, dentro del cap de
--      15 min de la heurística.
--   4. NOTIFY pgrst.
--
--   Sprint 2 agregará función + trigger + backfill de los 39 fantasmas
--   históricos restantes.
--   Sprint 3 agregará vista canónica `rdb.v_waitry_pedidos`.
--
-- WEBHOOK SAFETY:
--   El handler en supabase/functions/waitry-webhook/index.ts:609-631
--   construye el upsert con campos específicos en buildRdbPedidoRow; no
--   incluye superseded_by_order_id. El upsert con onConflict='order_id'
--   solo SET-ea las columnas presentes en el row insertado, dejando intacta
--   la columna nueva. Verificado.

-- 1) Schema delta
ALTER TABLE rdb.waitry_pedidos
  ADD COLUMN superseded_by_order_id text NULL;

COMMENT ON COLUMN rdb.waitry_pedidos.superseded_by_order_id IS
  'Si el pedido es duplicado fantasma generado por bug de Waitry (cierre se reabre y la cajera lo re-cierra), este campo apunta al order_id del canónico. Filtrar WHERE superseded_by_order_id IS NULL en reads de UI/reportes para excluir fantasmas. Iniciativa: rdb-waitry-deduplicacion.';

CREATE INDEX idx_waitry_pedidos_canonicos
  ON rdb.waitry_pedidos (timestamp DESC, order_id)
  WHERE superseded_by_order_id IS NULL;

-- 2) Marcar manualmente los 2 fantasmas detectados hoy (2026-05-09).
--    Cap-and-replace seguro: solo aplica si ambos pedidos existen.
UPDATE rdb.waitry_pedidos
   SET superseded_by_order_id = '17250975'
 WHERE order_id = '17251086'
   AND EXISTS (
     SELECT 1 FROM rdb.waitry_pedidos WHERE order_id = '17250975'
   );

UPDATE rdb.waitry_pedidos
   SET superseded_by_order_id = '17250984'
 WHERE order_id = '17251090'
   AND EXISTS (
     SELECT 1 FROM rdb.waitry_pedidos WHERE order_id = '17250984'
   );

-- 3) Reload PostgREST schema cache (la columna nueva debe ser inmediatamente
--    visible para el filtro inline en /rdb/ventas).
NOTIFY pgrst, 'reload schema';
