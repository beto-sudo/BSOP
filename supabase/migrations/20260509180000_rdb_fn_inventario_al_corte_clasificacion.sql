-- Fix: alinear rdb.fn_inventario_al_corte con rdb.v_inventario_stock
--
-- La RPC quedó stale tras la migración 20260416004000 (que agregó
-- erp.productos.clasificacion y filtró v_inventario_stock.valor_inventario
-- por clasificacion ∈ {inventariable, merchandising}). Resultado: en al-corte
-- mode el KPI mostraba $0 (filtro client requiere clasificacion ausente del
-- return) y el valor total no concordaba con el del category strip ni el
-- print, porque la RPC valuaba consumibles + activos fijos que no debe valuar.
--
-- Fix: agregar columna `clasificacion` al return + envolver valor_inventario
-- con el mismo CASE que la vista live. Mantener el resto idéntico.
--
-- DROP necesario porque cambia el shape del RETURNS TABLE
-- (CREATE OR REPLACE no acepta cambios de columna).

DROP FUNCTION IF EXISTS rdb.fn_inventario_al_corte(timestamptz);

CREATE OR REPLACE FUNCTION rdb.fn_inventario_al_corte(p_fecha timestamptz)
RETURNS TABLE (
  id uuid,
  nombre text,
  categoria text,
  clasificacion text,
  unidad text,
  inventariable boolean,
  costo_unitario numeric,
  ultimo_costo numeric,
  stock_minimo numeric,
  factor_consumo numeric,
  total_entradas numeric,
  total_vendido numeric,
  total_mermas numeric,
  stock_actual numeric,
  valor_inventario numeric,
  bajo_minimo boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $function$
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
  p.tipo                                                          AS categoria,
  p.clasificacion::text                                           AS clasificacion,
  p.unidad,
  p.inventariable,
  COALESCE(pp.costo, 0)                                           AS costo_unitario,
  COALESCE(pp.costo, 0)                                           AS ultimo_costo,
  0                                                               AS stock_minimo,
  COALESCE(p.factor_consumo, 1.0)                                 AS factor_consumo,
  COALESCE(m.total_entradas, 0)                                   AS total_entradas,
  COALESCE(vw.total_vendido, 0)                                   AS total_vendido,
  (COALESCE(m.total_salidas, 0) - COALESCE(vw.total_vendido, 0))  AS total_mermas,
  COALESCE(m.total_entradas, 0) - COALESCE(m.total_salidas, 0)    AS stock_actual,
  CASE
    WHEN p.clasificacion IN ('inventariable', 'merchandising')
      THEN ROUND((COALESCE(m.total_entradas, 0) - COALESCE(m.total_salidas, 0)) * COALESCE(pp.costo, 0), 2)
    ELSE 0
  END                                                             AS valor_inventario,
  false                                                           AS bajo_minimo
FROM erp.productos p
LEFT JOIN movimientos_agg m ON m.producto_id = p.id
LEFT JOIN ventas_waitry_agg vw ON vw.producto_id = p.id
LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
WHERE p.inventariable = true
  AND p.parent_id IS NULL
  AND p.activo = true
  AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.deleted_at IS NULL;
$function$;

GRANT EXECUTE ON FUNCTION rdb.fn_inventario_al_corte(timestamptz) TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';
