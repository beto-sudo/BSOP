-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260610230502_dilesa_contratos_estimaciones_s3_pago_desde_      │
-- │  estimacion                                                        │
-- │                                                                    │
-- │  Sprint 3 de `dilesa-contratos-estimaciones`. RPC que cierra el   │
-- │  rastro contrato → estimación → pago → factura: programa el pago  │
-- │  CxP de una estimación AUTORIZADA por su NETO (monto − retención) │
-- │  y lo aplica a la factura que corresponda:                        │
-- │    · factura propia de la estimación (modo factura-por-estimación)│
-- │    · o la factura TOTAL del contrato (modo D5) — N pagos          │
-- │      parciales van saldando la factura total.                    │
-- │                                                                    │
-- │  El pago sigue el ciclo normal de CxP (programado → aprobado →    │
-- │  pagado); al ejecutarse, el sync de S1 marca la estimación como   │
-- │  `pagada`. La retención queda como saldo de la factura (fondo de  │
-- │  garantía que se libera al finiquito).                            │
-- │                                                                    │
-- │  Requiere 20260610223000 (S1: cxp_pagos.obra_estimacion_id).      │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION erp.cxp_pago_desde_estimacion(
  p_estimacion_id uuid,
  p_fecha_programada date DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_referencia text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'dilesa', 'public'
AS $function$
DECLARE
  v_est record;
  v_ctr record;
  v_factura record;
  v_neto numeric;
  v_pago_id uuid;
BEGIN
  SELECT e.id, e.empresa_id, e.contrato_id, e.etiqueta, e.estado,
         e.monto_total, e.retencion
    INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = p_estimacion_id AND e.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La estimación % no existe', p_estimacion_id;
  END IF;
  IF v_est.estado <> 'autorizada' THEN
    RAISE EXCEPTION 'Solo se programa el pago de una estimación AUTORIZADA por Dirección (estado actual: %)', v_est.estado;
  END IF;

  -- Neto a pagar (la retención se queda como saldo de la factura: fondo de
  -- garantía que se libera al finiquito).
  v_neto := COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0);
  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'La estimación no tiene neto a pagar (monto % − retención % = %). Las amortizaciones/negativas no generan pago.',
      v_est.monto_total, v_est.retencion, v_neto;
  END IF;

  -- 1 pago activo por estimación (el índice UNIQUE de S1 lo respalda).
  IF EXISTS (
    SELECT 1 FROM erp.cxp_pagos p
    WHERE p.obra_estimacion_id = p_estimacion_id
      AND p.deleted_at IS NULL
      AND p.estado NOT IN ('rechazado', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'La estimación ya tiene un pago CxP activo';
  END IF;

  SELECT c.id, c.codigo, c.contratista_id INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato de la estimación no existe o fue borrado';
  END IF;

  -- Factura destino: la propia de la estimación, o la TOTAL del contrato.
  SELECT f.id, f.saldo, f.obra_estimacion_id INTO v_factura
  FROM erp.facturas f
  WHERE f.cancelada_at IS NULL
    AND f.estado_cxp <> 'cancelada'
    AND (
      f.obra_estimacion_id = p_estimacion_id
      OR (f.contrato_id = v_ctr.id AND f.obra_estimacion_id IS NULL)
    )
  -- La propia primero (por si coexistieran tras datos históricos).
  ORDER BY (f.obra_estimacion_id = p_estimacion_id) DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La estimación no tiene factura: emítela a CxP (factura por estimación) o captura la factura total del contrato.';
  END IF;
  IF COALESCE(v_factura.saldo, 0) < v_neto THEN
    RAISE EXCEPTION 'El saldo de la factura ($ %) no alcanza para el neto de la estimación ($ %).',
      v_factura.saldo, v_neto;
  END IF;

  -- Alta canónica de CxP: valida saldos, inserta pago 'programado' +
  -- aplicación, escribe audit_log.
  v_pago_id := erp.cxp_pago_programar(
    p_empresa_id := v_est.empresa_id,
    p_proveedor_id := v_ctr.contratista_id,
    p_aplicaciones := jsonb_build_array(
      jsonb_build_object('factura_id', v_factura.id, 'monto', v_neto)
    ),
    p_metodo_pago := p_metodo_pago,
    p_fecha_programada := p_fecha_programada,
    p_cuenta_bancaria_id := p_cuenta_bancaria_id,
    p_referencia := p_referencia,
    p_notas := 'Obra ' || v_ctr.codigo || ' · estimación ' || COALESCE(v_est.etiqueta, '(s/etiqueta)')
      || CASE WHEN COALESCE(v_est.retencion, 0) > 0
           THEN ' · neto tras retención de ' || v_est.retencion
           ELSE '' END
      || CASE WHEN v_factura.obra_estimacion_id IS NULL
           THEN ' · aplicado a la factura total del contrato'
           ELSE '' END
  );

  -- Liga pago ↔ estimación (cierra el rastro; el trigger de integridad de
  -- S1 re-valida y el sync marcará `pagada` cuando el pago se ejecute).
  UPDATE erp.cxp_pagos
    SET obra_estimacion_id = p_estimacion_id
    WHERE id = v_pago_id;

  RETURN v_pago_id;
END;
$function$;

COMMENT ON FUNCTION erp.cxp_pago_desde_estimacion IS
  'Programa el pago CxP de una estimación de obra AUTORIZADA por su neto (monto − retención), aplicado a su factura propia o a la factura TOTAL del contrato (D5). El pago sigue el ciclo CxP normal; al ejecutarse, la estimación pasa a pagada (sync S1). Iniciativa dilesa-contratos-estimaciones S3.';

GRANT EXECUTE ON FUNCTION erp.cxp_pago_desde_estimacion(uuid, date, text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
