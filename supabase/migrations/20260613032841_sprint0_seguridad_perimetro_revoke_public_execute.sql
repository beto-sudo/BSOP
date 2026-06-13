-- ╭─ 20260613032841_sprint0_seguridad_perimetro_revoke_public_execute ─╮
-- Sprint 0 — C1 (corrección). Completa el cierre del hueco crítico.
--
-- La migración previa 20260613023440 revocó EXECUTE de `anon` en las 30 RPCs
-- mutadoras, pero NO tuvo efecto: en Postgres las funciones llevan EXECUTE para
-- PUBLIC por default (proacl `{=X/...}`), así que anon conservaba el acceso por
-- PUBLIC. Verificado en prod tras aplicar: anon seguía pudiendo ejecutarlas.
--
-- Fix correcto: REVOKE EXECUTE ... FROM PUBLIC (corta el acceso heredado por
-- TODOS, incluido anon) + GRANT EXECUTE ... TO authenticated, service_role
-- (preserva la app logueada y el admin client). Resultado por función:
-- proacl = {owner, authenticated, service_role} — anon queda fuera.
--
-- Solo `anon` pierde acceso efectivo (authenticator no ejecuta funciones
-- directo; owner postgres mantiene para crons/triggers). No toca cuerpos.

BEGIN;

REVOKE EXECUTE ON FUNCTION dilesa.contrato_obra_cancelar(p_contrato_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.contrato_obra_cancelar(p_contrato_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION dilesa.fn_estimaciones_backfill_incremental() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_estimaciones_backfill_incremental() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION dilesa.fn_generar_plan_pagos(p_venta_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_generar_plan_pagos(p_venta_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION dilesa.fn_programar_encuesta_posventa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_programar_encuesta_posventa() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION dilesa.obra_estimacion_cancelar(p_estimacion_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_cancelar(p_estimacion_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxc_cargo_ajustar(p_cargo_id uuid, p_nuevo_monto numeric, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxc_cargo_ajustar(p_cargo_id uuid, p_nuevo_monto numeric, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_aplicar(p_pago_id uuid, p_aplicaciones jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxc_pago_aplicar(p_pago_id uuid, p_aplicaciones jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_cancelar(p_pago_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxc_pago_cancelar(p_pago_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_registrar(p_empresa_id uuid, p_persona_id uuid, p_origen_id uuid, p_monto numeric, p_fecha date, p_fuente text, p_forma_pago text, p_referencia text, p_cuenta_bancaria_id uuid, p_uuid_sat text, p_comprobante_adjunto_id uuid, p_notas text, p_auto_aplicar boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxc_pago_registrar(p_empresa_id uuid, p_persona_id uuid, p_origen_id uuid, p_monto numeric, p_fecha date, p_fuente text, p_forma_pago text, p_referencia text, p_cuenta_bancaria_id uuid, p_uuid_sat text, p_comprobante_adjunto_id uuid, p_notas text, p_auto_aplicar boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_alta(p_empresa_id uuid, p_proveedor_id uuid, p_total numeric, p_subtotal numeric, p_iva numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_orden_compra_id uuid, p_uuid_sat text, p_emisor_rfc text, p_emisor_nombre text, p_receptor_rfc text, p_forma_pago_sat text, p_metodo_pago_sat text, p_uso_cfdi text, p_tasa_iva numeric, p_retencion_iva numeric, p_retencion_isr numeric, p_xml_url text, p_pdf_url text, p_notas text, p_usuario_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_factura_alta(p_empresa_id uuid, p_proveedor_id uuid, p_total numeric, p_subtotal numeric, p_iva numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_orden_compra_id uuid, p_uuid_sat text, p_emisor_rfc text, p_emisor_nombre text, p_receptor_rfc text, p_forma_pago_sat text, p_metodo_pago_sat text, p_uso_cfdi text, p_tasa_iva numeric, p_retencion_iva numeric, p_retencion_isr numeric, p_xml_url text, p_pdf_url text, p_notas text, p_usuario_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_cancelar(p_factura_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_factura_cancelar(p_factura_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion(p_estimacion_id uuid, p_condiciones_pago_dias integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion(p_estimacion_id uuid, p_condiciones_pago_dias integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_total_contrato(p_contrato_id uuid, p_total numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_factura_ref text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_factura_total_contrato(p_contrato_id uuid, p_total numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_factura_ref text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_cancelar(p_pago_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_cancelar(p_pago_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_desde_estimacion(p_estimacion_id uuid, p_fecha_programada date, p_metodo_pago text, p_cuenta_bancaria_id uuid, p_referencia text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_desde_estimacion(p_estimacion_id uuid, p_fecha_programada date, p_metodo_pago text, p_cuenta_bancaria_id uuid, p_referencia text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_marcar_pagado(p_pago_id uuid, p_fecha_pago date, p_referencia text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_marcar_pagado(p_pago_id uuid, p_fecha_pago date, p_referencia text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_programar(p_empresa_id uuid, p_proveedor_id uuid, p_aplicaciones jsonb, p_metodo_pago text, p_fecha_programada date, p_cuenta_bancaria_id uuid, p_referencia text, p_notas text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_programar(p_empresa_id uuid, p_proveedor_id uuid, p_aplicaciones jsonb, p_metodo_pago text, p_fecha_programada date, p_cuenta_bancaria_id uuid, p_referencia text, p_notas text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_aplicar_levantamiento(p_levantamiento_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_aplicar_levantamiento(p_levantamiento_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_cancelar_levantamiento(p_levantamiento_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_cancelar_levantamiento(p_levantamiento_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_cerrar_captura_levantamiento(p_levantamiento_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_cerrar_captura_levantamiento(p_levantamiento_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_firmar_levantamiento(p_levantamiento_id uuid, p_paso integer, p_rol text, p_comentario text, p_ip inet, p_user_agent text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_firmar_levantamiento(p_levantamiento_id uuid, p_paso integer, p_rol text, p_comentario text, p_ip inet, p_user_agent text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_iniciar_captura_levantamiento(p_levantamiento_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_iniciar_captura_levantamiento(p_levantamiento_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_presupuesto_baseline_autorizar(p_proyecto_id uuid, p_notas text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_presupuesto_baseline_autorizar(p_proyecto_id uuid, p_notas text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.fn_presupuesto_cambio_resolver(p_cambio_id uuid, p_decision text, p_motivo_rechazo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_presupuesto_cambio_resolver(p_cambio_id uuid, p_decision text, p_motivo_rechazo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.oc_cancelar_pendiente_linea(p_detalle_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.oc_cancelar_pendiente_linea(p_detalle_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.oc_cerrar_orden(p_orden_id uuid, p_motivo text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.oc_cerrar_orden(p_orden_id uuid, p_motivo text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.oc_recibir_linea(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.oc_recibir_linea(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION erp.oc_recibir_linea_partida(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.oc_recibir_linea_partida(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) TO authenticated, service_role;

-- Recarga el cache de PostgREST (cambiaron grants de funciones):
NOTIFY pgrst, 'reload schema';

COMMIT;
