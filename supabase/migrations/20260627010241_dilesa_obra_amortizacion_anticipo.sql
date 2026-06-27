-- ╭─ 20260627010241_dilesa_obra_amortizacion_anticipo ─╮
-- Iniciativa dilesa-obra-estimaciones-cxp · Sprint 3.
-- Amortización LINEAL del anticipo (decisión D-a): al autorizar un avance de
-- obra, el sistema descuenta `anticipo_pct × monto` (topado al anticipo
-- pendiente) y la factura/pago nacen NETOS de amortización (decisión Beto
-- 2026-06-26: el contratista factura el avance neto del anticipo).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).
--
-- Modelo go-forward:
--   · El operador captura el avance BRUTO; el sistema calcula la amortización al
--     autorizar y la congela en `amortizacion_aplicada`.
--   · neto a CxP (factura en espera + pago) = monto − retención − amortización.
--   · El tope del S2 pasa a medir el DEVENGADO NETO (Σ monto − Σ amortización)
--     para que siga cuadrando ≈ valor_total ahora que la amortización es
--     columna (antes era estimación negativa).
--   · El anticipo (es_anticipo) NO amortiza (es la entrega). Solo avances > 0.
--   · No re-procesa lo histórico: `amortizacion_aplicada` nace en 0; las
--     amortizaciones manuales (negativas) de 2 contratos se respetan y se
--     cuentan como "ya amortizado" para que la automática no las duplique.

BEGIN;

