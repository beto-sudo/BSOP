-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260610224834_dilesa_contratos_estimaciones_s2_factura_total    │
-- │                                                                    │
-- │  Sprint 2 de `dilesa-contratos-estimaciones`. RPC para capturar   │
-- │  la FACTURA TOTAL de un contrato de obra (D5: factura flexible):  │
-- │  el contratista factura el contrato completo por adelantado y los │
-- │  avances se pagan aplicando pagos parciales a esa factura (la     │
-- │  liga estimación→pago llega en S3). Complemento del modo          │
-- │  factura-por-estimación (cxp_factura_desde_estimacion).           │
-- │                                                                    │
-- │  Requiere 20260610223000 (S1: facturas.contrato_id).              │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION erp.cxp_factura_total_contrato(
  p_contrato_id uuid,
  p_total numeric,
  p_fecha_emision date DEFAULT CURRENT_DATE,
  p_condiciones_pago_dias integer DEFAULT NULL,
  p_factura_ref text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'dilesa', 'public'
AS $function$
DECLARE
  v_ctr record;
  v_factura_id uuid;
BEGIN
  SELECT c.id, c.empresa_id, c.contratista_id, c.codigo, c.iva_tasa,
         c.partida_id, c.valor_total, c.tipo, c.cancelada_at
    INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = p_contrato_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato % no existe', p_contrato_id;
  END IF;
  IF v_ctr.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'El contrato % está cancelado', v_ctr.codigo;
  END IF;
  IF v_ctr.tipo = 'vivienda' THEN
    RAISE EXCEPTION 'La factura total aplica a contratos de obra (los de vivienda operan por destajos semanales, ADR-033)';
  END IF;

  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El total de la factura debe ser mayor a 0';
  END IF;
  -- El contrato es el tope: una factura total por encima del valor
  -- contratado requiere primero actualizar el contrato (valor_total).
  IF p_total > v_ctr.valor_total THEN
    RAISE EXCEPTION 'La factura ($ %) excede el valor del contrato % ($ %). Actualiza primero el valor del contrato.',
      p_total, v_ctr.codigo, v_ctr.valor_total;
  END IF;

  -- 1 factura total ACTIVA por contrato.
  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.contrato_id = p_contrato_id
      AND f.obra_estimacion_id IS NULL
      AND f.cancelada_at IS NULL
      AND f.estado_cxp <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'El contrato % ya tiene una factura total activa', v_ctr.codigo;
  END IF;

  -- Modo mixto bloqueado (espejo de cxp_factura_desde_estimacion): si ya
  -- hay facturas por estimación activas, la factura total duplicaría el
  -- cargo del mismo trabajo.
  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.contrato_id = p_contrato_id
      AND f.obra_estimacion_id IS NOT NULL
      AND f.cancelada_at IS NULL
      AND f.estado_cxp <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'El contrato % ya opera factura-por-estimación (tiene facturas de estimación activas): cancélalas antes de capturar una factura total.', v_ctr.codigo;
  END IF;

  -- Alta canónica de CxP (valida, inserta egreso 'por_pagar', audit_log).
  v_factura_id := erp.cxp_factura_alta(
    p_empresa_id := v_ctr.empresa_id,
    p_proveedor_id := v_ctr.contratista_id,
    p_total := p_total,
    p_fecha_emision := COALESCE(p_fecha_emision, CURRENT_DATE),
    p_condiciones_pago_dias := p_condiciones_pago_dias,
    p_tasa_iva := v_ctr.iva_tasa,
    p_notas := 'Obra ' || v_ctr.codigo || ' · factura TOTAL del contrato'
      || COALESCE(' · fact ' || NULLIF(btrim(p_factura_ref), ''), '')
  );

  -- Liga al contrato (sin estimación de origen = factura total) y hereda
  -- la partida para que sus pagos cuenten en v_partida_control.pagado.
  UPDATE erp.facturas
    SET contrato_id = p_contrato_id,
        partida_id = COALESCE(partida_id, v_ctr.partida_id)
    WHERE id = v_factura_id;

  RETURN v_factura_id;
END;
$function$;

COMMENT ON FUNCTION erp.cxp_factura_total_contrato IS
  'Captura la factura TOTAL de un contrato de obra (D5 de dilesa-contratos-estimaciones): contrato_id sin obra_estimacion_id. Los avances se pagan aplicando pagos parciales a esta factura (cxp_pago_aplicaciones). Bloquea modo mixto con facturas por estimación y tope = valor del contrato.';

GRANT EXECUTE ON FUNCTION erp.cxp_factura_total_contrato(uuid, numeric, date, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
