-- Create type for product classification
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clasificacion_producto' AND typnamespace = 'erp'::regnamespace) THEN
        CREATE TYPE erp.clasificacion_producto AS ENUM ('inventariable', 'consumible', 'merchandising', 'activo_fijo');
    END IF;
END $$;

-- Add column to erp.productos
ALTER TABLE erp.productos ADD COLUMN IF NOT EXISTS clasificacion erp.clasificacion_producto DEFAULT 'inventariable';

-- Update view to include classification and handle valuation logic
DROP VIEW IF EXISTS rdb.v_inventario_stock;
CREATE OR REPLACE VIEW rdb.v_inventario_stock AS
 WITH movimientos_agg AS (
         SELECT m.producto_id,
            sum(
                CASE
                    WHEN (m.tipo_movimiento = ANY (ARRAY['entrada'::text, 'devolucion'::text])) OR m.tipo_movimiento = 'ajuste'::text AND m.cantidad > 0::numeric THEN abs(m.cantidad)
                    ELSE 0::numeric
                END) AS total_entradas,
            sum(
                CASE
                    WHEN m.tipo_movimiento = 'salida'::text OR m.tipo_movimiento = 'ajuste'::text AND m.cantidad < 0::numeric THEN abs(m.cantidad)
                    ELSE 0::numeric
                END) AS total_salidas
           FROM erp.movimientos_inventario m
          WHERE m.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
          GROUP BY m.producto_id
        ), ventas_waitry_agg AS (
         SELECT m.producto_id,
            sum(abs(m.cantidad)) AS total_vendido
           FROM erp.movimientos_inventario m
          WHERE m.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND m.referencia_tipo = 'venta_waitry'::text
          GROUP BY m.producto_id
        )
 SELECT p.id,
    p.nombre,
    p.tipo AS categoria,
    p.clasificacion::text as clasificacion,
    p.unidad,
    p.inventariable,
    COALESCE(pp.costo, 0::numeric) AS costo_unitario,
    COALESCE(pp.costo, 0::numeric) AS ultimo_costo,
    0 AS stock_minimo,
    COALESCE(p.factor_consumo, 1.0) AS factor_consumo,
    COALESCE(m.total_entradas, 0::numeric) AS total_entradas,
    COALESCE(vw.total_vendido, 0::numeric) AS total_vendido,
    COALESCE(m.total_salidas, 0::numeric) - COALESCE(vw.total_vendido, 0::numeric) AS total_mermas,
    COALESCE(i.cantidad, 0::numeric) AS stock_actual,
    CASE 
        WHEN p.clasificacion IN ('inventariable', 'merchandising') THEN round(COALESCE(i.cantidad, 0::numeric) * COALESCE(pp.costo, 0::numeric), 2)
        ELSE 0 
    END AS valor_inventario,
    false AS bajo_minimo
   FROM erp.productos p
     LEFT JOIN movimientos_agg m ON m.producto_id = p.id
     LEFT JOIN ventas_waitry_agg vw ON vw.producto_id = p.id
     LEFT JOIN erp.inventario i ON i.producto_id = p.id
     LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
  WHERE p.inventariable = true AND p.parent_id IS NULL AND p.activo = true AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL;
