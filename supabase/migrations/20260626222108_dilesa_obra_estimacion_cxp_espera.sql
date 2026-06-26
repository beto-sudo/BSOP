-- ╭─ 20260626222108_dilesa_obra_estimacion_cxp_espera ─╮
-- Iniciativa dilesa-obra-estimaciones-cxp · Sprint 1.
-- Unifica el flujo de obra con el patrón "en espera del XML" de los destajos de
-- vivienda: una estimación de obra AUTORIZADA nace como factura EN ESPERA en la
-- bandeja de CxP; administración sube el XML del contratista (reusa
-- cxp_factura_recibir_cfdi) y pasa a por_pagar — igual que vivienda.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).
--
-- Tres funciones:
--   1. erp.cxp_factura_desde_estimacion_obra_espera — espejo de
--      cxp_factura_desde_estimacion_destajo, adaptado a obra (contrato →
--      contratista/partida, neto = monto − retención, bloqueo D5 factura-total).
--      NACE en 'borrador' (no 'por_pagar' como la vieja cxp_factura_desde_estimacion).
--   2. dilesa.obra_estimacion_autorizar — al autorizar, la factura en espera
--      nace en el mismo acto (igual que estimacion_destajo_autorizar). Solo si
--      hay neto > 0 y el contrato no opera en modo factura-total.
--   3. erp.cxp_factura_recibir_cfdi — el guard de origen acepta también
--      obra_estimacion_id (antes solo estimacion_id de destajo).
--
-- Go-forward: no re-procesa lo histórico (las 275 estimaciones ya autorizadas no
-- se re-autorizan; ninguna tiene factura en CxP hoy). Migración financiera.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Factura EN ESPERA desde una estimación de obra autorizada.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp.cxp_factura_desde_estimacion_obra_espera(p_estimacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'dilesa', 'core', 'public'
AS $function$
DECLARE
  v_est record;
  v_ctr record;
  v_neto numeric;
  v_existing uuid;
  v_factura_id uuid;
BEGIN
  -- Estimación de obra de origen.
  SELECT e.id, e.empresa_id, e.contrato_id, e.etiqueta, e.fecha, e.factura_ref,
         e.monto_total, e.retencion, e.estado, e.deleted_at
    INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = p_estimacion_id;
  IF NOT FOUND OR v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación % no existe o está eliminada', p_estimacion_id;
  END IF;

  -- El devengo lo autoriza Dirección antes de llegar a CxP (lo hace
  -- obra_estimacion_autorizar, que llama a esta función en el mismo acto).
  IF v_est.estado NOT IN ('autorizada', 'pagada') THEN
    RAISE EXCEPTION 'La estimación debe estar autorizada por Dirección antes de emitirse a CxP (estado actual: %)', v_est.estado;
  END IF;

  -- Neto a CxP = monto − retención: el fondo de garantía no se paga hasta el
  -- finiquito (su contador y liberación guiada son el Sprint 4). Solo netos
  -- positivos generan factura — las amortizaciones del anticipo (filas
  -- negativas) reducen el devengo, no se emiten a CxP.
  v_neto := COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0);
  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'Solo se emiten a CxP estimaciones con neto > 0 (las amortizaciones/negativas no generan factura)';
  END IF;

  -- ¿Ya emitida (factura activa)?
  SELECT id INTO v_existing
  FROM erp.facturas
  WHERE obra_estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'La estimación % ya tiene una factura de egreso (%)', p_estimacion_id, v_existing;
  END IF;

  -- Contrato → contratista (= proveedor) + empresa + tasa IVA + partida.
  SELECT c.id, c.empresa_id, c.contratista_id, c.codigo, c.iva_tasa,
         c.partida_id, c.tipo, c.cancelada_at
    INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato de la estimación no existe o fue borrado';
  END IF;
  IF v_ctr.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'El contrato % está cancelado', v_ctr.codigo;
  END IF;
  IF v_ctr.tipo = 'vivienda' THEN
    RAISE EXCEPTION 'Las estimaciones de avance aplican a contratos de obra (vivienda opera por destajos semanales, ADR-033)';
  END IF;

  -- D5: si el contrato ya tiene factura TOTAL activa, los avances se pagan
  -- aplicando pagos a esa factura — emitir otra duplicaría el cargo.
  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.contrato_id = v_ctr.id
      AND f.obra_estimacion_id IS NULL
      AND f.cancelada_at IS NULL
      AND f.estado_cxp <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'El contrato % ya tiene una factura total activa: programa el pago de la estimación aplicándolo a esa factura (no se emite factura nueva).', v_ctr.codigo;
  END IF;

  -- Factura EN ESPERA: egreso, por el neto, sin CFDI todavía (espejo del
  -- destajo de vivienda). El proveedor es el contratista (ya es erp.personas).
  -- Hereda contrato + partida para que el pago cuente en v_partida_control.pagado.
  -- El CFDI real (cxp_factura_recibir_cfdi) sobreescribe subtotal/iva/total al
  -- recibirse, igual que en vivienda.
  INSERT INTO erp.facturas (
    empresa_id, flujo, proveedor_id, persona_id,
    obra_estimacion_id, contrato_id, partida_id,
    subtotal, iva, total, tasa_iva,
    fecha_emision, estado_cxp
  ) VALUES (
    v_ctr.empresa_id, 'egreso', v_ctr.contratista_id, v_ctr.contratista_id,
    p_estimacion_id, v_ctr.id, v_ctr.partida_id,
    v_neto, 0, v_neto, 0,
    COALESCE(v_est.fecha, CURRENT_DATE), 'borrador'
  ) RETURNING id INTO v_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_ctr.empresa_id, auth.uid(), 'cxp_factura_desde_estimacion_obra_espera', 'erp.facturas', v_factura_id,
    jsonb_build_object('obra_estimacion_id', p_estimacion_id, 'contrato', v_ctr.codigo,
      'etiqueta', v_est.etiqueta, 'neto', v_neto, 'estado_cxp', 'borrador'));

  RETURN v_factura_id;
