-- MIGRATION: rdb-ventas-por-categoria Sprint 1 — vista rdb.v_waitry_productos_categoria
--
-- CONTEXTO:
--   El módulo /rdb/ventas reporta ventas del POS Waitry. Las líneas de
--   venta (rdb.waitry_productos) no traen categoría — solo product_id
--   (texto) y product_name. La categoría vive en
--   erp.productos.categoria_id -> erp.categorias_producto.
--
-- ALCANCE:
--   `rdb.v_waitry_productos_categoria` — enriquece cada línea de venta de
--   waitry_productos con su producto de catálogo y categoría, vía el
--   enlace waitry_productos.product_id = erp.productos.codigo (el mismo
--   que usa rdb.v_producto_metricas).
--
--   erp.productos tiene 7 códigos duplicados en RDB. Un LEFT JOIN directo
--   multiplicaría líneas de venta e inflaría importes. El CTE cat_productos
--   resuelve con DISTINCT ON (codigo) priorizando producto activo + más
--   reciente, garantizando 1 fila de catálogo por código.
--
--   Líneas sin match (product_id ausente del catálogo o producto sin
--   categoria_id) quedan con categoria_id NULL — el reporte las agrupa
--   como "Sin categoría".
--
-- POLÍTICA de SECURITY:
--   security_invoker=on, consistente con rdb.v_waitry_pedidos /
--   v_producto_metricas. RLS de las tablas base se hereda en cada SELECT.
--
-- POSTGREST:
--   GRANT SELECT explícito a authenticated/anon (PostgREST lo necesita
--   para vistas).

CREATE OR REPLACE VIEW rdb.v_waitry_productos_categoria
WITH (security_invoker = on)
AS
WITH cat_productos AS (
  SELECT DISTINCT ON (p.codigo)
    p.codigo,
    p.id           AS producto_id,
    p.categoria_id
  FROM erp.productos p
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND p.deleted_at IS NULL
    AND p.codigo IS NOT NULL
    AND p.codigo <> ''
  ORDER BY p.codigo, p.activo DESC, p.updated_at DESC NULLS LAST, p.created_at DESC, p.id
)
SELECT
  wp.id,
  wp.order_id,
  wp.product_id,
  wp.product_name,
  wp.quantity,
  wp.unit_price,
  wp.total_price,
  wp.created_at,
  cp.producto_id  AS producto_catalogo_id,
  c.id            AS categoria_id,
  c.nombre        AS categoria_nombre,
  c.color         AS categoria_color,
  c.orden         AS categoria_orden
FROM rdb.waitry_productos wp
LEFT JOIN cat_productos cp ON cp.codigo = wp.product_id
LEFT JOIN erp.categorias_producto c ON c.id = cp.categoria_id;

COMMENT ON VIEW rdb.v_waitry_productos_categoria IS
  'Líneas de venta Waitry (rdb.waitry_productos) enriquecidas con producto de catálogo y categoría. Enlace por waitry_productos.product_id = erp.productos.codigo, desambiguado con DISTINCT ON para los códigos duplicados. Líneas sin match traen categoria_id NULL. Usada por el tab "Por categoría" de /rdb/ventas (iniciativa rdb-ventas-por-categoria).';

GRANT SELECT ON rdb.v_waitry_productos_categoria TO authenticated, anon;

-- Verificación inline: el LEFT JOIN con DISTINCT ON NO debe multiplicar
-- filas. La vista debe tener exactamente tantas filas como waitry_productos.
DO $$
DECLARE
  v_view_rows  integer;
  v_base_rows  integer;
BEGIN
  SELECT COUNT(*) INTO v_view_rows FROM rdb.v_waitry_productos_categoria;
  SELECT COUNT(*) INTO v_base_rows FROM rdb.waitry_productos;

  IF v_view_rows <> v_base_rows THEN
    RAISE EXCEPTION
      'v_waitry_productos_categoria multiplica filas: view=%, base=% (revisar DISTINCT ON del CTE)',
      v_view_rows, v_base_rows;
  END IF;

  RAISE NOTICE 'v_waitry_productos_categoria OK: % lineas (1:1 con waitry_productos)', v_view_rows;
END;
$$;

NOTIFY pgrst, 'reload schema';
