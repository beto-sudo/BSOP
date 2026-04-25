-- ============================================================
-- Fix crítico: precedencia AND/OR en erp.fn_trg_mantenimiento_inventario
--
-- El trigger previo sumaba todos los ajustes positivos/negativos de la
-- DB al recalcular el stock de cualquier producto, inflando cada stock
-- por la suma neta de los 22 ajustes históricos del 2026-04-09.
--
-- Resultado observado 2026-04-24: valor inventario inflado en
-- $1,743,431.28 MXN (stock inflado +417 unidades por producto).
-- ============================================================

-- 1) Reescribir función con paréntesis correctos y una sola query agregada
CREATE OR REPLACE FUNCTION erp.fn_trg_mantenimiento_inventario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  v_empresa_id  UUID;
  v_producto_id UUID;
  v_almacen_id  UUID;
  v_entradas    NUMERIC;
  v_salidas     NUMERIC;
  v_stock       NUMERIC;
  v_ultimo      TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_empresa_id  := OLD.empresa_id;
    v_producto_id := OLD.producto_id;
    v_almacen_id  := OLD.almacen_id;
  ELSE
    v_empresa_id  := NEW.empresa_id;
    v_producto_id := NEW.producto_id;
    v_almacen_id  := NEW.almacen_id;
  END IF;

  -- Una sola pasada sobre movimientos del (empresa, producto, almacén).
  -- Los paréntesis son críticos: evitan el bug de precedencia AND/OR
  -- que hizo que el trigger previo sumara ajustes globales.
  SELECT
    COALESCE(SUM(CASE
      WHEN tipo_movimiento IN ('entrada','devolucion')
        OR (tipo_movimiento = 'ajuste' AND cantidad > 0)
      THEN ABS(cantidad) ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN tipo_movimiento = 'salida'
        OR (tipo_movimiento = 'ajuste' AND cantidad < 0)
      THEN ABS(cantidad) ELSE 0
    END), 0),
    MAX(created_at)
  INTO v_entradas, v_salidas, v_ultimo
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id
    AND producto_id = v_producto_id
    AND almacen_id  = v_almacen_id;

  v_stock := v_entradas - v_salidas;

  INSERT INTO erp.inventario (empresa_id, producto_id, almacen_id, cantidad, ultimo_movimiento, updated_at)
  VALUES (v_empresa_id, v_producto_id, v_almacen_id, v_stock, v_ultimo, now())
  ON CONFLICT (empresa_id, producto_id, almacen_id)
  DO UPDATE SET
    cantidad          = EXCLUDED.cantidad,
    ultimo_movimiento = EXCLUDED.ultimo_movimiento,
    updated_at        = now();

  RETURN NULL;
END;
$$;

-- 2) Re-clasificar los 22 ajustes iniciales del 2026-04-09 como 'entrada'
--    si la cantidad es positiva, o 'salida' si es negativa. Preserva la
--    nota y el timestamp original (audit trail).
UPDATE erp.movimientos_inventario
SET tipo_movimiento = CASE WHEN cantidad >= 0 THEN 'entrada' ELSE 'salida' END,
    cantidad        = ABS(cantidad),
    notas           = COALESCE(notas,'') || ' [reclasificado 2026-04-24: fix trigger precedencia]'
WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND tipo_movimiento = 'ajuste'
  AND referencia_tipo IS NULL
  AND notas = 'Ajuste deistribucion inventario sabores';

-- 3) Rebuild completo de erp.inventario desde movimientos (single source of truth).
--    Tolerante a DBs sin datos RDB (preview branches): si no hay movimientos
--    para la empresa, los UPDATE/INSERT son no-op.
DO $rebuild$
DECLARE
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
BEGIN
  -- Zero-out de inventario RDB antes del rebuild (evita filas stale)
  UPDATE erp.inventario SET cantidad = 0, updated_at = now() WHERE empresa_id = v_empresa_id;

  -- Insert/update desde movimientos con la fórmula correcta
  INSERT INTO erp.inventario (empresa_id, producto_id, almacen_id, cantidad, ultimo_movimiento, updated_at)
  SELECT
    v_empresa_id,
    producto_id,
    almacen_id,
    SUM(CASE
      WHEN tipo_movimiento IN ('entrada','devolucion')
        OR (tipo_movimiento = 'ajuste' AND cantidad > 0)
      THEN ABS(cantidad) ELSE 0
    END) -
    SUM(CASE
      WHEN tipo_movimiento = 'salida'
        OR (tipo_movimiento = 'ajuste' AND cantidad < 0)
      THEN ABS(cantidad) ELSE 0
    END) AS stock,
    MAX(created_at),
    now()
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id
  GROUP BY producto_id, almacen_id
  ON CONFLICT (empresa_id, producto_id, almacen_id)
  DO UPDATE SET
    cantidad          = EXCLUDED.cantidad,
    ultimo_movimiento = EXCLUDED.ultimo_movimiento,
    updated_at        = now();
END $rebuild$;
