-- ╭─ 20260611023408_dilesa_unidades_problema_zcu ─╮
-- Casas con problema de ZCU no pueden trasladar al precio el costo adicional
-- del tipo de crédito (ej. Fovissste +6%): FOVISSSTE no financia ese
-- sobreprecio en esas viviendas. Espejo de la columna "Problema ZCU"
-- (c-meYbneFp8R) de Coda DILESA · Inventario (grid--AHYMPQI7Z).
--
-- 1. dilesa.unidades.problema_zcu boolean NOT NULL DEFAULT false
-- 2. Marca las 35 casas señaladas en Coda al 2026-06-10 (Lomas de los
--    Encinos, manzanas 12/20/21). Robusto a Preview: matchea por nombre de
--    proyecto; en branch sin datos simplemente no afecta filas.
-- 3. fn_calcular_precio_venta: si la unidad tiene problema_zcu, el
--    costo_venta_adicional_pct del tipo de crédito NO se suma al precio.
--    Devuelve `zcu_exento` para que la UI explique el $0.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE idempotente + REPLACE fn.

BEGIN;

-- ── 1. Flag en unidades ──────────────────────────────────────────────────────
ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS problema_zcu boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dilesa.unidades.problema_zcu IS
  'Casa con problema de ZCU: el costo adicional del tipo de crédito (ej. Fovissste +6%) NO aplica en fn_calcular_precio_venta. Espejo de Coda Inventario "Problema ZCU".';

-- ── 2. Marcar las 35 casas señaladas en Coda (2026-06-10) ───────────────────
UPDATE dilesa.unidades u
SET problema_zcu = true
FROM dilesa.proyectos p
WHERE p.id = u.proyecto_id
  AND p.nombre = 'Lomas de los Encinos'
  AND p.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND (ltrim(u.manzana, '0'), ltrim(u.numero_lote, '0')) IN (
    ('12','28'),('12','29'),('12','30'),('12','31'),('12','32'),('12','33'),('12','34'),
    ('20','20'),('20','21'),('20','22'),('20','23'),('20','24'),('20','25'),('20','26'),('20','27'),('20','28'),
    ('21','21'),('21','22'),('21','23'),('21','24'),('21','25'),('21','26'),('21','27'),('21','28'),('21','29'),
    ('21','31'),('21','32'),('21','33'),('21','34'),('21','35'),('21','36'),('21','37'),('21','38'),('21','39'),('21','40')
  );

