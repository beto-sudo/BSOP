-- ============================================================
-- RUTA A: Inventario ERP como Source of Truth
-- 1. Agrega parent_id y factor_consumo a erp.productos
-- 2. Backfill de datos desde rdb.productos_legacy
-- 3. Trigger para reflejar ventas de Waitry como salidas reales
-- 4. Backfill de salidas históricas de Waitry
-- 5. Trigger en movimientos_inventario para mantener erp.inventario
-- 6. Backfill inicial de erp.inventario
-- ============================================================

-- 1. Agrega campos a erp.productos
ALTER TABLE erp.productos 
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES erp.productos(id),
  ADD COLUMN IF NOT EXISTS factor_consumo NUMERIC(8,4) NOT NULL DEFAULT 1.0;

-- 2. Backfill desde productos_legacy
UPDATE erp.productos e
SET 
  parent_id = l.parent_id,
  factor_consumo = COALESCE(l.factor_consumo, 1.0)
FROM rdb.productos_legacy l
WHERE e.id = l.id;

-- 3. Trigger para ventas Waitry -> Movimientos ERP
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producto_id UUID;
  v_parent_id UUID;
  v_factor_consumo NUMERIC;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id UUID;
  v_order_status TEXT;
  v_is_deleted BOOLEAN := false;