END;
$function$;

-- Financiera + SECURITY DEFINER: nace cerrada a anon (no propagamos el gap
-- PUBLIC=EXECUTE de las hermanas, fichado en blindaje-financiero). Solo el
-- caller authenticated (botón "Enviar a CxP") la invoca directo; el puente
-- desde obra_estimacion_autorizar corre como definer.
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion_obra_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion_obra_espera(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Autorizar (D2) + puente a CxP en el mismo acto (espejo del destajo).
--    Versión viva 2026-06-26 + el bloque de puente al final.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dilesa', 'erp', 'core', 'public'
AS $function$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_est FROM dilesa.obra_estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está eliminada';
  END IF;
  IF v_est.estado = 'cancelada' OR v_est.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está cancelada';
  END IF;
  IF v_est.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo una estimación en borrador se puede autorizar (estado actual: %)', v_est.estado;
  END IF;
  IF COALESCE(v_est.monto_total, 0) = 0 THEN
    RAISE EXCEPTION 'La estimación no tiene monto — captúralo antes de autorizar';
  END IF;
  IF NOT erp.fn_es_direccion(v_est.empresa_id) THEN
    RAISE EXCEPTION 'Solo Dirección puede autorizar estimaciones de contrato';
  END IF;

  PERFORM set_config('app.obra_estimacion_gate', 'on', true);
  UPDATE dilesa.obra_estimaciones
    SET estado = 'autorizada',
        autorizada_por = auth.uid(),
        autorizada_at = now(),
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.obra_estimacion_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'obra_estimacion_autorizada', 'dilesa.obra_estimaciones', p_estimacion_id,
    jsonb_build_object('estado', v_est.estado),
    jsonb_build_object('estado', 'autorizada', 'contrato_id', v_est.contrato_id,
      'etiqueta', v_est.etiqueta, 'monto_total', v_est.monto_total));

  -- Puente a CxP (Sprint 1): la factura EN ESPERA del XML nace en el mismo acto
  -- de autorizar — espejo de estimacion_destajo_autorizar. Solo cuando hay neto
  -- positivo y el contrato NO opera en modo factura-total (en ese modo los
  -- avances se pagan contra la factura total, no por estimación). Las
  -- amortizaciones (monto negativo) no generan factura. Atómico: si el puente
  -- falla, la autorización se revierte con él.
  IF COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM erp.facturas f
       WHERE f.contrato_id = v_est.contrato_id
         AND f.obra_estimacion_id IS NULL
         AND f.cancelada_at IS NULL
         AND f.estado_cxp <> 'cancelada'
     )
  THEN
    PERFORM erp.cxp_factura_desde_estimacion_obra_espera(p_estimacion_id);
  END IF;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Recibir el CFDI: aceptar también origen "estimación de obra".
