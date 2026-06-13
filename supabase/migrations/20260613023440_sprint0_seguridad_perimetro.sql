-- ╭─ 20260613023440_sprint0_seguridad_perimetro ─╮
-- Sprint 0 — Hardening de perímetro de seguridad.
-- Revisión general BSOP 2026-06-12 (3 hallazgos verificados contra prod).
--
-- NO toca el cuerpo de ninguna función (evita la clase del incidente FIFO).
-- Reproducible/idempotente. Transaccional (BEGIN/COMMIT).
--
--  C1 (CRÍTICA): RPCs financieras SECURITY DEFINER ejecutables por `anon`.
--      Causa raíz: 20260415230000_fix_grants_and_role_config.sql:30-33 hizo
--      `GRANT EXECUTE ON ALL FUNCTIONS ... TO anon` en core/erp/rdb/public. La
--      anon key viaja en el bundle JS público de Vercel; un probe insertó un
--      cxc_pago + su movimiento bancario SIN autenticación (bypassa proxy.ts y
--      preview-guard). Fix: REVOKE EXECUTE de `anon` en las 30 RPCs MUTADORAS
--      de negocio llamables por cliente. `authenticated` conserva su grant
--      propio → las RPCs siguen funcionando desde la app logueada.
--      El gate interno (defensa en profundidad) y el revoke amplio de `anon`
--      en los schemas de negocio van en la iniciativa `blindaje-financiero`
--      con test anon-negativo (tocan helpers de RLS y políticas TO public; no
--      van a ciegas en un hotfix).
--
--  C2 (ALTA): erp.v_partida_control quedó SIN `security_invoker` (regresión de
--      20260612001114) → corría como definidor, bypassando el RLS de
--      erp.presupuesto_partidas. Probe `anon` leyó 558 filas de partidas de
--      TODAS las empresas. Fix: recrear idéntica con `security_invoker = on`
--      + REVOKE SELECT de `anon`. Sin cambio para el acceso legítimo (usuario
--      ve su empresa por RLS; admin ve todo por fn_is_admin).
--
--  C4 (ALTA): un DELETE de una venta destruía por CASCADE el expediente PLD
--      (venta_fases, venta_pagos, venta_fase_revisiones — log "append-only" con
--      el acuse SPPLD). Fix: CASCADE → RESTRICT en las 3 FKs hacia
--      dilesa.ventas. El borrado de negocio ya es soft-delete (deleted_at).

BEGIN;