-- ── 3. fn_calcular_precio_venta: exentar costo crédito si problema_zcu ──────
-- Misma firma que 20260528000658 → CREATE OR REPLACE no genera overload.
CREATE OR REPLACE FUNCTION dilesa.fn_calcular_precio_venta(
  p_unidad_id uuid,
  p_tipo_credito_id uuid DEFAULT NULL,
  p_monto_credito_titular numeric DEFAULT 0,
  p_monto_credito_cotitular numeric DEFAULT 0,
  p_productos_adicionales numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidad record;
  v_proyecto record;
  v_producto record;
  v_tipo_credito record;
  v_valor_comercial numeric(14,2);
  v_metros_excedentes numeric(8,2);
  v_valor_excedente_terreno numeric(14,2);
  v_valor_frente_verde numeric(14,2);
  v_valor_esquina numeric(14,2);
  v_pct_esquina numeric(5,4);
  v_valor_venta_futuro numeric(14,2);
  v_costo_credito_adicional numeric(14,2);
  v_zcu_exento boolean := false;
  v_productos_adicionales numeric(14,2);
  v_precio_venta_total numeric(14,2);
  v_apoyo_infonavit numeric(14,2);
  v_pago_directo numeric(14,2);
BEGIN
  -- Cargar unidad
  SELECT id, empresa_id, proyecto_id, producto_id, area_m2, es_esquina,
         tiene_frente_verde, valor_venta_futuro_snapshot, identificador,
         problema_zcu
  INTO v_unidad
  FROM dilesa.unidades
  WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unidad no encontrada');
  END IF;

  -- Cargar proyecto
  SELECT id, precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria
  INTO v_proyecto
  FROM dilesa.proyectos
  WHERE id = v_unidad.proyecto_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'proyecto no encontrado');
  END IF;

  -- Cargar producto (prototipo) — puede ser NULL en unidades sin asignar
  v_valor_comercial := 0;
  IF v_unidad.producto_id IS NOT NULL THEN
    SELECT valor_comercial_referencia INTO v_producto
    FROM dilesa.productos
    WHERE id = v_unidad.producto_id AND deleted_at IS NULL;
    v_valor_comercial := COALESCE(v_producto.valor_comercial_referencia, 0);
  END IF;

  -- Tipo de crédito (opcional). Si la unidad tiene problema ZCU, el costo
  -- adicional del crédito NO se traslada al precio (FOVISSSTE no financia
  -- ese sobreprecio en casas ZCU); el apoyo Infonavit sí se respeta.
  v_costo_credito_adicional := 0;
  v_apoyo_infonavit := 0;
  IF p_tipo_credito_id IS NOT NULL THEN
    SELECT costo_venta_adicional_pct, apoyo_infonavit_monto INTO v_tipo_credito
    FROM dilesa.tipos_credito
    WHERE id = p_tipo_credito_id AND deleted_at IS NULL;
    IF FOUND THEN
      IF COALESCE(v_unidad.problema_zcu, false)
         AND COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0) > 0 THEN
        v_zcu_exento := true;
      ELSE
        v_costo_credito_adicional := v_valor_comercial * COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0);
      END IF;
      v_apoyo_infonavit := COALESCE(v_tipo_credito.apoyo_infonavit_monto, 0);
    END IF;
  END IF;

  -- Metros excedentes (si la unidad es mayor al lote promedio)
  v_metros_excedentes := 0;
  v_valor_excedente_terreno := 0;
  IF v_unidad.area_m2 IS NOT NULL AND v_proyecto.tamano_lote_promedio IS NOT NULL THEN
    v_metros_excedentes := GREATEST(0, v_unidad.area_m2 - v_proyecto.tamano_lote_promedio);
    v_valor_excedente_terreno := v_metros_excedentes * COALESCE(v_proyecto.precio_m2_excedente, 0);
  END IF;

  -- Frente verde: +2% si aplica (parejo para todos los proyectos por ahora)
  v_valor_frente_verde := CASE WHEN COALESCE(v_unidad.tiene_frente_verde, false)
    THEN v_valor_comercial * 0.02
    ELSE 0
  END;

  -- Esquina: % depende de la clasificación del proyecto
  v_pct_esquina := CASE v_proyecto.clasificacion_inmobiliaria
    WHEN 'interes_social' THEN 0.15
    WHEN 'residencial_medio' THEN 0.032
    WHEN 'residencial_alto' THEN 0.032
    ELSE 0
  END;
  v_valor_esquina := CASE WHEN COALESCE(v_unidad.es_esquina, false)
    THEN v_valor_comercial * v_pct_esquina
    ELSE 0
  END;

  -- Valor venta futuro: snapshot manual (eventualmente del módulo obra)
  v_valor_venta_futuro := COALESCE(v_unidad.valor_venta_futuro_snapshot, 0);

  -- Productos adicionales (paridad Coda): monto $ declarado por el vendedor
  v_productos_adicionales := GREATEST(0, COALESCE(p_productos_adicionales, 0));

  -- Precio de venta total
  v_precio_venta_total := v_valor_comercial
    + v_valor_excedente_terreno
    + v_valor_frente_verde
    + v_valor_esquina
    + v_valor_venta_futuro
    + v_costo_credito_adicional
    + v_productos_adicionales;

  -- Pago directo del cliente (después de créditos y apoyo)
  v_pago_directo := v_precio_venta_total
    - COALESCE(p_monto_credito_titular, 0)
    - COALESCE(p_monto_credito_cotitular, 0)
    - v_apoyo_infonavit;

  RETURN jsonb_build_object(
    'unidad_id', v_unidad.id,
    'identificador', v_unidad.identificador,
    'valor_comercial', v_valor_comercial,
    'metros_excedentes', v_metros_excedentes,
    'valor_excedente_terreno', v_valor_excedente_terreno,
    'valor_frente_verde', v_valor_frente_verde,
    'valor_esquina', v_valor_esquina,
    'pct_esquina_aplicado', v_pct_esquina,
    'valor_venta_futuro', v_valor_venta_futuro,
    'costo_credito_adicional', v_costo_credito_adicional,
    'zcu_exento', v_zcu_exento,
    'productos_adicionales', v_productos_adicionales,
    'precio_venta_total', v_precio_venta_total,
    'apoyo_infonavit', v_apoyo_infonavit,
    'monto_credito_titular', COALESCE(p_monto_credito_titular, 0),
    'monto_credito_cotitular', COALESCE(p_monto_credito_cotitular, 0),
    'pago_directo', v_pago_directo,
    'enganche_1pct', v_precio_venta_total * 0.01,
    'isai_2pct', v_precio_venta_total * 0.02,
    'gastos_notariales_6pct', v_precio_venta_total * 0.06
  );
END;
$$;

COMMENT ON FUNCTION dilesa.fn_calcular_precio_venta IS
  'Cálculo del precio de venta de una unidad — replica fórmula de Coda. UI Fase 1 (Solicitud) llama para preview en vivo. Inputs: unidad_id, tipo_credito_id (opt), montos de crédito, productos_adicionales (opt). Returns JSONB con breakdown completo. Unidades con problema_zcu no suman el costo adicional del crédito (zcu_exento=true).';

GRANT EXECUTE ON FUNCTION dilesa.fn_calcular_precio_venta TO authenticated;

-- ── 4. Reload schema cache PostgREST ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
