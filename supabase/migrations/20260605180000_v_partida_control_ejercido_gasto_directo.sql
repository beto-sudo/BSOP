-- Iniciativa dilesa-compras · D14 / ADR-041
-- Ajusta erp.v_partida_control.ejercido al modelo híbrido:
--   ejercido = recepciones de OC + facturas de egreso con partida y SIN OC.
-- La condición orden_compra_id IS NULL evita el doble conteo (una factura nacida
-- de OC ya se devengó vía su recepción). comprometido/pagado/disponible intactos.
-- CREATE OR REPLACE: mismas columnas (sin cambio de contrato), no afecta RDB/otras
-- empresas (la vista solo vive sobre presupuesto_partidas de obra DILESA).

CREATE OR REPLACE VIEW erp.v_partida_control AS
SELECT pp.id AS partida_id,
    pp.empresa_id,
    pp.proyecto_id,
    pp.concepto_id,
    pp.concepto_texto,
    pp.etapa,
    pp.estado,
    pp.presupuesto_aprobado,
    COALESCE(comp.comprometido, 0::numeric) AS comprometido,
    COALESCE(ej.ejercido, 0::numeric) AS ejercido,
    COALESCE(pg.pagado, 0::numeric) AS pagado,
    pp.gasto_real_total AS gasto_real_manual,
    COALESCE(pp.presupuesto_aprobado, 0::numeric) - COALESCE(comp.comprometido, 0::numeric) AS disponible
   FROM erp.presupuesto_partidas pp
     LEFT JOIN LATERAL (
            SELECT sum(ocd.cantidad * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric)) AS comprometido
              FROM erp.ordenes_compra_detalle ocd
                JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
             WHERE ocd.partida_id = pp.id
               AND (oc.estado = ANY (ARRAY['enviada'::text, 'parcial'::text, 'cerrada'::text]))
          ) comp ON true
     LEFT JOIN LATERAL (
            -- Devengado: recibido de OC + facturas directas (sin OC) ligadas a la partida.
            -- Las facturas CON OC NO se recuentan aquí (su recepción ya las contó).
            SELECT COALESCE((
                     SELECT sum(ocd.cantidad_recibida * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric))
                       FROM erp.ordenes_compra_detalle ocd
                      WHERE ocd.partida_id = pp.id
                   ), 0::numeric)
                 + COALESCE((
                     SELECT sum(f.total)
                       FROM erp.facturas f
                      WHERE f.partida_id = pp.id
                        AND f.orden_compra_id IS NULL
                        AND f.flujo = 'egreso'
                        AND f.cancelada_at IS NULL
                        AND f.estado_cxp <> 'cancelada'
                   ), 0::numeric) AS ejercido
          ) ej ON true
     LEFT JOIN LATERAL (
            SELECT sum(app.monto_aplicado) AS pagado
              FROM erp.cxp_pago_aplicaciones app
                JOIN erp.facturas f ON f.id = app.factura_id
             WHERE f.partida_id = pp.id
          ) pg ON true
  WHERE pp.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
