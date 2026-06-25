-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260625213616_dilesa_estimaciones_destajo_cxp_s2_recepcion        │
-- │                                                                    │
-- │  Sprint 2 de `dilesa-estimaciones-cxp`: la RECEPCIÓN del XML en     │
-- │  CxP promueve la factura en espera y sincroniza el estado del      │
-- │  destajo (factura → estimación), sin captura manual en construcción.│
-- │                                                                    │
-- │  1. erp.cxp_factura_recibir_cfdi — asocia el CFDI a la factura en   │
-- │     espera de un destajo: valida estado borrador + RFC del emisor  │
-- │     vs el contratista + dedup uuid_sat, escribe los montos         │
-- │     fiscales del XML y la promueve a por_pagar. (El endpoint        │
-- │     upload-xml la llama cuando recibe un factura_id destino.)       │
-- │  2. erp.fn_cxp_factura_sync_estimacion + trigger — el ciclo del     │
-- │     destajo se DERIVA de su factura de CxP:                        │
-- │       · uuid_sat puesto + por_pagar/parcial → estimación facturada │
-- │       · estado_cxp = pagada → estimación pagada (+ ref/fecha del   │
-- │         pago ejecutado para el display de construcción)            │
-- │       · estado_cxp = cancelada → estimación de vuelta a aprobada   │
-- │         (re-emitible; limpia los datos de factura/pago)            │
-- │     Bajo el flag app.estimacion_destajo_gate (no lo bloquea el     │
-- │     guard de S1). SECURITY DEFINER: cruza a dilesa sin depender de  │
-- │     la RLS del usuario que mueve el pago.                          │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. RPC: recibir el CFDI sobre la factura en espera ───────────────

CREATE OR REPLACE FUNCTION erp.cxp_factura_recibir_cfdi(
  p_factura_id uuid,
  p_uuid_sat text,
  p_total numeric,
  p_subtotal numeric DEFAULT NULL,
  p_iva numeric DEFAULT NULL,
  p_fecha_emision date DEFAULT NULL,
  p_emisor_rfc text DEFAULT NULL,
  p_emisor_nombre text DEFAULT NULL,
  p_receptor_rfc text DEFAULT NULL,
  p_forma_pago_sat text DEFAULT NULL,
  p_metodo_pago_sat text DEFAULT NULL,
  p_uso_cfdi text DEFAULT NULL,
  p_tasa_iva numeric DEFAULT NULL,
  p_retencion_iva numeric DEFAULT 0,
  p_retencion_isr numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, dilesa, core, public
AS $$
DECLARE
  v_fac record;
  v_prov_rfc text;
  v_dup uuid;
BEGIN
  SELECT f.id, f.empresa_id, f.estimacion_id, f.proveedor_id, f.estado_cxp, f.cancelada_at
    INTO v_fac
  FROM erp.facturas f
  WHERE f.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', p_factura_id;
  END IF;
  IF v_fac.estimacion_id IS NULL THEN
    RAISE EXCEPTION 'Esta factura no proviene de un destajo (usa la carga normal de XML)';
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
      RAISE EXCEPTION 'El RFC del emisor del CFDI (%) no es el del contratista de este destajo (%).', p_emisor_rfc, v_prov_rfc;
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
    jsonb_build_object('estimacion_id', v_fac.estimacion_id, 'uuid_sat', p_uuid_sat, 'total', p_total));

  RETURN p_factura_id;
END;
$$;

COMMENT ON FUNCTION erp.cxp_factura_recibir_cfdi IS
  'Asocia un CFDI a la factura EN ESPERA de un destajo (estado_cxp=borrador): valida estado + RFC del emisor vs contratista + dedup uuid_sat, escribe los montos fiscales y la promueve a por_pagar. El trigger de sync pasa la estimación a facturada. Iniciativa dilesa-estimaciones-cxp, S2.';

GRANT EXECUTE ON FUNCTION erp.cxp_factura_recibir_cfdi(uuid, text, numeric, numeric, numeric, date, text, text, text, text, text, text, numeric, numeric, numeric) TO authenticated;

-- ─── 2. Sync: el ciclo del destajo se deriva de su factura de CxP ─────