-- Anticipo amortizado en este avance (congelado al autorizar).
ALTER TABLE dilesa.obra_estimaciones
  ADD COLUMN IF NOT EXISTS amortizacion_aplicada numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN dilesa.obra_estimaciones.amortizacion_aplicada IS
  'Anticipo amortizado en este avance (S3): anticipo_pct × monto, topado al anticipo pendiente, congelado al autorizar. El neto a CxP = monto − retención − amortizacion_aplicada.';

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Autorizar: calcula la amortización + tope sobre el devengado NETO.
--    Versión viva (S2) + el bloque de amortización (S3).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid, p_override_motivo text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dilesa', 'erp', 'core', 'public'
AS $function$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
  v_ctr record;
  v_devengado numeric;
  v_resultante numeric;
  v_override text := NULL;
  v_amortizacion numeric := 0;
  v_anticipo_entregado numeric;
  v_amortizado_previo numeric;
  v_pendiente numeric;
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

  -- Contrato (valor + anticipo_pct), una sola vez para tope + amortización.
  SELECT c.valor_total, c.anticipo_pct INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;

  -- Amortización lineal del anticipo (S3, D-a). Solo avances POSITIVOS que no
  -- sean el anticipo mismo, en contratos con anticipo_pct > 0 y anticipo
  -- entregado. Topada al anticipo pendiente (no sobre-amortiza) y al propio
  -- monto. Lo ya amortizado incluye la automática previa Y las negativas
  -- manuales históricas (para no duplicar en los 2 contratos que las usan).
  IF COALESCE(v_est.monto_total, 0) > 0 AND NOT v_est.es_anticipo
     AND COALESCE(v_ctr.anticipo_pct, 0) > 0 THEN
    SELECT COALESCE(SUM(e.monto_total) FILTER (
             WHERE e.es_anticipo AND e.monto_total > 0), 0)
      INTO v_anticipo_entregado
    FROM dilesa.obra_estimaciones e
    WHERE e.contrato_id = v_est.contrato_id AND e.deleted_at IS NULL
      AND e.estado IN ('autorizada', 'pagada');

    IF v_anticipo_entregado > 0 THEN
      SELECT COALESCE(SUM(e.amortizacion_aplicada), 0)
             + COALESCE(SUM(CASE WHEN e.monto_total < 0 THEN -e.monto_total ELSE 0 END), 0)
        INTO v_amortizado_previo
      FROM dilesa.obra_estimaciones e
      WHERE e.contrato_id = v_est.contrato_id AND e.id <> p_estimacion_id
        AND e.deleted_at IS NULL AND e.estado IN ('autorizada', 'pagada');

      v_pendiente := GREATEST(0, v_anticipo_entregado - v_amortizado_previo);
      v_amortizacion := LEAST(
        round(v_est.monto_total * v_ctr.anticipo_pct / 100.0, 2),
        v_pendiente,
        v_est.monto_total
      );
      IF v_amortizacion < 0 THEN v_amortizacion := 0; END IF;
    END IF;
  END IF;

  -- Tope duro vs el valor del contrato (D-b), medido sobre el DEVENGADO NETO
  -- (Σ monto − Σ amortización). Solo las estimaciones positivas pueden exceder;
  -- contratos con valor_total <= 0 se eximen.
  IF COALESCE(v_est.monto_total, 0) > 0 AND COALESCE(v_ctr.valor_total, 0) > 0 THEN
    SELECT COALESCE(SUM(e.monto_total - e.amortizacion_aplicada), 0) INTO v_devengado
    FROM dilesa.obra_estimaciones e
    WHERE e.contrato_id = v_est.contrato_id
      AND e.id <> p_estimacion_id
      AND e.deleted_at IS NULL
      AND e.estado IN ('autorizada', 'pagada');

    v_resultante := v_devengado + (v_est.monto_total - v_amortizacion);
    IF v_resultante > v_ctr.valor_total + 1 THEN
      IF p_override_motivo IS NULL OR btrim(p_override_motivo) = '' THEN
        RAISE EXCEPTION 'Autorizar esta estimación lleva el devengado a $% , que excede el valor del contrato ($%). Es obra extra: requiere override de Dirección con motivo.',
          to_char(v_resultante, 'FM999,999,999.00'), to_char(v_ctr.valor_total, 'FM999,999,999.00');
      END IF;
      v_override := btrim(p_override_motivo);
    END IF;
  END IF;

  PERFORM set_config('app.obra_estimacion_gate', 'on', true);
  UPDATE dilesa.obra_estimaciones
    SET estado = 'autorizada',
        autorizada_por = auth.uid(),
        autorizada_at = now(),
        tope_override_motivo = v_override,
        amortizacion_aplicada = v_amortizacion,
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.obra_estimacion_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'obra_estimacion_autorizada', 'dilesa.obra_estimaciones', p_estimacion_id,
    jsonb_build_object('estado', v_est.estado),
    jsonb_build_object('estado', 'autorizada', 'contrato_id', v_est.contrato_id,
      'etiqueta', v_est.etiqueta, 'monto_total', v_est.monto_total,
      'tope_override_motivo', v_override,
      'amortizacion_aplicada', v_amortizacion,
      'devengado_resultante', v_resultante, 'valor_total', v_ctr.valor_total));

  -- Puente a CxP (S1): factura EN ESPERA por el neto (− amortización, S3) en el
  -- mismo acto. Solo con neto positivo y si el contrato no opera factura-total.
  IF COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0) - v_amortizacion > 0
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
-- 2. Factura EN ESPERA: el neto resta la amortización (S3). Versión viva + delta.
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
  SELECT e.id, e.empresa_id, e.contrato_id, e.etiqueta, e.fecha, e.factura_ref,
         e.monto_total, e.retencion, e.amortizacion_aplicada, e.estado, e.deleted_at
    INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = p_estimacion_id;
  IF NOT FOUND OR v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación % no existe o está eliminada', p_estimacion_id;
  END IF;

  IF v_est.estado NOT IN ('autorizada', 'pagada') THEN
    RAISE EXCEPTION 'La estimación debe estar autorizada por Dirección antes de emitirse a CxP (estado actual: %)', v_est.estado;
  END IF;

  -- Neto a CxP = monto − retención − amortización del anticipo (S3).
  v_neto := COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0) - COALESCE(v_est.amortizacion_aplicada, 0);
  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'Solo se emiten a CxP estimaciones con neto > 0 (las amortizaciones/negativas no generan factura)';
  END IF;

  SELECT id INTO v_existing
  FROM erp.facturas
  WHERE obra_estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'La estimación % ya tiene una factura de egreso (%)', p_estimacion_id, v_existing;
  END IF;

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

  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.contrato_id = v_ctr.id
      AND f.obra_estimacion_id IS NULL
      AND f.cancelada_at IS NULL
      AND f.estado_cxp <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'El contrato % ya tiene una factura total activa: programa el pago de la estimación aplicándolo a esa factura (no se emite factura nueva).', v_ctr.codigo;
  END IF;

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
      'etiqueta', v_est.etiqueta, 'neto', v_neto,
      'amortizacion_aplicada', v_est.amortizacion_aplicada, 'estado_cxp', 'borrador'));

  RETURN v_factura_id;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Pago de la estimación: el neto resta la amortización (S3). Versión viva + delta.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp.cxp_pago_desde_estimacion(p_estimacion_id uuid, p_fecha_programada date DEFAULT NULL::date, p_metodo_pago text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_referencia text DEFAULT NULL::text)
 RETURNS uuid
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
         e.monto_total, e.retencion, e.amortizacion_aplicada
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

  -- Neto a pagar = monto − retención − amortización del anticipo (S3). La
  -- retención se queda como saldo (fondo de garantía, se libera al finiquito).
  v_neto := COALESCE(v_est.monto_total, 0) - COALESCE(v_est.retencion, 0) - COALESCE(v_est.amortizacion_aplicada, 0);
  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'La estimación no tiene neto a pagar (monto % − retención % − amortización % = %). Las amortizaciones/negativas no generan pago.',
      v_est.monto_total, v_est.retencion, v_est.amortizacion_aplicada, v_neto;
  END IF;

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

  SELECT f.id, f.saldo, f.obra_estimacion_id INTO v_factura
  FROM erp.facturas f
  WHERE f.cancelada_at IS NULL
    AND f.estado_cxp <> 'cancelada'
    AND (
      f.obra_estimacion_id = p_estimacion_id
      OR (f.contrato_id = v_ctr.id AND f.obra_estimacion_id IS NULL)
    )
  ORDER BY (f.obra_estimacion_id = p_estimacion_id) DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La estimación no tiene factura: emítela a CxP (factura por estimación) o captura la factura total del contrato.';
  END IF;
  IF COALESCE(v_factura.saldo, 0) < v_neto THEN
    RAISE EXCEPTION 'El saldo de la factura ($ %) no alcanza para el neto de la estimación ($ %).',
      v_factura.saldo, v_neto;
  END IF;

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
      || CASE WHEN COALESCE(v_est.amortizacion_aplicada, 0) > 0
           THEN ' · amortiza anticipo ' || v_est.amortizacion_aplicada
           ELSE '' END
      || CASE WHEN v_factura.obra_estimacion_id IS NULL
           THEN ' · aplicado a la factura total del contrato'
           ELSE '' END
  );

  UPDATE erp.cxp_pagos
    SET obra_estimacion_id = p_estimacion_id
    WHERE id = v_pago_id;

  RETURN v_pago_id;
END;
$function$;

-- Recarga el cache de PostgREST (columna nueva + firmas tocadas).
NOTIFY pgrst, 'reload schema';

COMMIT;