--    Versión viva 2026-06-26 + el guard de origen ampliado.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp.cxp_factura_recibir_cfdi(p_factura_id uuid, p_uuid_sat text, p_total numeric, p_subtotal numeric DEFAULT NULL::numeric, p_iva numeric DEFAULT NULL::numeric, p_fecha_emision date DEFAULT NULL::date, p_emisor_rfc text DEFAULT NULL::text, p_emisor_nombre text DEFAULT NULL::text, p_receptor_rfc text DEFAULT NULL::text, p_forma_pago_sat text DEFAULT NULL::text, p_metodo_pago_sat text DEFAULT NULL::text, p_uso_cfdi text DEFAULT NULL::text, p_tasa_iva numeric DEFAULT NULL::numeric, p_retencion_iva numeric DEFAULT 0, p_retencion_isr numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'dilesa', 'core', 'public'
AS $function$
DECLARE
  v_fac record;
  v_prov_rfc text;
  v_dup uuid;
BEGIN
  SELECT f.id, f.empresa_id, f.estimacion_id, f.obra_estimacion_id, f.proveedor_id, f.estado_cxp, f.cancelada_at
    INTO v_fac
  FROM erp.facturas f
  WHERE f.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', p_factura_id;
  END IF;
  -- Origen válido: destajo de vivienda (estimacion_id) o estimación de obra
  -- (obra_estimacion_id). Ambas nacen en espera del XML; las demás facturas se
  -- cargan por la vía normal.
  IF v_fac.estimacion_id IS NULL AND v_fac.obra_estimacion_id IS NULL THEN
    RAISE EXCEPTION 'Esta factura no proviene de un destajo ni de una estimación de obra (usa la carga normal de XML)';
  END IF;
  IF v_fac.cancelada_at IS NOT NULL OR v_fac.estado_cxp = 'cancelada' THEN
    RAISE EXCEPTION 'La factura está cancelada';
  END IF;
  IF v_fac.estado_cxp <> 'borrador' THEN
    RAISE EXCEPTION 'La factura ya recibió su XML (estado %). Para corregir, cancélala y re-emítela.', v_fac.estado_cxp;
  END IF;
  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El total del CFDI debe ser > 0';
  END IF;

  -- Dedup por folio fiscal contra cualquier otra factura.
  IF p_uuid_sat IS NOT NULL THEN
    SELECT id INTO v_dup FROM erp.facturas WHERE uuid_sat = p_uuid_sat AND id <> p_factura_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Ya existe una factura con folio fiscal % (id %)', p_uuid_sat, v_dup;
    END IF;
  END IF;

  -- Safety net: el emisor del CFDI debe ser el contratista de la factura.
  -- Solo bloquea ante un desajuste cierto (ambos RFC presentes y distintos).
  IF p_emisor_rfc IS NOT NULL AND v_fac.proveedor_id IS NOT NULL THEN
    SELECT upper(btrim(rfc)) INTO v_prov_rfc FROM erp.personas WHERE id = v_fac.proveedor_id;
    IF v_prov_rfc IS NOT NULL AND v_prov_rfc <> upper(btrim(p_emisor_rfc)) THEN
      RAISE EXCEPTION 'El RFC del emisor del CFDI (%) no es el del contratista de este destajo/estimación (%).', p_emisor_rfc, v_prov_rfc;
    END IF;
  END IF;

  -- El CFDI real gobierna la factura: total/subtotal/IVA del XML. El warning
  -- por diferencia vs el neto autorizado lo surfacea el endpoint (no bloquea).
  UPDATE erp.facturas
    SET uuid_sat = p_uuid_sat,
        emisor_rfc = COALESCE(p_emisor_rfc, emisor_rfc),
        emisor_nombre = COALESCE(p_emisor_nombre, emisor_nombre),
        receptor_rfc = COALESCE(p_receptor_rfc, receptor_rfc),
        subtotal = COALESCE(p_subtotal, subtotal),
        iva = COALESCE(p_iva, iva),
        total = p_total,
        fecha_emision = COALESCE(p_fecha_emision, fecha_emision),
        forma_pago_sat = COALESCE(p_forma_pago_sat, forma_pago_sat),
        metodo_pago_sat = CASE WHEN p_metodo_pago_sat IN ('PUE', 'PPD') THEN p_metodo_pago_sat ELSE metodo_pago_sat END,
        uso_cfdi = COALESCE(p_uso_cfdi, uso_cfdi),
        tasa_iva = COALESCE(p_tasa_iva, tasa_iva),
        retencion_iva = COALESCE(p_retencion_iva, retencion_iva),
        retencion_isr = COALESCE(p_retencion_isr, retencion_isr),
        estado_cxp = 'por_pagar',
        updated_at = now()
    WHERE id = p_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_fac.empresa_id, auth.uid(), 'cxp_factura_recibir_cfdi', 'erp.facturas', p_factura_id,
    jsonb_build_object('estimacion_id', v_fac.estimacion_id, 'obra_estimacion_id', v_fac.obra_estimacion_id,
      'uuid_sat', p_uuid_sat, 'total', p_total));

  RETURN p_factura_id;
END;
$function$;

-- Recarga el cache de PostgREST (firmas de RPC nuevas/cambiadas).
NOTIFY pgrst, 'reload schema';

COMMIT;
