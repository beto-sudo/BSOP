-- ============================================================================
-- DILESA · Función SQL: cálculo del precio de venta de una unidad
-- ----------------------------------------------------------------------------
-- Sprint 7a — la UI llama esta función para mostrar el preview en vivo del
-- precio de venta al capturar Solicitud de Asignación. Replica la fórmula
-- de Coda.
--
-- Fórmula:
--   valor_comercial             ← producto.valor_comercial_referencia
--   metros_excedentes           = MAX(0, unidad.area_m2 - proyecto.lote_promedio)
--   valor_excedente_terreno     = metros_excedentes * proyecto.precio_m2_excedente
--   valor_frente_verde          = unidad.frente_verde ? valor_comercial * 0.02 : 0
--   valor_esquina               = unidad.esquina ? valor_comercial * pct_esquina : 0
--     pct_esquina = interes_social ? 0.15 : 0.032
--   valor_venta_futuro          = unidad.valor_venta_futuro_snapshot
--   costo_credito_adicional     = valor_comercial * tipo_credito.costo_venta_adicional_pct
--   precio_venta_total          = valor_comercial + suma de adicionales
--   apoyo_infonavit             = tipo_credito.apoyo_infonavit_monto
--   pago_directo                = precio_venta_total - credito_titular - credito_cotitular - apoyo_infonavit
--   enganche_1pct               = precio_venta_total * 0.01
--   isai_2pct                   = precio_venta_total * 0.02
--   gastos_notariales_6pct      = precio_venta_total * 0.06
--
-- Returns JSONB con breakdown completo (UI lo desestructura).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_calcular_precio_venta(
  p_unidad_id uuid,
  p_tipo_credito_id uuid DEFAULT NULL,
  p_monto_credito_titular numeric DEFAULT 0,
  p_monto_credito_cotitular numeric DEFAULT 0
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
  v_precio_venta_total numeric(14,2);
  v_apoyo_infonavit numeric(14,2);
  v_pago_directo numeric(14,2);
BEGIN
  -- Cargar unidad
  SELECT id, empresa_id, proyecto_id, producto_id, area_m2, es_esquina,
         tiene_frente_verde, valor_venta_futuro_snapshot, identificador
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

  -- Tipo de crédito (opcional)
  v_costo_credito_adicional := 0;
  v_apoyo_infonavit := 0;
  IF p_tipo_credito_id IS NOT NULL THEN
    SELECT costo_venta_adicional_pct, apoyo_infonavit_monto INTO v_tipo_credito
    FROM dilesa.tipos_credito
    WHERE id = p_tipo_credito_id AND deleted_at IS NULL;
    IF FOUND THEN
      v_costo_credito_adicional := v_valor_comercial * COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0);
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

  -- Precio de venta total
  v_precio_venta_total := v_valor_comercial
    + v_valor_excedente_terreno
    + v_valor_frente_verde
    + v_valor_esquina
    + v_valor_venta_futuro
    + v_costo_credito_adicional;

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
  'Cálculo del precio de venta de una unidad — replica fórmula de Coda. UI Fase 1 (Solicitud) llama para preview en vivo. Inputs: unidad_id, tipo_credito_id (opt), montos de crédito. Returns JSONB con breakdown completo.';

GRANT EXECUTE ON FUNCTION dilesa.fn_calcular_precio_venta TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
