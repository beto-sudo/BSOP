-- ============================================================
-- Fix v_inventario_stock to use the new erp.inventario truth
-- Removes double counting of Waitry sales since they are now
-- real salidas in erp.movimientos_inventario.
-- ============================================================

DROP VIEW IF EXISTS rdb.v_inventario_stock CASCADE;

CREATE VIEW rdb.v_inventario_stock AS
WITH movimientos_agg AS (
  SELECT
    producto_id,
    SUM(CASE WHEN tipo_movimiento IN ('entrada','devolucion') OR (tipo_movimiento = 'ajuste' AND cantidad > 0) THEN ABS(cantidad) ELSE 0 END) AS total_entradas,
    SUM(CASE WHEN tipo_movimiento IN ('salida') OR (tipo_movimiento = 'ajuste' AND cantidad < 0) THEN ABS(cantidad) ELSE 0 END) AS total_salidas
  FROM erp.movimientos_inventario
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  GROUP BY producto_id
),
ventas_waitry_agg AS (
  SELECT
    producto_id,
    SUM(ABS(cantidad)) AS total_vendido
  FROM erp.movimientos_inventario
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND referencia_tipo = 'venta_waitry'
  GROUP BY producto_id
)
SELECT
  p.id,
  p.nombre,
  p.tipo        AS categoria,
  p.unidad,
  p.inventariable,
  COALESCE(pp.costo, 0)  AS costo_unitario,
  COALESCE(pp.costo, 0)  AS ultimo_costo,
  0                      AS stock_minimo,
  COALESCE(p.factor_consumo, 1.0) AS factor_consumo,
  COALESCE(m.total_entradas, 0)                                 AS total_entradas,
  COALESCE(vw.total_vendido, 0)                                 AS total_vendido,
  (COALESCE(m.total_salidas, 0) - COALESCE(vw.total_vendido, 0)) AS total_mermas,
  COALESCE(i.cantidad, 0)                                       AS stock_actual,
  ROUND(
    COALESCE(i.cantidad, 0) * COALESCE(pp.costo, 0), 2
  )                                                             AS valor_inventario,
  false                                                          AS bajo_minimo
FROM erp.productos p
LEFT JOIN movimientos_agg m ON m.producto_id = p.id
LEFT JOIN ventas_waitry_agg vw ON vw.producto_id = p.id
LEFT JOIN erp.inventario i ON i.producto_id = p.id
LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
WHERE p.inventariable = true
  AND p.parent_id IS NULL
  AND p.activo = true
  AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.deleted_at IS NULL;

GRANT SELECT ON rdb.v_inventario_stock TO anon, authenticated, service_role;


-- Fix fn_inventario_al_corte
CREATE OR REPLACE FUNCTION rdb.fn_inventario_al_corte(p_fecha TIMESTAMPTZ)
RETURNS TABLE (
  id UUID, nombre TEXT, categoria TEXT, unidad TEXT, inventariable BOOLEAN,
  costo_unitario NUMERIC, ultimo_costo NUMERIC, stock_minimo NUMERIC, factor_consumo NUMERIC,
  total_entradas NUMERIC, total_vendido NUMERIC, total_mermas NUMERIC,
  stock_actual NUMERIC, valor_inventario NUMERIC, bajo_minimo BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
WITH movimientos_agg AS (
  SELECT
    producto_id,
    SUM(CASE WHEN tipo_movimiento IN ('entrada','devolucion') OR (tipo_movimiento = 'ajuste' AND cantidad > 0) THEN ABS(cantidad) ELSE 0 END) AS total_entradas,
    SUM(CASE WHEN tipo_movimiento IN ('salida') OR (tipo_movimiento = 'ajuste' AND cantidad < 0) THEN ABS(cantidad) ELSE 0 END) AS total_salidas
  FROM erp.movimientos_inventario
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND created_at <= p_fecha
  GROUP BY producto_id
),
ventas_waitry_agg AS (
  SELECT
    producto_id,
    SUM(ABS(cantidad)) AS total_vendido
  FROM erp.movimientos_inventario
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND referencia_tipo = 'venta_waitry'
    AND created_at <= p_fecha
  GROUP BY producto_id
)
SELECT
  p.id,
  p.nombre,
  p.tipo        AS categoria,
  p.unidad,
  p.inventariable,
  COALESCE(pp.costo, 0)  AS costo_unitario,
  COALESCE(pp.costo, 0)  AS ultimo_costo,
  0                      AS stock_minimo,
  COALESCE(p.factor_consumo, 1.0) AS factor_consumo,
  COALESCE(m.total_entradas, 0)                                 AS total_entradas,
  COALESCE(vw.total_vendido, 0)                                 AS total_vendido,
  (COALESCE(m.total_salidas, 0) - COALESCE(vw.total_vendido, 0)) AS total_mermas,
  COALESCE(m.total_entradas, 0) - COALESCE(m.total_salidas, 0)   AS stock_actual,
  ROUND(
    (COALESCE(m.total_entradas, 0) - COALESCE(m.total_salidas, 0)) * COALESCE(pp.costo, 0), 2
  )                                                             AS valor_inventario,
  false                                                          AS bajo_minimo
FROM erp.productos p
LEFT JOIN movimientos_agg m ON m.producto_id = p.id
LEFT JOIN ventas_waitry_agg vw ON vw.producto_id = p.id
LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
WHERE p.inventariable = true
  AND p.parent_id IS NULL
  AND p.activo = true
  AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION rdb.fn_inventario_al_corte(TIMESTAMPTZ) TO service_role, authenticated;

-- Mover entradas manuales mal hechas a hijos a su padre
DO $b$
DECLARE
  rec RECORD;
  v_count INT := 0;
BEGIN
  -- Buscar movimientos de entrada manual asignados a hijos
  FOR rec IN
    SELECT m.id, p.parent_id 
    FROM erp.movimientos_inventario m
    JOIN erp.productos p ON p.id = m.producto_id
    WHERE p.parent_id IS NOT NULL 
      AND m.referencia_tipo IS DISTINCT FROM 'venta_waitry'
  LOOP
    -- Migrar esos movimientos al padre
    UPDATE erp.movimientos_inventario 
    SET producto_id = rec.parent_id 
    WHERE id = rec.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Migrados % movimientos de hijos a padres.', v_count;
END $b$;
