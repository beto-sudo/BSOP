-- ╭─ 20260612161552_erp_cxp_factura_alta_p_usuario_id ─╮
-- erp.cxp_factura_alta: parámetro opcional p_usuario_id para el audit trail.
--
-- El endpoint de ingesta XML (app/api/[empresa]/cxp/facturas/upload-xml)
-- invoca este RPC vía service role, por lo que auth.uid() es NULL y las filas
-- de core.audit_log quedaban sin usuario_id — un lote subido por un operador
-- era inatribuible (caso Norberto/Contabilidad DILESA, 2026-06-11). El
-- endpoint ahora pasa el user.id autenticado explícitamente.
--
-- DROP + CREATE (no CREATE OR REPLACE): agregar un parámetro cambia la firma
-- y OR REPLACE dejaría un overload — ambiguo para PostgREST (PGRST203) y para
-- las llamadas SQL internas. p_usuario_id va al final con DEFAULT NULL, así
-- que los callers existentes (cxp_factura_desde_estimacion y las RPCs de
-- estimaciones DILESA) no requieren cambios.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

DROP FUNCTION IF EXISTS erp.cxp_factura_alta(
  uuid, uuid, numeric, numeric, numeric, date, integer, uuid, text, text,
  text, text, text, text, text, numeric, numeric, numeric, text, text, text
);

CREATE FUNCTION erp.cxp_factura_alta(
  p_empresa_id uuid,
  p_proveedor_id uuid,
  p_total numeric,
  p_subtotal numeric DEFAULT NULL,
  p_iva numeric DEFAULT NULL,
  p_fecha_emision date DEFAULT CURRENT_DATE,
  p_condiciones_pago_dias integer DEFAULT NULL,
  p_orden_compra_id uuid DEFAULT NULL,
  p_uuid_sat text DEFAULT NULL,
  p_emisor_rfc text DEFAULT NULL,
  p_emisor_nombre text DEFAULT NULL,
  p_receptor_rfc text DEFAULT NULL,
  p_forma_pago_sat text DEFAULT NULL,
  p_metodo_pago_sat text DEFAULT NULL,
  p_uso_cfdi text DEFAULT NULL,
  p_tasa_iva numeric DEFAULT NULL,
  p_retencion_iva numeric DEFAULT 0,
  p_retencion_isr numeric DEFAULT 0,
  p_xml_url text DEFAULT NULL,
  p_pdf_url text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_factura_id uuid;
  v_oc record;
  v_venc date;
BEGIN
  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El total de la factura debe ser > 0';
  END IF;

  -- Dedup por folio fiscal.
  IF p_uuid_sat IS NOT NULL THEN
    SELECT id INTO v_factura_id FROM erp.facturas WHERE uuid_sat = p_uuid_sat;
    IF FOUND THEN
      RAISE EXCEPTION 'Ya existe una factura con uuid_sat % (id %)', p_uuid_sat, v_factura_id;
    END IF;
  END IF;

  -- Validación de OC (si se liga): misma empresa y mismo proveedor.
  IF p_orden_compra_id IS NOT NULL THEN
    SELECT empresa_id, proveedor_id, total_a_pagar INTO v_oc
      FROM erp.ordenes_compra WHERE id = p_orden_compra_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La orden de compra % no existe', p_orden_compra_id;
    END IF;
    IF v_oc.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'La OC pertenece a otra empresa';
    END IF;
    IF p_proveedor_id IS NOT NULL AND v_oc.proveedor_id IS DISTINCT FROM p_proveedor_id THEN
      RAISE EXCEPTION 'El proveedor de la factura no coincide con el de la OC';
    END IF;
  END IF;

  v_venc := CASE
    WHEN p_condiciones_pago_dias IS NOT NULL
      THEN p_fecha_emision + (p_condiciones_pago_dias || ' days')::interval
    ELSE NULL
  END;

  INSERT INTO erp.facturas (
    empresa_id, flujo, proveedor_id, persona_id, orden_compra_id,
    uuid_sat, emisor_rfc, emisor_nombre, receptor_rfc,
    subtotal, iva, total, fecha_emision, fecha_vencimiento,
    condiciones_pago_dias, fecha_pago_programada,
    forma_pago_sat, metodo_pago_sat, uso_cfdi, tasa_iva,
    retencion_iva, retencion_isr, xml_url, pdf_url, estado_cxp
  ) VALUES (
    p_empresa_id, 'egreso', p_proveedor_id, p_proveedor_id, p_orden_compra_id,
    p_uuid_sat, p_emisor_rfc, p_emisor_nombre, p_receptor_rfc,
    p_subtotal, p_iva, p_total, p_fecha_emision, v_venc,
    p_condiciones_pago_dias, v_venc,
    p_forma_pago_sat, p_metodo_pago_sat, p_uso_cfdi, p_tasa_iva,
    COALESCE(p_retencion_iva, 0), COALESCE(p_retencion_isr, 0), p_xml_url, p_pdf_url, 'por_pagar'
  ) RETURNING id INTO v_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, COALESCE(p_usuario_id, auth.uid()), 'cxp_factura_alta', 'erp.facturas', v_factura_id,
    jsonb_build_object('total', p_total, 'proveedor_id', p_proveedor_id,
      'orden_compra_id', p_orden_compra_id, 'uuid_sat', p_uuid_sat));

  RETURN v_factura_id;
END;
$$;

COMMENT ON FUNCTION erp.cxp_factura_alta IS
  'Alta de factura de egreso (CxP). p_usuario_id atribuye el audit_log cuando se invoca vía service role (auth.uid() NULL); con sesión directa puede omitirse.';

NOTIFY pgrst, 'reload schema';

COMMIT;
