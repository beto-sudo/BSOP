-- ============================================================
-- Sprint 1 — rdb-productos-precios-realidad
--
-- Cambia rdb.v_productos_tabla para que ultimo_costo y
-- ultimo_precio_venta vengan de la realidad operativa
-- en lugar del snapshot estático de erp.productos_precios.
--
--  - ultimo_costo       ← última línea de OC en estados terminales
--                         ('recibida','cerrada') por producto, usando
--                         COALESCE(precio_real, precio_unitario) (preserva
--                         el override admin del Sprint 3 de oc-recepciones).
--                         Rankeo por COALESCE(oc.cerrada_at,
--                         oc.autorizada_at, ocd.created_at) DESC.
--  - ultimo_precio_venta ← última fila de rdb.waitry_productos por
--                         product_id (match con productos.codigo) con
--                         unit_price > 0, rankeo por wp.created_at DESC.
--  - margen_pct         ← NULL si cualquiera de los dos es NULL (más
--                         honesto que mostrar 100% cuando no hay costo).
--  - erp.productos_precios queda intacta — ya no alimenta esta vista,
--    pero se preserva como tabla de overrides manuales / lista oficial.
--
-- SECURITY INVOKER preservado para mantener RLS de tablas subyacentes
-- aplicable (igual que la versión original — ver
-- 20260425130000_security_invoker_productos_analisis_views.sql).
--
-- Reversible: CREATE OR REPLACE VIEW. Para revertir, re-ejecutar la
-- versión original del 20260425035021_productos_categorias_y_limpieza.sql:302.
--
-- Iniciativa: docs/planning/rdb-productos-precios-realidad.md
-- ============================================================

CREATE OR REPLACE VIEW rdb.v_productos_tabla
WITH (security_invoker = true)
AS
WITH ultimo_costo_oc AS (
  -- Una fila por producto: el costo de la línea más reciente cuya OC
  -- esté en estado terminal post-recepción.
  -- Cast explícito a numeric(14,2): la versión anterior de la vista
  -- exponía ultimo_costo desde productos_precios.costo numeric(14,2),
  -- y CREATE OR REPLACE VIEW no permite cambiar el tipo de columnas
  -- existentes (SQLSTATE 42P16). Mantenemos la firma exacta.
  SELECT DISTINCT ON (ocd.producto_id)
    ocd.producto_id,
    COALESCE(ocd.precio_real, ocd.precio_unitario)::numeric(14, 2) AS costo
  FROM erp.ordenes_compra_detalle ocd
  JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
  WHERE ocd.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND oc.estado IN ('recibida', 'cerrada')
    AND ocd.producto_id IS NOT NULL
    AND COALESCE(ocd.precio_real, ocd.precio_unitario) IS NOT NULL
  ORDER BY
    ocd.producto_id,
    COALESCE(oc.cerrada_at, oc.autorizada_at, ocd.created_at) DESC
),
ultimo_precio_waitry AS (
  -- Una fila por product_id Waitry (= productos.codigo): el unit_price
  -- de la venta más reciente. Filtra unit_price > 0 para excluir
  -- cortesías/ajustes que no representan precio real cobrado.
  -- Cast a numeric(14,2) por el mismo motivo que ultimo_costo arriba.
  SELECT DISTINCT ON (wp.product_id)
    wp.product_id,
    wp.unit_price::numeric(14, 2) AS precio
  FROM rdb.waitry_productos wp
  WHERE wp.product_id IS NOT NULL
    AND wp.unit_price IS NOT NULL
    AND wp.unit_price > 0
  ORDER BY wp.product_id, wp.created_at DESC
)
SELECT
  p.id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.tipo,
  p.unidad,
  p.activo,
  p.inventariable,
  p.created_at,
  p.updated_at,
  c.id      AS categoria_id,
  c.nombre  AS categoria_nombre,
  c.color   AS categoria_color,
  uc.costo  AS ultimo_costo,
  upw.precio AS ultimo_precio_venta,
  CASE
    WHEN upw.precio IS NULL OR upw.precio = 0 THEN NULL
    WHEN uc.costo IS NULL THEN NULL
    ELSE ROUND(((upw.precio - uc.costo) / upw.precio * 100)::numeric, 1)
  END AS margen_pct,
  COALESCE(stk.cantidad_total, 0) AS stock_actual,
  uv.ultima_venta_at,
  COALESCE(uv.total_unidades_vendidas, 0) AS total_unidades_vendidas
FROM erp.productos p
LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
LEFT JOIN ultimo_costo_oc uc        ON uc.producto_id = p.id
LEFT JOIN ultimo_precio_waitry upw  ON upw.product_id = p.codigo
LEFT JOIN (
  SELECT producto_id, SUM(cantidad)::numeric AS cantidad_total
  FROM erp.inventario
  GROUP BY producto_id
) stk ON stk.producto_id = p.id
LEFT JOIN rdb.v_producto_ultima_venta uv ON uv.producto_id = p.id
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.deleted_at IS NULL;

GRANT SELECT ON rdb.v_productos_tabla TO authenticated;
GRANT SELECT ON rdb.v_productos_tabla TO service_role;

-- Forzar reload del schema cache de PostgREST para que supabase-js vea
-- la vista actualizada sin esperar al refresh automático.
NOTIFY pgrst, 'reload schema';