-- ── C1: revocar EXECUTE de `anon` en las RPCs mutadoras de negocio ──────────
-- (idempotente: revocar un privilegio ya ausente es no-op)
REVOKE EXECUTE ON FUNCTION dilesa.contrato_obra_cancelar(p_contrato_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION dilesa.fn_estimaciones_backfill_incremental() FROM anon;
REVOKE EXECUTE ON FUNCTION dilesa.fn_generar_plan_pagos(p_venta_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION dilesa.fn_programar_encuesta_posventa() FROM anon;
REVOKE EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION dilesa.obra_estimacion_cancelar(p_estimacion_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxc_cargo_ajustar(p_cargo_id uuid, p_nuevo_monto numeric, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_aplicar(p_pago_id uuid, p_aplicaciones jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_cancelar(p_pago_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxc_pago_registrar(p_empresa_id uuid, p_persona_id uuid, p_origen_id uuid, p_monto numeric, p_fecha date, p_fuente text, p_forma_pago text, p_referencia text, p_cuenta_bancaria_id uuid, p_uuid_sat text, p_comprobante_adjunto_id uuid, p_notas text, p_auto_aplicar boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_alta(p_empresa_id uuid, p_proveedor_id uuid, p_total numeric, p_subtotal numeric, p_iva numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_orden_compra_id uuid, p_uuid_sat text, p_emisor_rfc text, p_emisor_nombre text, p_receptor_rfc text, p_forma_pago_sat text, p_metodo_pago_sat text, p_uso_cfdi text, p_tasa_iva numeric, p_retencion_iva numeric, p_retencion_isr numeric, p_xml_url text, p_pdf_url text, p_notas text, p_usuario_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_cancelar(p_factura_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_desde_estimacion(p_estimacion_id uuid, p_condiciones_pago_dias integer) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_factura_total_contrato(p_contrato_id uuid, p_total numeric, p_fecha_emision date, p_condiciones_pago_dias integer, p_factura_ref text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_cancelar(p_pago_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_desde_estimacion(p_estimacion_id uuid, p_fecha_programada date, p_metodo_pago text, p_cuenta_bancaria_id uuid, p_referencia text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_marcar_pagado(p_pago_id uuid, p_fecha_pago date, p_referencia text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_programar(p_empresa_id uuid, p_proveedor_id uuid, p_aplicaciones jsonb, p_metodo_pago text, p_fecha_programada date, p_cuenta_bancaria_id uuid, p_referencia text, p_notas text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_aplicar_levantamiento(p_levantamiento_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_cancelar_levantamiento(p_levantamiento_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_cerrar_captura_levantamiento(p_levantamiento_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_firmar_levantamiento(p_levantamiento_id uuid, p_paso integer, p_rol text, p_comentario text, p_ip inet, p_user_agent text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_iniciar_captura_levantamiento(p_levantamiento_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_presupuesto_baseline_autorizar(p_proyecto_id uuid, p_notas text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.fn_presupuesto_cambio_resolver(p_cambio_id uuid, p_decision text, p_motivo_rechazo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.oc_cancelar_pendiente_linea(p_detalle_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.oc_cerrar_orden(p_orden_id uuid, p_motivo text) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.oc_recibir_linea(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION erp.oc_recibir_linea_partida(p_detalle_id uuid, p_cantidad_recibida_total numeric, p_costo_unitario numeric) FROM anon;

-- ── C2: v_partida_control con security_invoker, sin lectura anon ─────────────
-- Definición tomada de la versión viva en prod (pg_get_viewdef), idéntica salvo
-- la opción security_invoker. CREATE OR REPLACE preserva columnas.
CREATE OR REPLACE VIEW erp.v_partida_control
WITH (security_invoker = on) AS
 SELECT pp.id AS partida_id,
    pp.empresa_id,
    pp.proyecto_id,
    pp.concepto_id,
    pp.concepto_texto,
    pp.etapa,
    pp.estado,
    pp.presupuesto_aprobado,
    COALESCE(comp.comprometido, 0::numeric) + COALESCE(con.comprometido_contratos, 0::numeric) AS comprometido,
    COALESCE(ej.ejercido, 0::numeric) AS ejercido,
    COALESCE(pg.pagado, 0::numeric) AS pagado,
    pp.gasto_real_total AS gasto_real_manual,
    COALESCE(pp.presupuesto_aprobado, 0::numeric) - (COALESCE(comp.comprometido, 0::numeric) + COALESCE(con.comprometido_contratos, 0::numeric)) AS disponible
   FROM erp.presupuesto_partidas pp
     LEFT JOIN LATERAL ( SELECT sum(ocd.cantidad * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric)) AS comprometido
           FROM erp.ordenes_compra_detalle ocd
             JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
          WHERE ocd.partida_id = pp.id AND (oc.estado = ANY (ARRAY['enviada'::text, 'parcial'::text, 'cerrada'::text]))) comp ON true
     LEFT JOIN LATERAL ( SELECT sum(c.valor_total) AS comprometido_contratos
           FROM dilesa.contratos_construccion c
          WHERE c.partida_id = pp.id AND c.empresa_id = pp.empresa_id AND c.deleted_at IS NULL) con ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(( SELECT sum(ocd.cantidad_recibida * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric)) AS sum
                   FROM erp.ordenes_compra_detalle ocd
                  WHERE ocd.partida_id = pp.id), 0::numeric) + COALESCE(( SELECT sum(f.total) AS sum
                   FROM erp.facturas f
                  WHERE f.partida_id = pp.id AND f.orden_compra_id IS NULL AND f.obra_estimacion_id IS NULL AND f.contrato_id IS NULL AND f.flujo = 'egreso'::text AND f.cancelada_at IS NULL AND f.estado_cxp <> 'cancelada'::text), 0::numeric) + COALESCE(( SELECT sum(e.monto_total) AS sum
                   FROM dilesa.obra_estimaciones e
                     JOIN dilesa.contratos_construccion c ON c.id = e.contrato_id
                  WHERE c.partida_id = pp.id AND c.empresa_id = pp.empresa_id AND c.deleted_at IS NULL AND e.deleted_at IS NULL AND (e.estado = ANY (ARRAY['autorizada'::text, 'pagada'::text]))), 0::numeric) AS ejercido) ej ON true
     LEFT JOIN LATERAL ( SELECT sum(app.monto_aplicado) AS pagado
           FROM erp.cxp_pago_aplicaciones app
             JOIN erp.cxp_pagos p ON p.id = app.pago_id
             JOIN erp.facturas f ON f.id = app.factura_id
          WHERE f.partida_id = pp.id AND p.estado = 'pagado'::text AND p.deleted_at IS NULL) pg ON true
  WHERE pp.deleted_at IS NULL;

REVOKE SELECT ON erp.v_partida_control FROM anon;

-- ── C4: el expediente PLD no se destruye por cascada ────────────────────────
-- CASCADE → RESTRICT en las 3 FKs hacia dilesa.ventas. (venta_encuestas ya es
-- NO ACTION.) Idempotente vía DROP IF EXISTS + ADD.
ALTER TABLE dilesa.venta_fases DROP CONSTRAINT IF EXISTS venta_fases_venta_id_fkey;
ALTER TABLE dilesa.venta_fases
  ADD CONSTRAINT venta_fases_venta_id_fkey FOREIGN KEY (venta_id)
  REFERENCES dilesa.ventas(id) ON DELETE RESTRICT;

ALTER TABLE dilesa.venta_pagos DROP CONSTRAINT IF EXISTS venta_pagos_venta_id_fkey;
ALTER TABLE dilesa.venta_pagos
  ADD CONSTRAINT venta_pagos_venta_id_fkey FOREIGN KEY (venta_id)
  REFERENCES dilesa.ventas(id) ON DELETE RESTRICT;

ALTER TABLE dilesa.venta_fase_revisiones DROP CONSTRAINT IF EXISTS venta_fase_revisiones_venta_id_fkey;
ALTER TABLE dilesa.venta_fase_revisiones
  ADD CONSTRAINT venta_fase_revisiones_venta_id_fkey FOREIGN KEY (venta_id)
  REFERENCES dilesa.ventas(id) ON DELETE RESTRICT;

-- Recarga el cache de PostgREST (cambió grants de funciones + definición de vista):
NOTIFY pgrst, 'reload schema';

COMMIT;
