-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260625212801_dilesa_estimaciones_destajo_cxp_s1                  │
-- │                                                                    │
-- │  Sprint 1 de `dilesa-estimaciones-cxp` (decisión D3 de             │
-- │  dilesa-contratos-estimaciones): los DESTAJOS semanales de         │
-- │  vivienda (dilesa.estimaciones) dejan de cerrar su ciclo dentro    │
-- │  de construcción y se enganchan a CxP — espejo del puente de obra. │
-- │                                                                    │
-- │  1. erp.facturas.estimacion_id — liga la factura de egreso al      │
-- │     destajo de origen (espejo de obra_estimacion_id) + índice      │
-- │     único parcial (1 factura activa por estimación, re-emitible    │
-- │     si se cancela).                                                │
-- │  2. Guard trigger en dilesa.estimaciones (flag                     │
-- │     app.estimacion_destajo_gate): el estado y los campos de        │
-- │     factura/pago solo se mueven vía RPC/sync, no por UPDATE crudo  │
-- │     desde el browser. La generación de borradores y la edición de  │
-- │     montos EN borrador siguen permitidas.                          │
-- │  3. erp.cxp_factura_desde_estimacion_destajo — nace la factura     │
-- │     EN ESPERA (estado_cxp='borrador', sin uuid_sat) por el monto   │
-- │     NETO (el contratista factura el neto, decisión D1 de Beto),    │
-- │     proveedor = contratista. La subida del XML la promueve a       │
-- │     por_pagar (Sprint 2).                                          │
-- │  4. dilesa.estimacion_destajo_autorizar — borrador → aprobada      │
-- │     (gate: miembro de la empresa O admin; el candado financiero    │
-- │     vive en cxp_pago_aprobar, decisión D3) + genera la factura en  │
-- │     espera + core.audit_log.                                       │
-- │  5. Backfill: las estimaciones HOY en 'aprobada' sin factura       │
-- │     activa generan su factura en espera (aparecen en CxP desde el  │
-- │     día uno). Robusto a Preview (sin datos → no-op).               │
-- │                                                                    │
-- │  Nota de transición: el guard bloquea las transiciones crudas que  │
-- │  hoy hace el detalle de estimación (aprobar/facturar/pagar). Por   │
-- │  eso esta migración se aplica JUNTO con la UI de S1/S3 (un solo    │
-- │  gate de salida), igual que dilesa-contratos-estimaciones.         │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. erp.facturas.estimacion_id (destajo → factura) ────────────────

ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS estimacion_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facturas_estimacion_id_fkey'
  ) THEN
    ALTER TABLE erp.facturas
      ADD CONSTRAINT facturas_estimacion_id_fkey
      FOREIGN KEY (estimacion_id) REFERENCES dilesa.estimaciones(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN erp.facturas.estimacion_id IS
  'Destajo semanal de vivienda (dilesa.estimaciones) que origina esta factura de egreso. Espejo de obra_estimacion_id (puente de obra). Nace en estado_cxp=borrador (en espera del XML); el upload del CFDI la promueve a por_pagar. Iniciativa dilesa-estimaciones-cxp.';

CREATE INDEX IF NOT EXISTS idx_facturas_estimacion_id
  ON erp.facturas (estimacion_id)
  WHERE estimacion_id IS NOT NULL;

-- 1 factura ACTIVA por estimación (anti-duplicado). Re-emitible si la
-- anterior se canceló.
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_estimacion_activa
  ON erp.facturas (estimacion_id)
  WHERE estimacion_id IS NOT NULL AND cancelada_at IS NULL;

-- ─── 2. Guard: el ciclo de la estimación solo se mueve vía RPC ────────
-- La RLS de dilesa.estimaciones permite escribir a cualquier miembro de la
-- empresa (la captura es browser-direct). Sin guard, el gobierno del
-- devengo y la sincronización con CxP serían bypasseables con un UPDATE
-- crudo. El flag `app.estimacion_destajo_gate` (set_config local a la
-- transacción) lo setean SOLO las RPCs y el trigger de sync (Sprint 2).
-- Permite: INSERT en borrador (generación), edición de montos/notas EN
-- borrador (fn_generar_estimacion_borrador), soft-delete.

CREATE OR REPLACE FUNCTION dilesa.fn_estimaciones_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador'
       AND COALESCE(current_setting('app.estimacion_destajo_gate', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Una estimación nace en borrador; la aprueba dilesa.estimacion_destajo_autorizar.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE bajo el gate (RPC autorizar / cancelar / sync de CxP): todo permitido.
  IF COALESCE(current_setting('app.estimacion_destajo_gate', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- UPDATE crudo (browser): el estado no se mueve a mano.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'El estado de la estimación solo cambia vía RPC: aprobar (genera la factura en CxP), cancelar, o la recepción/pago de su factura en Cuentas por Pagar.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Los datos de factura/pago son derivados de CxP (los escribe el sync),
  -- no se capturan a mano en construcción.
  IF NEW.factura_folio   IS DISTINCT FROM OLD.factura_folio
     OR NEW.factura_url   IS DISTINCT FROM OLD.factura_url
     OR NEW.factura_fecha IS DISTINCT FROM OLD.factura_fecha
     OR NEW.aprobada_por_user_id IS DISTINCT FROM OLD.aprobada_por_user_id
     OR NEW.aprobada_at   IS DISTINCT FROM OLD.aprobada_at
     OR NEW.pagada_por_user_id   IS DISTINCT FROM OLD.pagada_por_user_id
     OR NEW.pagada_at     IS DISTINCT FROM OLD.pagada_at
     OR NEW.referencia_pago      IS DISTINCT FROM OLD.referencia_pago THEN
    RAISE EXCEPTION 'Los datos de factura y pago se derivan de Cuentas por Pagar (sube el XML allí); no se capturan a mano en construcción.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Los montos (bruto/retención/neto) son inmutables una vez fuera de
  -- borrador (preservan integridad histórica del devengo aprobado).
  IF OLD.estado <> 'borrador'
     AND (NEW.monto_bruto     IS DISTINCT FROM OLD.monto_bruto
       OR NEW.retencion_pct   IS DISTINCT FROM OLD.retencion_pct
       OR NEW.retencion_monto IS DISTINCT FROM OLD.retencion_monto
       OR NEW.monto_neto      IS DISTINCT FROM OLD.monto_neto) THEN
    RAISE EXCEPTION 'Los montos de una estimación aprobada son inmutables (es el devengo). Cancélala y genera una nueva.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_estimaciones_guard ON dilesa.estimaciones;
CREATE TRIGGER tg_estimaciones_guard
  BEFORE INSERT OR UPDATE ON dilesa.estimaciones
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_estimaciones_guard();

-- ─── 3. RPC: factura en espera desde el destajo ───────────────────────
-- Espejo de erp.cxp_factura_desde_estimacion (obra), con dos diferencias:
-- (a) nace en 'borrador' (en espera del XML; la subida la promueve a
-- por_pagar en S2), y (b) el monto es el NETO (el contratista factura el
-- neto — decisión D1 de Beto; la retención 5% no es un pasivo de pago).

CREATE OR REPLACE FUNCTION erp.cxp_factura_desde_estimacion_destajo(
  p_estimacion_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, dilesa, core, public
AS $$
DECLARE
  v_est record;
  v_existing uuid;
  v_factura_id uuid;
BEGIN
  SELECT e.id, e.empresa_id, e.contratista_id, e.codigo, e.estado, e.monto_neto,
         e.fecha_cierre, e.fecha_pago_programado, e.deleted_at
    INTO v_est
  FROM dilesa.estimaciones e
  WHERE e.id = p_estimacion_id;
  IF NOT FOUND OR v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El destajo % no existe o está eliminado', p_estimacion_id;
  END IF;

  -- El devengo se aprueba antes de emitir a CxP (lo hace estimacion_destajo_autorizar).
  IF v_est.estado NOT IN ('aprobada', 'facturada', 'pagada') THEN
    RAISE EXCEPTION 'El destajo debe estar aprobado antes de emitirse a CxP (estado actual: %)', v_est.estado;
  END IF;

  IF v_est.monto_neto IS NULL OR v_est.monto_neto <= 0 THEN
    RAISE EXCEPTION 'Solo se emiten a CxP destajos con monto neto > 0';
  END IF;

  -- ¿Ya emitido (factura activa)?
  SELECT id INTO v_existing
  FROM erp.facturas
  WHERE estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'El destajo % ya tiene una factura de egreso (%)', p_estimacion_id, v_existing;
  END IF;

  -- Factura EN ESPERA: egreso, por el neto, sin CFDI todavía. El proveedor
  -- es el contratista (ya es erp.personas). Mismo set de columnas que
  -- erp.cxp_factura_alta (probado contra los NOT NULL de la tabla), pero
  -- estado_cxp='borrador' y con la liga estimacion_id. (erp.facturas no
  -- tiene columna notas — el origen se lee vía estimacion_id.)
  INSERT INTO erp.facturas (
    empresa_id, flujo, proveedor_id, persona_id, estimacion_id,
    subtotal, iva, total, tasa_iva,
    fecha_emision, fecha_pago_programada, estado_cxp
  ) VALUES (
    v_est.empresa_id, 'egreso', v_est.contratista_id, v_est.contratista_id, p_estimacion_id,
    v_est.monto_neto, 0, v_est.monto_neto, 0,
    v_est.fecha_cierre, v_est.fecha_pago_programado, 'borrador'
  ) RETURNING id INTO v_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'cxp_factura_desde_estimacion_destajo', 'erp.facturas', v_factura_id,
    jsonb_build_object('estimacion_id', p_estimacion_id, 'codigo', v_est.codigo,
      'monto_neto', v_est.monto_neto, 'estado_cxp', 'borrador'));

  RETURN v_factura_id;
END;
$$;

COMMENT ON FUNCTION erp.cxp_factura_desde_estimacion_destajo(uuid) IS
  'Genera la factura de egreso EN ESPERA (estado_cxp=borrador, sin uuid_sat) de un destajo aprobado, por el monto neto. La subida del XML la promueve a por_pagar (cxp_factura_recibir_cfdi, S2). Espejo de cxp_factura_desde_estimacion (obra). Iniciativa dilesa-estimaciones-cxp.';

GRANT EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion_destajo(uuid) TO authenticated;

-- ─── 4. RPC: aprobar el destajo (devengo + factura en espera) ─────────
-- borrador → aprobada. Gate: miembro de la empresa O admin (quien opera
-- construcción; el candado financiero está en cxp_pago_aprobar — D3 de
-- Beto). Genera la factura en espera en el mismo acto.

CREATE OR REPLACE FUNCTION dilesa.estimacion_destajo_autorizar(p_estimacion_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_est dilesa.estimaciones%ROWTYPE;
  v_factura_id uuid;
BEGIN
  SELECT * INTO v_est FROM dilesa.estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está eliminada';
  END IF;
  IF v_est.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo un destajo en borrador se puede aprobar (estado actual: %)', v_est.estado;
  END IF;
  IF COALESCE(v_est.monto_neto, 0) <= 0 THEN
    RAISE EXCEPTION 'El destajo no tiene monto neto — no hay nada que aprobar';
  END IF;
  -- Gate operativo: miembro de la empresa o admin global (nunca bloqueado).
  IF NOT (core.fn_has_empresa(v_est.empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa para aprobar el destajo';
  END IF;

  PERFORM set_config('app.estimacion_destajo_gate', 'on', true);
  UPDATE dilesa.estimaciones
    SET estado = 'aprobada',
        aprobada_por_user_id = auth.uid(),
        aprobada_at = now(),
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.estimacion_destajo_gate', '', true);

  -- Devengo al autorizar (D2 de Beto): la factura en espera aparece en CxP
  -- en el mismo acto.
  v_factura_id := erp.cxp_factura_desde_estimacion_destajo(p_estimacion_id);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'estimacion_destajo_autorizada', 'dilesa.estimaciones', p_estimacion_id,
    jsonb_build_object('estado', 'aprobada', 'codigo', v_est.codigo,
      'monto_neto', v_est.monto_neto, 'factura_id', v_factura_id));

  RETURN v_factura_id;
END;
$$;

COMMENT ON FUNCTION dilesa.estimacion_destajo_autorizar(uuid) IS
  'Aprueba un destajo semanal (borrador → aprobada) y genera su factura en espera en CxP por el neto. Gate: miembro de la empresa o admin (el candado financiero vive en cxp_pago_aprobar). Iniciativa dilesa-estimaciones-cxp, D2/D3.';

GRANT EXECUTE ON FUNCTION dilesa.estimacion_destajo_autorizar(uuid) TO authenticated;

-- ─── 4b. RPC: cancelar el destajo (libera tareas + factura en espera) ─
-- El guard bloquea el cancelar crudo del detalle. Esta RPC reemplaza ese
-- flujo: cancela la factura en espera ligada (si la hay y no tiene pagos),
-- libera las tareas (DELETE de estimacion_tareas) y marca cancelada. Solo
-- borrador/aprobada: facturada (XML recibido) o pagada se resuelven primero
-- en CxP.

CREATE OR REPLACE FUNCTION dilesa.estimacion_destajo_cancelar(
  p_estimacion_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_est dilesa.estimaciones%ROWTYPE;
  v_factura_id uuid;
BEGIN
  SELECT * INTO v_est FROM dilesa.estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL OR v_est.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La estimación ya está cancelada o eliminada';
  END IF;
  IF v_est.estado NOT IN ('borrador', 'aprobada') THEN
    RAISE EXCEPTION 'No se puede cancelar un destajo en estado % desde construcción. Si ya tiene XML o pago, resuélvelo primero en Cuentas por Pagar.', v_est.estado;
  END IF;
  IF NOT (core.fn_has_empresa(v_est.empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa para cancelar el destajo';
  END IF;

  -- Cancela la factura en espera ligada (cxp_factura_cancelar bloquea si
  -- tiene pagos activos — en ese caso hay que cancelar el pago primero).
  SELECT id INTO v_factura_id
  FROM erp.facturas
  WHERE estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    PERFORM erp.cxp_factura_cancelar(v_factura_id, COALESCE(p_motivo, 'Destajo cancelado'));
  END IF;

  -- Libera las tareas: sin esto siguen ligadas a la estimación cancelada y
  -- no reaparecen en v_tareas_pendientes_de_pago.
  DELETE FROM dilesa.estimacion_tareas WHERE estimacion_id = p_estimacion_id;

  PERFORM set_config('app.estimacion_destajo_gate', 'on', true);
  UPDATE dilesa.estimaciones
    SET estado = 'cancelada',
        notas = CASE WHEN COALESCE(btrim(p_motivo), '') = '' THEN notas
                     ELSE COALESCE(notas || E'\n', '') || 'Cancelada: ' || btrim(p_motivo) END,
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.estimacion_destajo_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'estimacion_destajo_cancelada', 'dilesa.estimaciones', p_estimacion_id,
    jsonb_build_object('estado', 'cancelada', 'codigo', v_est.codigo, 'motivo', p_motivo,
      'factura_cancelada', v_factura_id));
END;
$$;

COMMENT ON FUNCTION dilesa.estimacion_destajo_cancelar(uuid, text) IS
  'Cancela un destajo en borrador/aprobada: cancela su factura en espera en CxP (si no tiene pagos), libera las tareas y marca cancelada. Iniciativa dilesa-estimaciones-cxp.';

GRANT EXECUTE ON FUNCTION dilesa.estimacion_destajo_cancelar(uuid, text) TO authenticated;

-- ─── 5. Backfill: destajos 'aprobada' vivos → factura en espera ───────
-- Las estimaciones hoy aprobadas sin pagar aparecen en CxP desde el día
-- uno. Las 'facturada'/'pagada' se quedan como están (su ciclo manual ya
-- corrió). Robusto a Preview: sin datos → no-op.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT e.id
      FROM dilesa.estimaciones e
     WHERE e.estado = 'aprobada'
       AND e.deleted_at IS NULL
       AND COALESCE(e.monto_neto, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM erp.facturas f
          WHERE f.estimacion_id = e.id AND f.cancelada_at IS NULL
       )
  LOOP
    PERFORM erp.cxp_factura_desde_estimacion_destajo(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
