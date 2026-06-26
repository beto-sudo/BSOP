-- ╭─ 20260626232311_dilesa_obra_estimacion_tope_contrato ─╮
-- Iniciativa dilesa-obra-estimaciones-cxp · Sprint 2.
-- Tope DURO vs el valor del contrato: bloquea AL AUTORIZAR (decisión D-b) una
-- estimación cuyo devengado resultante exceda `valor_total`, salvo override
-- explícito de Dirección con motivo (obra extra) — persistido + auditado.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).
--
-- Modelo (verificado en prod 2026-06-26): el devengado neto = Σ monto_total de
-- estimaciones autorizadas+pagadas (incluye el anticipo, resta amortizaciones
-- negativas) ≈ valor_total — igual que `lib/dilesa/contratos-estado-cuenta`.
-- Por eso el tope se mide sobre ese devengado, no sobre los avances solos.
--   · Solo bloquea estimaciones POSITIVAS (las negativas reducen el devengo).
--   · Eximimos contratos con valor_total <= 0 (sin valor capturado — 1 hoy).
--   · Go-forward: no re-autoriza las 275 históricas (8 ya exceden, se quedan).

BEGIN;

-- Marca de override en la fila (NULL = autorización normal dentro del tope).
-- Hace visible/auditable inline que la estimación se autorizó como obra extra.
ALTER TABLE dilesa.obra_estimaciones
  ADD COLUMN IF NOT EXISTS tope_override_motivo text;

COMMENT ON COLUMN dilesa.obra_estimaciones.tope_override_motivo IS
  'Motivo del override del tope vs contrato (obra extra) al autorizar. NULL = dentro del valor del contrato.';

-- La firma cambia (uuid) → (uuid, text), así que se reemplaza con DROP+CREATE.
-- La RPC solo la invoca el front; sin dependencias de DB (triggers/vistas).
DROP FUNCTION IF EXISTS dilesa.obra_estimacion_autorizar(uuid);

CREATE FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid, p_override_motivo text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dilesa', 'erp', 'core', 'public'
AS $function$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
  v_valor_total numeric;
  v_devengado numeric;
  v_resultante numeric;
  v_override text := NULL;
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

  -- Tope duro vs el valor del contrato (D-b). Solo las estimaciones positivas
  -- pueden exceder; las amortizaciones (negativas) reducen el devengo. Los
  -- contratos sin valor capturado (valor_total <= 0) se eximen.
  IF COALESCE(v_est.monto_total, 0) > 0 THEN
    SELECT c.valor_total INTO v_valor_total
    FROM dilesa.contratos_construccion c
    WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;

    IF COALESCE(v_valor_total, 0) > 0 THEN
      -- Devengado ya autorizado/pagado del contrato (neto: incluye anticipo,
      -- resta amortizaciones), sin esta estimación. Espejo de deriveEstadoCuenta.
      SELECT COALESCE(SUM(e.monto_total), 0) INTO v_devengado
      FROM dilesa.obra_estimaciones e
      WHERE e.contrato_id = v_est.contrato_id
        AND e.id <> p_estimacion_id
        AND e.deleted_at IS NULL
        AND e.estado IN ('autorizada', 'pagada');

      v_resultante := v_devengado + v_est.monto_total;
      -- Epsilon de 1 peso para tolerar redondeo de centavos acumulado.
      IF v_resultante > v_valor_total + 1 THEN
        IF p_override_motivo IS NULL OR btrim(p_override_motivo) = '' THEN
          RAISE EXCEPTION 'Autorizar esta estimación lleva el devengado a $% , que excede el valor del contrato ($%). Es obra extra: requiere override de Dirección con motivo.',
            to_char(v_resultante, 'FM999,999,999.00'), to_char(v_valor_total, 'FM999,999,999.00');
        END IF;
        v_override := btrim(p_override_motivo);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.obra_estimacion_gate', 'on', true);
  UPDATE dilesa.obra_estimaciones
    SET estado = 'autorizada',
        autorizada_por = auth.uid(),
        autorizada_at = now(),
        tope_override_motivo = v_override,
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.obra_estimacion_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'obra_estimacion_autorizada', 'dilesa.obra_estimaciones', p_estimacion_id,
    jsonb_build_object('estado', v_est.estado),
    jsonb_build_object('estado', 'autorizada', 'contrato_id', v_est.contrato_id,
      'etiqueta', v_est.etiqueta, 'monto_total', v_est.monto_total,
      'tope_override_motivo', v_override,
      'devengado_resultante', v_resultante, 'valor_total', v_valor_total));

  -- Puente a CxP (Sprint 1): factura EN ESPERA en el mismo acto. Solo con neto
  -- positivo y si el contrato no opera factura-total. Atómico.
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

-- Replica los grants de la versión previa (authenticated + service_role, sin PUBLIC).
REVOKE EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(uuid, text) TO service_role;

-- Recarga el cache de PostgREST (columna nueva + firma de RPC cambiada).
NOTIFY pgrst, 'reload schema';

COMMIT;
