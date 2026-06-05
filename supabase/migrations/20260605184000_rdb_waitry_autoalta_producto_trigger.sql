-- Iniciativa rdb-waitry-autoalta-productos · Sprint 1: auto-alta de productos entrantes de Waitry.
--
-- Problema: cuando un producto nuevo se agrega al menú del POS Waitry y se vende, el webhook entrante
-- registra la venta en rdb.waitry_productos pero NO crea el producto en erp.productos. El reporte de
-- ventas por categoría enlaza por codigo (waitry_productos.product_id = erp.productos.codigo), así que
-- esos productos caen en "Sin categoría". Hasta hoy esto se parchaba con backfills manuales recurrentes
-- (20260521164159, 20260605160000, 20260605170000) — un treadmill.
--
-- Solución: trigger AFTER INSERT sobre rdb.waitry_productos que da de alta el producto faltante en el
-- catálogo en el momento de la primera venta:
--   - codigo = product_id de Waitry (cierra el enlace del reporte).
--   - nombre = product_name de la venta.
--   - categoria_id = NULL: clasificar es decisión humana; el producto aparece en la pantalla de Productos
--     de RDB (filtro "Sin categoría") para que el operador lo clasifique en un clic.
--   - inventariable = false: existe para el enlace del reporte; no entra al conteo de stock hasta que un
--     humano lo decida (mismo criterio que los backfills previos).
--   - tipo = 'producto' por defecto (ajustable a 'servicio' al clasificar).
--
-- Garantías:
--   - Idempotente: INSERT ... WHERE NOT EXISTS por (empresa_id, codigo) — no duplica si ya existe.
--   - Fail-open: EXCEPTION WHEN OTHERS THEN RETURN NEW — un fallo del auto-alta NUNCA tumba la ingesta
--     de la venta (la venta es la fuente de verdad financiera).
--   - SECURITY DEFINER + search_path fijo (gemelo de erp.fn_trg_waitry_to_movimientos).
--
-- Notas:
--   - No se modifica erp.fn_trg_waitry_to_movimientos. Los productos inventariable=false generan
--     movimientos "legacy" pero rdb.v_inventario_stock filtra inventariable=true → no contaminan stock
--     (comportamiento ya existente: 30 productos inventariable=false / 3,960 movimientos).
--   - El trigger se nombra para correr DESPUÉS de trg_waitry_productos_to_movimientos (orden alfabético:
--     'productos...' < 'zzz...'), de modo que la PRIMERA venta de un producto nuevo no genere un
--     movimiento legacy (el producto aún no existe cuando to_movimientos corre).
--   - RDB-only: rdb.waitry_productos es RDB-específica; única empresa con Waitry.

CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_autoalta_producto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
DECLARE
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
BEGIN
  -- Solo si la línea trae código de producto.
  IF NEW.product_id IS NULL OR NEW.product_id = '' THEN
    RETURN NEW;
  END IF;

  -- Auto-alta idempotente del producto faltante.
  INSERT INTO erp.productos (empresa_id, codigo, nombre, tipo, categoria_id, inventariable, activo)
  SELECT v_empresa_id, NEW.product_id, NEW.product_name, 'producto', NULL, false, true
  WHERE NOT EXISTS (
    SELECT 1 FROM erp.productos p
    WHERE p.empresa_id = v_empresa_id AND p.codigo = NEW.product_id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fail-open: nunca tumbar la ingesta de la venta por un fallo del auto-alta.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_waitry_zzz_autoalta_producto ON rdb.waitry_productos;
CREATE TRIGGER trg_waitry_zzz_autoalta_producto
AFTER INSERT ON rdb.waitry_productos
FOR EACH ROW
EXECUTE FUNCTION erp.fn_trg_waitry_autoalta_producto();
