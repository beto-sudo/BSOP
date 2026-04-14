-- Recalcular erp.inventario despues de mover movimientos a padres
DO $$
DECLARE
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
BEGIN
  INSERT INTO erp.inventario (empresa_id, producto_id, almacen_id, cantidad, ultimo_movimiento)
  SELECT 
    v_empresa_id,
    producto_id,
    almacen_id,
    SUM(CASE WHEN tipo_movimiento IN ('entrada', 'devolucion') OR (tipo_movimiento = 'ajuste' AND cantidad > 0) THEN ABS(cantidad) ELSE 0 END) -
    SUM(CASE WHEN tipo_movimiento IN ('salida') OR (tipo_movimiento = 'ajuste' AND cantidad < 0) THEN ABS(cantidad) ELSE 0 END) AS stock,
    MAX(created_at)
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id
  GROUP BY producto_id, almacen_id
  ON CONFLICT (empresa_id, producto_id, almacen_id)
  DO UPDATE SET 
    cantidad = EXCLUDED.cantidad,
    ultimo_movimiento = EXCLUDED.ultimo_movimiento,
    updated_at = now();
END
$$;
