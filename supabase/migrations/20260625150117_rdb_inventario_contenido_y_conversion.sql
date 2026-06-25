-- ╭─ 20260625150117_rdb_inventario_contenido_y_conversion ─╮
-- Motor de conversión de unidades para el descuento de inventario por receta.
--
-- Problema: el trigger de ventas Waitry descuenta la cantidad de la receta
-- (ml/g) SIN convertirla a la unidad de stock del insumo (pieza/botella), por lo
-- que vende 1 trago y resta "20 botellas". El dato que falta —cuántos ml trae 1
-- botella— vive sólo en el nombre del producto.
--
-- Esta migración (iniciativa rdb-inventario-conversion-recetas, Sprints 1+2):
--   1. Agrega erp.productos.contenido + unidad_base (presentación → unidad fina).
--   2. Funciones de conversión (universal litro↔ml / kilo↔g + por presentación).
--   3. Reescribe fn_trg_waitry_to_movimientos para convertir antes de restar.
--      Sin factor de conversión conocido ⇒ NO descuenta (detiene el sangrado;
--      no genera stock fantasma).
--
-- No incluye backfill de contenidos (Sprint 4, valores validados por Beto) ni
-- corrección de los movimientos ya mal descontados desde 2026-06-17.

BEGIN;

-- ── 1) Schema: contenido de la presentación ────────────────────────────────
ALTER TABLE erp.productos
  ADD COLUMN IF NOT EXISTS unidad_base text,
  ADD COLUMN IF NOT EXISTS contenido   numeric;

COMMENT ON COLUMN erp.productos.unidad_base IS
  'Unidad fina de consumo (mililitro, gramo, …) en que se expresa "contenido". '
  'NULL = el producto no se fracciona; el stock se descuenta en su unidad de compra.';
COMMENT ON COLUMN erp.productos.contenido IS
  'Cuántas unidad_base trae 1 unidad de compra (ej. 980 ml por botella). '
  'NULL/0 = sin fraccionamiento. Usado por erp.fn_factor_receta_a_stock.';

