-- ============================================================
-- PR 3b: Vistas de análisis de productos RDB
--
-- Construidas sobre el catálogo de categorías y vistas base del PR 3a.
-- Soportan la página /rdb/productos/analisis (KPIs, sin movimiento,
-- estrellas, margen bajo, comparativa por categoría).
-- ============================================================

-- 1) Métricas agregadas por producto (rotación 30/90 días, ventas, utilidad)
CREATE OR REPLACE VIEW rdb.v_producto_metricas AS
WITH ventas AS (
  SELECT
    p.id AS producto_id,
    SUM(CASE WHEN wp.created_at > now() - INTERVAL '30 days' THEN wp.quantity ELSE 0 END)
      AS unidades_30d,
    SUM(CASE WHEN wp.created_at > now() - INTERVAL '30 days' THEN wp.total_price ELSE 0 END)
      AS importe_30d,
    SUM(CASE WHEN wp.created_at > now() - INTERVAL '90 days' THEN wp.quantity ELSE 0 END)
      AS unidades_90d,
    SUM(CASE WHEN wp.created_at > now() - INTERVAL '90 days' THEN wp.total_price ELSE 0 END)
      AS importe_90d,
    MAX(wp.created_at) AS ultima_venta_at
  FROM erp.productos p
  LEFT JOIN rdb.waitry_productos wp ON wp.product_id = p.codigo
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
    AND p.deleted_at IS NULL
  GROUP BY p.id
)
SELECT
  p.id,
  p.nombre,
  p.codigo,
  p.activo,
  p.inventariable,
  c.id      AS categoria_id,
  c.nombre  AS categoria_nombre,
  c.color   AS categoria_color,
  pp.costo        AS costo,
  pp.precio_venta AS precio_venta,
  CASE
    WHEN pp.precio_venta IS NULL OR pp.precio_venta = 0 THEN NULL
    ELSE ROUND(((pp.precio_venta - COALESCE(pp.costo, 0)) / pp.precio_venta * 100)::numeric, 1)
  END AS margen_pct,
  COALESCE(stk.cantidad_total, 0) AS stock_actual,
  ROUND((COALESCE(stk.cantidad_total, 0) * COALESCE(pp.costo, 0))::numeric, 2) AS valor_stock,
  COALESCE(v.unidades_30d, 0)::numeric AS unidades_30d,
  ROUND(COALESCE(v.importe_30d, 0)::numeric, 2)  AS importe_30d,
  COALESCE(v.unidades_90d, 0)::numeric AS unidades_90d,
  ROUND(COALESCE(v.importe_90d, 0)::numeric, 2)  AS importe_90d,
  v.ultima_venta_at,
  CASE
    WHEN v.ultima_venta_at IS NULL THEN 9999
    ELSE EXTRACT(DAY FROM now() - v.ultima_venta_at)::int
  END AS dias_sin_venta,
  -- Utilidad estimada últimos 30 días: ingreso - (unidades * costo)
  ROUND(
    (COALESCE(v.importe_30d, 0) - COALESCE(v.unidades_30d, 0) * COALESCE(pp.costo, 0))::numeric, 2
  ) AS utilidad_30d
FROM erp.productos p
LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
LEFT JOIN erp.productos_precios pp  ON pp.producto_id = p.id AND pp.vigente = true
LEFT JOIN (
  SELECT producto_id, SUM(cantidad)::numeric AS cantidad_total
  FROM erp.inventario
  GROUP BY producto_id
) stk ON stk.producto_id = p.id
LEFT JOIN ventas v ON v.producto_id = p.id
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND p.deleted_at IS NULL;

GRANT SELECT ON rdb.v_producto_metricas TO authenticated;
GRANT SELECT ON rdb.v_producto_metricas TO service_role;

-- 2) Tendencia semanal últimas 12 semanas, por producto (gráfica)
CREATE OR REPLACE VIEW rdb.v_producto_tendencia_semanal AS
WITH semanas AS (
  SELECT generate_series(
    date_trunc('week', now() - INTERVAL '11 weeks'),
    date_trunc('week', now()),
    INTERVAL '1 week'
  )::date AS semana_inicio
)
SELECT
  p.id AS producto_id,
  p.nombre,
  p.categoria_id,
  s.semana_inicio,
  COALESCE(SUM(wp.quantity), 0)::numeric AS unidades,
  ROUND(COALESCE(SUM(wp.total_price), 0)::numeric, 2) AS importe
FROM erp.productos p
CROSS JOIN semanas s
LEFT JOIN rdb.waitry_productos wp
  ON wp.product_id = p.codigo
 AND wp.created_at >= s.semana_inicio
 AND wp.created_at <  s.semana_inicio + INTERVAL '1 week'
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND p.deleted_at IS NULL
GROUP BY p.id, p.nombre, p.categoria_id, s.semana_inicio;

GRANT SELECT ON rdb.v_producto_tendencia_semanal TO authenticated;
GRANT SELECT ON rdb.v_producto_tendencia_semanal TO service_role;

-- 3) Resumen por categoría (últimos 30 días)
CREATE OR REPLACE VIEW rdb.v_categoria_resumen AS
SELECT
  c.id AS categoria_id,
  c.nombre AS categoria,
  c.color,
  c.orden,
  COUNT(DISTINCT p.id) AS total_productos,
  COUNT(DISTINCT p.id) FILTER (WHERE m.unidades_30d > 0) AS productos_con_venta_30d,
  ROUND(COALESCE(SUM(m.importe_30d), 0)::numeric, 2) AS importe_total_30d,
  ROUND(COALESCE(SUM(m.utilidad_30d), 0)::numeric, 2) AS utilidad_total_30d,
  ROUND(AVG(m.margen_pct)::numeric, 1) AS margen_promedio_pct,
  ROUND(COALESCE(SUM(m.valor_stock), 0)::numeric, 2) AS valor_stock_total
FROM erp.categorias_producto c
LEFT JOIN erp.productos p
  ON p.categoria_id = c.id
 AND p.deleted_at IS NULL
 AND p.activo = true
LEFT JOIN rdb.v_producto_metricas m ON m.id = p.id
WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
GROUP BY c.id, c.nombre, c.color, c.orden
ORDER BY c.orden;

GRANT SELECT ON rdb.v_categoria_resumen TO authenticated;
GRANT SELECT ON rdb.v_categoria_resumen TO service_role;
