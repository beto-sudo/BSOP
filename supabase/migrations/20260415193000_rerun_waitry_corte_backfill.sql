-- ============================================================
-- Fix FK on waitry_pedidos.corte_id: point to erp.cortes_caja
-- instead of rdb.cortes_legacy
-- Then re-run backfill for orphan orders
-- ============================================================

-- 1. Drop the old FK pointing to rdb.cortes_legacy
ALTER TABLE rdb.waitry_pedidos
  DROP CONSTRAINT IF EXISTS waitry_pedidos_corte_id_fkey;

-- 2. Add new FK pointing to erp.cortes_caja
ALTER TABLE rdb.waitry_pedidos
  ADD CONSTRAINT waitry_pedidos_corte_id_fkey
  FOREIGN KEY (corte_id) REFERENCES erp.cortes_caja(id)
  ON DELETE SET NULL;

-- 3. Backfill orphan orders by matching timestamp to corte time window
WITH matches AS (
  SELECT DISTINCT ON (wp.order_id)
    wp.order_id,
    c.id AS corte_id
  FROM rdb.waitry_pedidos wp
  JOIN erp.cortes_caja c
    ON c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
   AND c.abierto_at IS NOT NULL
   AND wp."timestamp" >= c.abierto_at
   AND (
     (c.cerrado_at IS NOT NULL AND wp."timestamp" <= c.cerrado_at)
     OR (c.estado = 'abierto' AND c.cerrado_at IS NULL)
   )
  WHERE wp.corte_id IS NULL
    AND wp.status != 'order_cancelled'
  ORDER BY wp.order_id,
    CASE WHEN c.estado = 'abierto' THEN 0 ELSE 1 END,
    c.abierto_at DESC
)
UPDATE rdb.waitry_pedidos wp
SET corte_id = m.corte_id,
    updated_at = now()
FROM matches m
WHERE wp.order_id = m.order_id;

NOTIFY pgrst, 'reload schema';
