-- Fix: alinear fn_inventario_al_corte con v_inventario_stock
-- Problemas detectados vs la vista:
--   1. Faltaba AND p.parent_id IS NULL → traía hijos (Bacardi Campechano, Don Julio Derecho, etc.) como filas propias
--   2. Faltaba AND p.activo = true    → podía traer productos inactivos
-- Resultado: el PDF histórico mostraba ~267 productos en lugar de ~200, y el total era incorrecto

CREATE OR REPLACE FUNCTION rdb.fn_inventario_al_corte(p_fecha TIMESTAMPTZ)
RETURNS TABLE (
  id UUID, nombre TEXT, categoria TEXT, unidad TEXT, inventariable BOOLEAN,
  costo_unitario NUMERIC, ultimo_costo NUMERIC, stock_minimo NUMERIC, factor_consumo NUMERIC,
  total_entradas NUMERIC, total_vendido NUMERIC, total_mermas NUMERIC,
  stock_actual NUMERIC, valor_inventario NUMERIC, bajo_minimo BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
WITH
movimientos_agg AS (
  SELECT
    producto_id,
    SUM(CASE WHEN tipo IN ('entrada', 'inventario_inicial', 'ajuste_positivo') OR (tipo = 'ajuste' AND cantidad > 0) THEN ABS(cantidad) ELSE 0 END) AS total_entradas,
    SUM(CASE WHEN tipo IN ('merma', 'ajuste_negativo', 'salida') OR (tipo = 'ajuste' AND cantidad < 0) THEN ABS(cantidad) ELSE 0 END) AS total_salidas_manuales
  FROM rdb.inventario_movimientos
  WHERE COALESCE(fecha, created_at) <= p_fecha
  GROUP BY producto_id
),
ventas_agg AS (
  SELECT
    COALESCE(p.parent_id, p.id) AS padre_id,
    SUM(wp.quantity * p.factor_consumo) AS total_consumido
  FROM rdb.waitry_productos wp
  JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
  JOIN rdb.productos p        ON p.waitry_item_id::text = wp.product_id
  WHERE ped.status != 'order_canceled'
    AND ped.created_at <= p_fecha
  GROUP BY COALESCE(p.parent_id, p.id)
)
SELECT
  p.id, p.nombre, p.categoria, p.unidad, p.inventariable,
  p.costo_unitario, p.ultimo_costo, p.stock_minimo, p.factor_consumo,
  COALESCE(m.total_entradas, 0)                                                                           AS total_entradas,
  COALESCE(v.total_consumido, 0)                                                                          AS total_vendido,
  COALESCE(m.total_salidas_manuales, 0)                                                                   AS total_mermas,
  COALESCE(m.total_entradas, 0) - COALESCE(v.total_consumido, 0) - COALESCE(m.total_salidas_manuales, 0) AS stock_actual,
  ROUND(
    (COALESCE(m.total_entradas, 0) - COALESCE(v.total_consumido, 0) - COALESCE(m.total_salidas_manuales, 0))
    * COALESCE(p.ultimo_costo, p.costo_unitario, 0), 2
  )                                                                                                       AS valor_inventario,
  CASE
    WHEN p.stock_minimo IS NOT NULL AND p.stock_minimo > 0
      AND (COALESCE(m.total_entradas,0) - COALESCE(v.total_consumido,0) - COALESCE(m.total_salidas_manuales,0)) < p.stock_minimo
    THEN TRUE ELSE FALSE
  END                                                                                                     AS bajo_minimo
FROM rdb.productos p
LEFT JOIN movimientos_agg m ON m.producto_id = p.id
LEFT JOIN ventas_agg      v ON v.padre_id    = p.id
WHERE p.inventariable = TRUE
  AND p.parent_id IS NULL   -- solo padres, igual que v_inventario_stock
  AND p.activo = TRUE       -- solo activos
ORDER BY p.nombre;
$$;

GRANT EXECUTE ON FUNCTION rdb.fn_inventario_al_corte(TIMESTAMPTZ) TO service_role, authenticated;
