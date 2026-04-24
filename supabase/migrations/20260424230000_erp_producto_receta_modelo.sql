-- ============================================================
-- PR 2: Modelo de recetas multi-ingrediente + limpieza RDB
--
-- 1) Tabla erp.producto_receta + RLS + indexes.
-- 2) Backfill desde parent_id + factor_consumo.
-- 3) Mapeo de códigos Waitry a los 11 hijos con match histórico exacto.
-- 4) Desactivación de hijos fantasma (sabores sin producto Waitry real) y
--    códigos genéricos al padre.
-- 5) Desactivación de 3 hijos campechano sin ventas históricas.
-- 6) 15 servicios marcados como inventariable=false (rentas, clases, propinas).
-- 7) Trigger Waitry actualizado: lee de producto_receta, fallback legacy.
-- 8) Conversión inicial de 4 preparaciones (Chelada/Michelada + variantes)
--    con receta base de Tecate Roja 325ml.
-- ============================================================

-- 1) Tabla
CREATE TABLE IF NOT EXISTS erp.producto_receta (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES core.empresas(id),
  producto_venta_id  uuid NOT NULL REFERENCES erp.productos(id) ON DELETE CASCADE,
  insumo_id          uuid NOT NULL REFERENCES erp.productos(id) ON DELETE RESTRICT,
  cantidad           numeric(12,4) NOT NULL CHECK (cantidad > 0),
  unidad             text NOT NULL,
  notas              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_venta_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_receta_venta   ON erp.producto_receta (producto_venta_id);
CREATE INDEX IF NOT EXISTS idx_producto_receta_insumo  ON erp.producto_receta (insumo_id);
CREATE INDEX IF NOT EXISTS idx_producto_receta_empresa ON erp.producto_receta (empresa_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_producto_receta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_producto_receta_updated_at ON erp.producto_receta;
CREATE TRIGGER trg_producto_receta_updated_at
BEFORE UPDATE ON erp.producto_receta
FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at_producto_receta();

-- RLS (alineado con patrón erp.productos: core.fn_has_empresa + core.fn_is_admin)
ALTER TABLE erp.producto_receta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_producto_receta_select ON erp.producto_receta;
CREATE POLICY erp_producto_receta_select ON erp.producto_receta FOR SELECT TO authenticated
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_producto_receta_insert ON erp.producto_receta;
CREATE POLICY erp_producto_receta_insert ON erp.producto_receta FOR INSERT TO authenticated
WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_producto_receta_update ON erp.producto_receta;
CREATE POLICY erp_producto_receta_update ON erp.producto_receta FOR UPDATE TO authenticated
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_producto_receta_delete ON erp.producto_receta;
CREATE POLICY erp_producto_receta_delete ON erp.producto_receta FOR DELETE TO authenticated
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- service_role bypassa RLS automáticamente; no se necesita policy explícita.

GRANT ALL ON erp.producto_receta TO authenticated;
GRANT ALL ON erp.producto_receta TO service_role;

-- 2) Backfill desde parent_id + factor_consumo
INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad, notas)
SELECT
  h.empresa_id,
  h.id,
  h.parent_id,
  COALESCE(h.factor_consumo, 1.0),
  COALESCE(p.unidad, 'pieza'),
  'Backfill PR2 desde parent_id/factor_consumo'
FROM erp.productos h
JOIN erp.productos p ON p.id = h.parent_id
WHERE h.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND h.parent_id IS NOT NULL
  AND h.deleted_at IS NULL
ON CONFLICT (producto_venta_id, insumo_id) DO NOTHING;