CREATE OR REPLACE FUNCTION erp.fn_cxp_factura_sync_estimacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, dilesa, public
AS $$
DECLARE
  v_ref text;
  v_pagado_at timestamptz;
BEGIN
  IF NEW.estimacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Factura cancelada → la estimación vuelve a 'aprobada' (re-emitible) y se
  -- limpian los datos de factura/pago. El índice único activo libera el slot.
  IF NEW.estado_cxp = 'cancelada' THEN
    PERFORM set_config('app.estimacion_destajo_gate', 'on', true);
    UPDATE dilesa.estimaciones
      SET estado = 'aprobada',
          factura_folio = NULL, factura_url = NULL, factura_fecha = NULL,
          pagada_at = NULL, pagada_por_user_id = NULL, referencia_pago = NULL,
          updated_at = now()
      WHERE id = NEW.estimacion_id AND estado IN ('aprobada', 'facturada', 'pagada');
    PERFORM set_config('app.estimacion_destajo_gate', '', true);
    RETURN NULL;
  END IF;

  -- Pago ejecutado → estimación pagada (+ ref/fecha del pago para el display).
  IF NEW.estado_cxp = 'pagada' THEN
    SELECT p.referencia, p.pagado_at INTO v_ref, v_pagado_at
      FROM erp.cxp_pago_aplicaciones a
      JOIN erp.cxp_pagos p ON p.id = a.pago_id
     WHERE a.factura_id = NEW.id AND p.estado = 'pagado' AND p.deleted_at IS NULL
     ORDER BY p.pagado_at DESC NULLS LAST
     LIMIT 1;
    PERFORM set_config('app.estimacion_destajo_gate', 'on', true);
    UPDATE dilesa.estimaciones
      SET estado = 'pagada',
          pagada_at = COALESCE(v_pagado_at, now()),
          referencia_pago = v_ref,
          factura_folio = COALESCE(NEW.uuid_sat, factura_folio),
          factura_fecha = COALESCE(NEW.fecha_emision, factura_fecha),
          factura_url = COALESCE(NEW.xml_url, factura_url),
          updated_at = now()
      WHERE id = NEW.estimacion_id AND estado IN ('aprobada', 'facturada', 'pagada');
    PERFORM set_config('app.estimacion_destajo_gate', '', true);
    RETURN NULL;
  END IF;

  -- XML recibido (uuid_sat presente) y por pagar/parcial → facturada. Cubre
  -- también la reversa pagada→por_pagar (se canceló el pago) = vuelve a facturada.
  IF NEW.uuid_sat IS NOT NULL AND NEW.estado_cxp IN ('por_pagar', 'parcial') THEN
    PERFORM set_config('app.estimacion_destajo_gate', 'on', true);
    UPDATE dilesa.estimaciones
      SET estado = 'facturada',
          factura_folio = NEW.uuid_sat,
          factura_fecha = COALESCE(NEW.fecha_emision, factura_fecha),
          factura_url = COALESCE(NEW.xml_url, factura_url),
          pagada_at = NULL, pagada_por_user_id = NULL, referencia_pago = NULL,
          updated_at = now()
      WHERE id = NEW.estimacion_id AND estado IN ('aprobada', 'facturada', 'pagada');
    PERFORM set_config('app.estimacion_destajo_gate', '', true);
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION erp.fn_cxp_factura_sync_estimacion() IS
  'Sincroniza el estado del destajo (dilesa.estimaciones) desde su factura de CxP: facturada (XML recibido), pagada (pago ejecutado), o de vuelta a aprobada (factura cancelada). Bajo app.estimacion_destajo_gate. Iniciativa dilesa-estimaciones-cxp, S2.';

DROP TRIGGER IF EXISTS trg_cxp_factura_sync_estimacion ON erp.facturas;
CREATE TRIGGER trg_cxp_factura_sync_estimacion
  AFTER UPDATE OF estado_cxp, uuid_sat, cancelada_at, xml_url ON erp.facturas
  FOR EACH ROW
  WHEN (NEW.estimacion_id IS NOT NULL)
  EXECUTE FUNCTION erp.fn_cxp_factura_sync_estimacion();

NOTIFY pgrst, 'reload schema';

COMMIT;
