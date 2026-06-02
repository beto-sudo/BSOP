-- Puente Capa B (contratos de obra) → CxP — Fase 2 de `dilesa-contratos-obra`.
-- Implementa ADR-039 (`docs/adr/039_puente_obra_cxp.md`): la estimación de obra
-- se promueve a una FACTURA DE EGRESO (`erp.facturas`), que entra al flujo CxP
-- (programar → aprobar Dirección → pagar → conciliar) sin re-modelar el contrato
-- ni el subledger. CxP ya está en DILESA (cxp Sprint 4, #640).
--
-- Dos piezas:
--   1. `erp.facturas.obra_estimacion_id` — liga la factura a su estimación de
--      origen. El contrato queda como agregador; el proyecto se deriva por la
--      cadena factura → estimación → contrato → proyecto (la factura no guarda
--      proyecto_id). Índice único parcial → 1 factura ACTIVA por estimación.
--   2. RPC `erp.cxp_factura_desde_estimacion(...)` — reúsa `cxp_factura_alta`
--      (no modifica el RPC de CxP): lee la estimación + contrato, valida, llama
--      al alta y setea el link. "Neto a CxP" (ADR-039 D3): solo estimaciones con
--      monto > 0 se emiten; las amortizaciones/negativas no generan factura.

BEGIN;

-- 1) Columna de enlace (nullable — solo facturas de obra la poblan).
ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS obra_estimacion_id uuid
    REFERENCES dilesa.obra_estimaciones (id) ON DELETE SET NULL;

COMMENT ON COLUMN erp.facturas.obra_estimacion_id IS
  'Estimación de obra (dilesa.obra_estimaciones) que originó esta factura de egreso. Puente Capa B → CxP, ADR-039.';

-- 1 factura ACTIVA (no cancelada) por estimación. Permite re-emitir si la
-- anterior se canceló.
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_obra_estimacion_activa
  ON erp.facturas (obra_estimacion_id)
  WHERE obra_estimacion_id IS NOT NULL AND cancelada_at IS NULL;

-- 2) RPC: emite una factura de egreso desde una estimación de obra.
CREATE OR REPLACE FUNCTION erp.cxp_factura_desde_estimacion(
  p_estimacion_id uuid,
  p_condiciones_pago_dias integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'dilesa', 'public'
AS $function$
DECLARE
  v_est record;
  v_ctr record;
  v_existing uuid;
  v_factura_id uuid;
BEGIN
  -- Estimación de origen.
  SELECT e.id, e.monto_total, e.fecha, e.etiqueta, e.factura_ref, e.contrato_id
    INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = p_estimacion_id AND e.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La estimación % no existe', p_estimacion_id;
  END IF;

  -- Neto a CxP (ADR-039 D3): solo montos positivos generan factura. Las
  -- amortizaciones del anticipo (filas negativas / NC) no se emiten.
  IF v_est.monto_total IS NULL OR v_est.monto_total <= 0 THEN
    RAISE EXCEPTION
      'Solo se emiten a CxP estimaciones con monto > 0 (las amortizaciones/negativas no generan factura)';
  END IF;

  -- ¿Ya emitida (factura activa)?
  SELECT id INTO v_existing
  FROM erp.facturas
  WHERE obra_estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'La estimación % ya tiene una factura de egreso (%)', p_estimacion_id, v_existing;
  END IF;

  -- Contrato → contratista (= proveedor) + empresa + tasa IVA.
  SELECT c.empresa_id, c.contratista_id, c.codigo, c.iva_tasa
    INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato de la estimación no existe o fue borrado';
  END IF;

  -- Reúsa el alta canónica de CxP (valida total, inserta egreso 'por_pagar',
  -- escribe audit_log). Captura inclusiva: sin uuid_sat (se timbra/adjunta luego).
  v_factura_id := erp.cxp_factura_alta(
    p_empresa_id := v_ctr.empresa_id,
    p_proveedor_id := v_ctr.contratista_id,
    p_total := v_est.monto_total,
    p_fecha_emision := COALESCE(v_est.fecha, CURRENT_DATE),
    p_condiciones_pago_dias := p_condiciones_pago_dias,
    p_tasa_iva := v_ctr.iva_tasa,
    p_notas := 'Obra ' || v_ctr.codigo || ' · estimación ' || COALESCE(v_est.etiqueta, '(s/etiqueta)')
      || COALESCE(' · fact ' || v_est.factura_ref, '')
  );

  -- Liga la factura a su estimación de origen.
  UPDATE erp.facturas SET obra_estimacion_id = p_estimacion_id WHERE id = v_factura_id;

  RETURN v_factura_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