-- 3) Mapeo de códigos Waitry a los 11 hijos con match histórico exacto
UPDATE erp.productos SET codigo = '1298862' WHERE id = '4ed57cda-d5c2-4a6d-84cd-7cb092317000'; -- Agua Mineral Preparada Tehuacan
UPDATE erp.productos SET codigo = '1298864' WHERE id = 'fdf44027-bbdb-4302-8b74-60483eff5e7f'; -- Agua Mineral Tehuacan escarchada con chamoy
UPDATE erp.productos SET codigo = '1277122' WHERE id = 'e435cf16-de9f-4234-ad61-0fda9e53a8d0'; -- Bacardi Divorciado
UPDATE erp.productos SET codigo = '1277125' WHERE id = 'a0e693cd-d5d4-42d6-a802-cf4990d25c81'; -- Capitan Morgan Divorciado
UPDATE erp.productos SET codigo = '1300123' WHERE id = '501a1983-ad58-4d51-b16b-995820170db8'; -- Capitán Morgan Pintado
UPDATE erp.productos SET codigo = '1277123' WHERE id = 'eb0b5ac8-777b-4c8b-954d-676771c201e4'; -- Capitán Morgan Preparado
UPDATE erp.productos SET codigo = '1276024' WHERE id = '52f476e3-89f2-480e-991e-6f0ae929460f'; -- Electrolife Zero Mora Azul
UPDATE erp.productos SET codigo = '1276025' WHERE id = '3a32b8b8-2c6d-4242-b8b3-acc7264941a3'; -- Electrolife Zero Naranja
UPDATE erp.productos SET codigo = '1276038' WHERE id = '792a7a4b-91d5-4c84-a747-054084fe6e1a'; -- Electrolit Ponche de Frutas
UPDATE erp.productos SET codigo = '1276104' WHERE id = 'd459e4de-c9e4-4b6a-9a9c-0e211e70e0fe'; -- Powerade Uva
UPDATE erp.productos SET codigo = '1300150' WHERE id = 'eab95b03-f193-4b2d-aa81-d34658da9268'; -- Whiskey Etiqueta Roja Divorciado

-- 4) Códigos genéricos a padres + desactivar hijos fantasma
UPDATE erp.productos SET codigo = '1298987'
WHERE nombre = 'Electrolit' AND parent_id IS NULL
  AND empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa' AND codigo IS NULL;
UPDATE erp.productos SET codigo = '1298988'
WHERE nombre = 'Flashlyte' AND parent_id IS NULL
  AND empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa' AND codigo IS NULL;

-- Hijos fantasma: sabores que no existen como producto separado en Waitry
UPDATE erp.productos SET activo = false
WHERE id IN (
  '6b9079b2-415b-4697-be90-c4f76a7dd55c',  -- Electrolit Coco
  '24d5a12a-d49f-4c8f-9056-6c5f929e93b3',  -- Electrolit Horchata
  'e868e41c-0267-48ae-af6e-20186ecd74c2',  -- Electrolit Piña
  '445075e5-3dac-4add-b725-3034a764b153',  -- Flashlyte Sandia
  '61d64a61-eeda-4a09-aeaf-6361028f3ff0'   -- Powerade Lima Limon
);

-- 5) 3 hijos Campechano sin ventas históricas en Waitry
UPDATE erp.productos SET activo = false
WHERE id IN (
  'e561eec5-8432-4178-a68f-c796f4b05c48',  -- Capitan Morgan Campechano
  '1eb1ecf5-7578-42b6-b850-35ef3ec872bb',  -- Maestro Dobel Diamante Campechano
  'ee81ef39-061e-4a0b-972c-72f57eff5644'   -- Vodka Absolut Campechano
);

-- 6) Servicios que no son inventario físico (rentas, clases, torneos, propinas)
UPDATE erp.productos SET inventariable = false
WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND nombre IN (
    'Renta Cancha Padel',
    'Renta Tenis Doub. 90 min',
    'Torneo Relampago',
    'Renta de Pala Adidas',
    'Uso cancha coach',
    'Academia Padel',
    'Clase de Academia Tenis',
    'Renta Pickleball Doub. 90 min',
    'Renta Pickleball Doub. 60 min',
    'Clase Priv. Carlos 2 pers.',
    'Clase de Academia Padel',
    'Clase Priv. Carlos 1 pers.',
    'Propina',
    'Propina $20',
    'Propina $50'
  );

