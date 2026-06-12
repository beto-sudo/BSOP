-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260612001114_fix_v_partida_control_pagado_ejecutado            │
-- │                                                                    │
-- │  La capa "pagado" de erp.v_partida_control sumaba TODAS las        │
-- │  aplicaciones de pago sin verificar el estado del pago — el mismo  │
-- │  bug conceptual que el hotfix 20260611003056 corrigió en el        │
-- │  trigger de saldo de facturas. Un pago programado/aprobado es      │
-- │  compromiso, no dinero pagado.                                     │
-- │                                                                    │
-- │  Caso real (partida "Muro de contención", DILESA): pagado=$501k    │
-- │  con $0 ejecutado (2 pagos vivos en programado/aprobado).          │
-- │                                                                    │
-- │  Cambio único: la lateral `pg` ahora exige p.estado='pagado' y     │
-- │  p.deleted_at IS NULL. El resto de la vista queda idéntico         │
-- │  (ADR-040: comprometido = OCs activas + contratos vivos;           │
-- │  ejercido = recibido + gasto directo + estimaciones autorizadas).  │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE VIEW erp.v_partida_control AS
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
          WHERE f.partida_id = pp.id
            AND p.estado = 'pagado'::text
            AND p.deleted_at IS NULL) pg ON true
  WHERE pp.deleted_at IS NULL;

COMMENT ON VIEW erp.v_partida_control IS
  'Control presupuestal 3 capas por partida: comprometido (OC activas + contratos vivos) / ejercido (recibido + gasto directo + estimaciones autorizadas) / pagado (solo aplicaciones de pagos EJECUTADOS, estado=pagado vivos — fix 2026-06-12) + disponible. gasto_real_manual es la captura histórica de obra. ADR-040.';

NOTIFY pgrst, 'reload schema';

COMMIT;