BEGIN
  -- Obtener almacén principal
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    v_is_deleted := true;
  ELSE
    -- Checar si la orden está cancelada
    SELECT status INTO v_order_status FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;
    IF v_order_status = 'order_canceled' THEN
      v_is_deleted := true;
    END IF;
  END IF;

  IF v_is_deleted THEN
    DELETE FROM erp.movimientos_inventario 
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Resolver producto en ERP usando el product_id (que es el codigo en ERP)
  SELECT id, parent_id, factor_consumo 
  INTO v_producto_id, v_parent_id, v_factor_consumo
  FROM erp.productos 
  WHERE codigo = NEW.product_id AND empresa_id = v_empresa_id
  LIMIT 1;

  IF v_producto_id IS NULL THEN
    RETURN NEW; -- No es un producto mapeado en ERP
  END IF;

  -- Upsert el movimiento
  INSERT INTO erp.movimientos_inventario (
    empresa_id, producto_id, almacen_id, tipo_movimiento, 
    cantidad, referencia_tipo, referencia_id, notas, created_at
  ) VALUES (
    v_empresa_id,
    COALESCE(v_parent_id, v_producto_id),
    v_almacen_id,
    'salida',
    NEW.quantity * v_factor_consumo,
    'venta_waitry',
    NEW.id,
    'Venta Waitry Order: ' || NEW.order_id,
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING; 
  -- ON CONFLICT en id no sirve aquí porque id se auto-genera. 
  -- Haremos un DELETE + INSERT en vez de ON CONFLICT para asegurar el update.

  RETURN NEW;
END;
$$;

-- Ajustamos el trigger de arriba para que sea seguro contra duplicados
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producto_id UUID;
  v_parent_id UUID;
  v_factor_consumo NUMERIC;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id UUID;
  v_order_status TEXT;
  v_is_deleted BOOLEAN := false;
  v_target_product_id UUID;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM erp.movimientos_inventario WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT status INTO v_order_status FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;
  IF v_order_status = 'order_canceled' THEN
    DELETE FROM erp.movimientos_inventario WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id, parent_id, factor_consumo INTO v_producto_id, v_parent_id, v_factor_consumo
  FROM erp.productos WHERE codigo = NEW.product_id AND empresa_id = v_empresa_id LIMIT 1;

  IF v_producto_id IS NULL THEN RETURN NEW; END IF;
  
  v_target_product_id := COALESCE(v_parent_id, v_producto_id);

  -- Borrar si existe para reemplazar con datos frescos
  DELETE FROM erp.movimientos_inventario WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;
  
  -- Insertar el nuevo
  INSERT INTO erp.movimientos_inventario (
    empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad, referencia_tipo, referencia_id, notas, created_at
  ) VALUES (
    v_empresa_id, v_target_product_id, v_almacen_id, 'salida', NEW.quantity * v_factor_consumo, 'venta_waitry', NEW.id, 'Venta Waitry Order: ' || NEW.order_id, COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitry_productos_to_movimientos ON rdb.waitry_productos;
CREATE TRIGGER trg_waitry_productos_to_movimientos
AFTER INSERT OR UPDATE OR DELETE ON rdb.waitry_productos
FOR EACH ROW EXECUTE FUNCTION erp.fn_trg_waitry_to_movimientos();

-- También necesitamos un trigger en waitry_pedidos para cachar cancelaciones
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_pedidos_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'order_canceled' AND OLD.status != 'order_canceled' THEN
    DELETE FROM erp.movimientos_inventario 
    WHERE referencia_tipo = 'venta_waitry' 
      AND referencia_id IN (SELECT id FROM rdb.waitry_productos WHERE order_id = NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitry_pedidos_cancel_movimientos ON rdb.waitry_pedidos;
CREATE TRIGGER trg_waitry_pedidos_cancel_movimientos
AFTER UPDATE ON rdb.waitry_pedidos
FOR EACH ROW EXECUTE FUNCTION erp.fn_trg_waitry_pedidos_cancel();


-- 4. Backfill de salidas históricas
DO $$
DECLARE
  rec RECORD;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id UUID;
  v_target_id UUID;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN; END IF;

  DELETE FROM erp.movimientos_inventario WHERE referencia_tipo = 'venta_waitry';

  FOR rec IN 
    SELECT wp.id, wp.order_id, wp.product_id, wp.quantity, wp.created_at, p.id as p_id, p.parent_id, p.factor_consumo
    FROM rdb.waitry_productos wp
    JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
    JOIN erp.productos p ON p.codigo = wp.product_id AND p.empresa_id = v_empresa_id
    WHERE ped.status != 'order_canceled'
  LOOP
    v_target_id := COALESCE(rec.parent_id, rec.p_id);
    INSERT INTO erp.movimientos_inventario (
      empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad, referencia_tipo, referencia_id, notas, created_at
    ) VALUES (
      v_empresa_id, v_target_id, v_almacen_id, 'salida', rec.quantity * rec.factor_consumo, 'venta_waitry', rec.id, 'Venta Waitry Order: ' || rec.order_id, COALESCE(rec.created_at, now())
    );
  END LOOP;
END
$$;

-- 5. Trigger en movimientos para mantener erp.inventario
CREATE OR REPLACE FUNCTION erp.fn_trg_mantenimiento_inventario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_empresa_id UUID;
  v_producto_id UUID;
  v_almacen_id UUID;
  v_entradas NUMERIC;
  v_salidas NUMERIC;
  v_stock NUMERIC;
  v_ultimo TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_empresa_id := OLD.empresa_id;
    v_producto_id := OLD.producto_id;
    v_almacen_id := OLD.almacen_id;
  ELSE
    v_empresa_id := NEW.empresa_id;
    v_producto_id := NEW.producto_id;
    v_almacen_id := NEW.almacen_id;
  END IF;

  -- Calcular total entradas (entrada, transferencia in?, devolucion, ajuste+)
  SELECT COALESCE(SUM(cantidad), 0) INTO v_entradas
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id AND producto_id = v_producto_id AND almacen_id = v_almacen_id
    AND tipo_movimiento IN ('entrada', 'devolucion') OR (tipo_movimiento = 'ajuste' AND cantidad > 0);

  -- Calcular total salidas (salida, transferencia out?, merma, ajuste-)
  SELECT COALESCE(SUM(ABS(cantidad)), 0) INTO v_salidas
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id AND producto_id = v_producto_id AND almacen_id = v_almacen_id
    AND tipo_movimiento IN ('salida') OR (tipo_movimiento = 'ajuste' AND cantidad < 0);

  v_stock := v_entradas - v_salidas;

  SELECT MAX(created_at) INTO v_ultimo
  FROM erp.movimientos_inventario
  WHERE empresa_id = v_empresa_id AND producto_id = v_producto_id AND almacen_id = v_almacen_id;

  INSERT INTO erp.inventario (empresa_id, producto_id, almacen_id, cantidad, ultimo_movimiento, updated_at)
  VALUES (v_empresa_id, v_producto_id, v_almacen_id, v_stock, v_ultimo, now())
  ON CONFLICT (empresa_id, producto_id, almacen_id)
  DO UPDATE SET 
    cantidad = EXCLUDED.cantidad,
    ultimo_movimiento = EXCLUDED.ultimo_movimiento,
    updated_at = now();

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_mantenimiento_inventario ON erp.movimientos_inventario;
CREATE TRIGGER trg_mantenimiento_inventario
AFTER INSERT OR UPDATE OR DELETE ON erp.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION erp.fn_trg_mantenimiento_inventario();

-- 6. Backfill inicial de erp.inventario
DO $$
DECLARE
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id UUID;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN; END IF;

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