-- 7) Trigger Waitry actualizado: lee de producto_receta con fallback legacy
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, erp, rdb, public
AS $fn$
DECLARE
  v_producto_id    UUID;
  v_parent_id      UUID;
  v_factor_consumo NUMERIC;
  v_empresa_id     UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id     UUID;
  v_order_status   TEXT;
  v_receta_rows    INTEGER;
  r_insumo         RECORD;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT status INTO v_order_status FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;
  IF v_order_status = 'order_canceled' THEN
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

  -- Estrategia 1: usar erp.producto_receta si el producto tiene recetas
  SELECT COUNT(*) INTO v_receta_rows
  FROM erp.producto_receta
  WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id;

  IF v_receta_rows > 0 THEN
    FOR r_insumo IN
      SELECT insumo_id, cantidad
      FROM erp.producto_receta
      WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id
    LOOP
      INSERT INTO erp.movimientos_inventario
        (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
         referencia_tipo, referencia_id, notas, created_at)
      VALUES
        (v_empresa_id, r_insumo.insumo_id, v_almacen_id, 'salida',
         NEW.quantity * r_insumo.cantidad, 'venta_waitry', NEW.id,
         'Venta Waitry Order: ' || NEW.order_id || ' (receta)',
         COALESCE(NEW.created_at, now()));
    END LOOP;
    RETURN NEW;
  END IF;

  -- Estrategia 2 (fallback legacy): usar parent_id + factor_consumo
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
$fn$;

-- 8) Conversión de 4 preparaciones: padre inventariable -> no-inventariable con receta.
--    Tecate Roja 325ml = cerveza base por default; ops puede ajustar via UI.
DO $prep$
DECLARE
  v_empresa_id              UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_tecate_id               UUID;
  v_chelada_id              UUID;
  v_michelada_id            UUID;
  v_michelada_clamato_id    UUID;
  v_michelada_clamato_1l_id UUID;
BEGIN
  SELECT id INTO v_tecate_id FROM erp.productos
  WHERE nombre = 'Tecate Roja 325ml' AND empresa_id = v_empresa_id
    AND deleted_at IS NULL LIMIT 1;

  IF v_tecate_id IS NULL THEN
    RAISE NOTICE 'Tecate Roja 325ml no encontrado. Saltando conversión de preparaciones.';
    RETURN;
  END IF;

  SELECT id INTO v_chelada_id FROM erp.productos
  WHERE nombre = 'Chelada' AND parent_id IS NULL AND empresa_id = v_empresa_id LIMIT 1;
  SELECT id INTO v_michelada_id FROM erp.productos
  WHERE nombre = 'Michelada' AND parent_id IS NULL AND empresa_id = v_empresa_id LIMIT 1;
  SELECT id INTO v_michelada_clamato_id FROM erp.productos
  WHERE nombre = 'Michelada Clamato' AND parent_id IS NULL AND empresa_id = v_empresa_id LIMIT 1;
  SELECT id INTO v_michelada_clamato_1l_id FROM erp.productos
  WHERE nombre = 'Michelada Clamato 1 Litro' AND parent_id IS NULL AND empresa_id = v_empresa_id LIMIT 1;

  -- Marcar como no-inventariables (son preparaciones, no stock)
  UPDATE erp.productos SET inventariable = false
  WHERE id IN (v_chelada_id, v_michelada_id, v_michelada_clamato_id, v_michelada_clamato_1l_id);

  IF v_chelada_id IS NOT NULL THEN
    INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad, notas)
    VALUES (v_empresa_id, v_chelada_id, v_tecate_id, 1.0, 'pieza',
            'PR2 initial: cerveza base. Ajustar por UI si la real es otra.')
    ON CONFLICT (producto_venta_id, insumo_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  IF v_michelada_id IS NOT NULL THEN
    INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad, notas)
    VALUES (v_empresa_id, v_michelada_id, v_tecate_id, 1.0, 'pieza',
            'PR2 initial: cerveza base. Ajustar por UI si la real es otra.')
    ON CONFLICT (producto_venta_id, insumo_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  IF v_michelada_clamato_id IS NOT NULL THEN
    INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad, notas)
    VALUES (v_empresa_id, v_michelada_clamato_id, v_tecate_id, 1.0, 'pieza',
            'PR2 initial: cerveza base. Ajustar por UI si la real es otra.')
    ON CONFLICT (producto_venta_id, insumo_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  IF v_michelada_clamato_1l_id IS NOT NULL THEN
    INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad, notas)
    VALUES (v_empresa_id, v_michelada_clamato_1l_id, v_tecate_id, 3.0, 'pieza',
            'PR2 initial: 3 cervezas para 1L. Ajustar por UI si es otra.')
    ON CONFLICT (producto_venta_id, insumo_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;
END $prep$;