-- ── 2a) Conversión universal dentro de la misma dimensión física ───────────
-- Devuelve el factor para pasar de p_de → p_a cuando ambas unidades son de la
-- misma dimensión continua (volumen o masa). NULL si distinta dimensión o si
-- alguna no es una unidad continua conocida (pieza/botella/… ⇒ NULL).
CREATE OR REPLACE FUNCTION erp.fn_factor_universal(p_de text, p_a text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH u(nombre, dim, peso) AS (
    VALUES
      ('mililitro', 'V', 1::numeric),
      ('litro',     'V', 1000),
      ('galon',     'V', 3785.412),
      ('gramo',     'M', 1),
      ('kilo',      'M', 1000)
  )
  SELECT CASE WHEN d.dim = a.dim THEN d.peso / a.peso END
  FROM u d, u a
  WHERE d.nombre = lower(btrim(p_de))
    AND a.nombre = lower(btrim(p_a));
$fn$;

COMMENT ON FUNCTION erp.fn_factor_universal(text, text) IS
  'Factor de conversión entre unidades de la misma dimensión (litro↔ml, kilo↔g). '
  'NULL si dimensiones distintas o unidad no continua.';

-- ── 2b) Factor de la cantidad de receta → unidad de stock del insumo ────────
-- Devuelve F tal que: cantidad_en_unidad_stock = cantidad_receta * F.
-- NULL ⇒ no convertible (el trigger no descuenta ese insumo).
CREATE OR REPLACE FUNCTION erp.fn_factor_receta_a_stock(p_insumo_id uuid, p_unidad_receta text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, erp, public
AS $fn$
DECLARE
  v_unidad_stock text;
  v_unidad_base  text;
  v_contenido    numeric;
  u_receta       text := lower(btrim(p_unidad_receta));
  v_fac          numeric;
  v_fac_base     numeric;
BEGIN
  SELECT lower(btrim(unidad)), lower(btrim(unidad_base)), contenido
    INTO v_unidad_stock, v_unidad_base, v_contenido
  FROM erp.productos
  WHERE id = p_insumo_id;

  IF NOT FOUND OR u_receta IS NULL OR u_receta = '' THEN
    RETURN NULL;
  END IF;

  -- Caso 0: la receta ya está en la unidad de stock.
  IF u_receta = v_unidad_stock THEN
    RETURN 1;
  END IF;

  -- Caso 1: misma dimensión continua que el stock (ej. receta g, stock kilo).
  v_fac := erp.fn_factor_universal(u_receta, v_unidad_stock);
  IF v_fac IS NOT NULL THEN
    RETURN v_fac;
  END IF;

  -- Caso 2: el stock es una presentación discreta (pieza/botella/bolsa) con
  -- contenido + unidad_base capturados. Llevar la receta a unidad_base y dividir
  -- entre el contenido de 1 presentación.
  IF v_contenido IS NOT NULL AND v_contenido > 0 AND v_unidad_base IS NOT NULL THEN
    IF u_receta = v_unidad_base THEN
      v_fac_base := 1;
    ELSE
      v_fac_base := erp.fn_factor_universal(u_receta, v_unidad_base);
    END IF;

    IF v_fac_base IS NOT NULL THEN
      RETURN v_fac_base / v_contenido;
    END IF;
  END IF;

  -- No convertible: el trigger omitirá el descuento de este insumo.
  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION erp.fn_factor_receta_a_stock(uuid, text) IS
  'Factor para convertir la cantidad de una receta a la unidad de stock del '
  'insumo. NULL = no convertible (sin contenido/unidad_base) ⇒ no se descuenta.';

-- ── 3) Trigger Waitry: convierte la cantidad de receta antes de restar ──────
-- Reescrito desde la versión viva en prod (pg_get_functiondef, 2026-06-25).
-- Único cambio funcional vs la versión viva: el loop de receta multiplica por
-- el factor de conversión y omite insumos no convertibles.
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
DECLARE
  v_producto_id      UUID;
  v_parent_id        UUID;
  v_factor_consumo   NUMERIC;
  v_empresa_id       UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id       UUID;
  v_order_status     TEXT;
  v_order_paid       BOOLEAN;
  v_order_superseded TEXT;
  v_receta_rows      INTEGER;
  r_insumo           RECORD;
  v_factor           NUMERIC;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT status, paid, superseded_by_order_id
    INTO v_order_status, v_order_paid, v_order_superseded
  FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;

  -- Venta no concretada (cancelada, pago no completado o fantasma): sin salida.
  IF v_order_status = 'order_canceled' OR v_order_paid IS NOT TRUE OR v_order_superseded IS NOT NULL THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id, parent_id, factor_consumo
    INTO v_producto_id, v_parent_id, v_factor_consumo
  FROM erp.productos
  WHERE codigo = NEW.product_id AND empresa_id = v_empresa_id
  LIMIT 1;

  IF v_producto_id IS NULL THEN RETURN NEW; END IF;

  DELETE FROM erp.movimientos_inventario
  WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;

  SELECT COUNT(*) INTO v_receta_rows
  FROM erp.producto_receta
  WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id;

  IF v_receta_rows > 0 THEN
    FOR r_insumo IN
      SELECT insumo_id, cantidad, unidad
      FROM erp.producto_receta
      WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id
    LOOP
      -- Convierte la cantidad de receta (unidad fina) a la unidad de stock.
      v_factor := erp.fn_factor_receta_a_stock(r_insumo.insumo_id, r_insumo.unidad);

      -- Sin factor de conversión conocido ⇒ no descontar (evita stock fantasma).
      IF v_factor IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO erp.movimientos_inventario
        (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
         referencia_tipo, referencia_id, notas, created_at)
      VALUES
        (v_empresa_id, r_insumo.insumo_id, v_almacen_id, 'salida',
         NEW.quantity * r_insumo.cantidad * v_factor, 'venta_waitry', NEW.id,
         'Venta Waitry Order: ' || NEW.order_id || ' (receta)',
         COALESCE(NEW.created_at, now()));
    END LOOP;
    RETURN NEW;
  END IF;

  -- Fallback legacy (producto sin receta): parent_id + factor_consumo.
  -- Este camino ya estaba expresado en la unidad de stock (botellas), se conserva.
  INSERT INTO erp.movimientos_inventario
    (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
     referencia_tipo, referencia_id, notas, created_at)
  VALUES
    (v_empresa_id, COALESCE(v_parent_id, v_producto_id), v_almacen_id, 'salida',
     NEW.quantity * COALESCE(v_factor_consumo, 1.0), 'venta_waitry', NEW.id,
     'Venta Waitry Order: ' || NEW.order_id || ' (legacy)',
     COALESCE(NEW.created_at, now()));

  RETURN NEW;
END;
$function$;

-- Recarga el cache de PostgREST por las columnas nuevas en erp.productos.
NOTIFY pgrst, 'reload schema';

COMMIT;
