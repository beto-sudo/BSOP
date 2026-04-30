-- ============================================================
-- Sprint 1 — rdb-productos-precios-realidad (corrección post-smoke)
--
-- Tras aplicar la migración 20260430130000, smoke en main DB mostró
-- solo 52 productos con costo de OC. Beto reportó "veo productos que
-- deberían tener costo, algo no cuadra". Investigación reveló:
--
--  - 175 OCs totales en RDB:
--      155 en `borrador` (47 de 2026 + 108 de 2025 = histórico migrado)
--       18 en `cerrada` (modernas, post-oc-recepciones del 28-abr)
--        2 en `cancelada`
--  - Los 155 borradores tienen 197 productos distintos con
--    `precio_unitario` capturado — son data REAL de compras pasadas
--    que llegaron como borradores porque no se les registró envío
--    formal (no había sistema antes del 28-abr).
--  - Filtro original (`oc.estado IN ('recibida','cerrada')`) excluyó
--    todo ese histórico → la vista mostraba "—" para 145 productos
--    que sí habían sido comprados.
--
-- Fix: relajar el filtro a `oc.estado <> 'cancelada'` + `deleted_at
-- IS NULL`. Incluye borrador, enviada, parcial, recibida, cerrada.
-- Los `IS NOT NULL` sobre `producto_id` y `COALESCE(precio_real,
-- precio_unitario)` siguen excluyendo borradores incompletos sin
-- precio.
--
-- Validación con la nueva regla: 205 productos con costo (vs 52 antes).
-- ~4× más cobertura.
--
-- Trade-off: si Beto crea hoy una OC nueva en `borrador` con precio
-- aspiracional (no acordado todavía), ese precio se considera
-- "último costo" hasta que se cierre. Aceptable — la mentira anterior
-- (cero histórico real) era peor. Para captura nueva con precios
-- inciertos, se recomienda no rellenar `precio_unitario` hasta que
-- se acuerde.
--
-- Reversible: re-aplicar 20260430130000 vuelve al filtro estricto.
--
-- Iniciativa: docs/planning/rdb-productos-precios-realidad.md
-- ============================================================

CREATE OR REPLACE VIEW rdb.v_productos_tabla
WITH (security_invoker = true)
AS
WITH ultimo_costo_oc AS (
  -- Una fila por producto: el costo de la línea más reciente cuya OC
  -- NO esté cancelada. Incluye borradores históricos migrados (la
  -- mayoría del histórico) además de OCs cerradas modernas.
  -- Cast a numeric(14,2) preserva firma de columna (SQLSTATE 42P16
  -- en CREATE OR REPLACE VIEW si cambia tipo).
  SELECT DISTINCT ON (ocd.producto_id)
    ocd.producto_id,
    COALESCE(ocd.precio_real, ocd.precio_unitario)::numeric(14, 2) AS costo
  FROM erp.ordenes_compra_detalle ocd
  JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
  WHERE ocd.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND oc.estado <> 'cancelada'
    AND oc.deleted_at IS NULL
    AND ocd.producto_id IS NOT NULL
    AND COALESCE(ocd.precio_real, ocd.precio_unitario) IS NOT NULL
  ORDER BY
    ocd.producto_id,
    COALESCE(oc.cerrada_at, oc.autorizada_at, ocd.created_at) DESC
),
ultimo_precio_waitry AS (
  -- Sin cambios respecto a 20260430130000 — Waitry sigue siendo la
  -- fuente de precio de venta.
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

NOTIFY pgrst, 'reload schema';
