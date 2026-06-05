-- Iniciativa dilesa-compras · Sprint Cotizaciones (RFQ) · Fase 0 · ADR-042 / D15
-- El contrato de obra compromete una partida del presupuesto (1:1).
--
-- 1) Nueva columna dilesa.contratos_construccion.partida_id (FK → erp.presupuesto_partidas,
--    nullable, cross-schema dilesa→erp — mismo patrón que presupuesto_partidas.proyecto_id).
--    Un contrato apunta a UNA partida; una partida puede tener N contratos (N:1).
--    NO se usa presupuesto_partidas.contrato_id (dirección opuesta; queda en desuso, 0 filas).
--
-- 2) erp.v_partida_control.comprometido extendido:
--      comprometido = Σ OC (enviada/parcial/cerrada) + Σ contratos activos por partida_id.
--    El contrato compromete (su valor_total); las estimaciones→factura ejercen (ADR-041):
--    capas distintas → sin doble conteo. disponible = aprobado − comprometido (total).
--    Activo = deleted_at IS NULL (la tabla no tiene columna estado).
--
-- ADITIVO PURO: hoy 0 contratos tienen partida_id (columna nueva) → ningún número de la
-- vista cambia al aplicar. El comprometido de contratos empieza a contar cuando la UI
-- (Fase 2) ligue contratos a partidas. No afecta RDB ni otras empresas (la vista solo vive
-- sobre presupuesto_partidas de obra DILESA; el join de contratos filtra por empresa_id).

ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS partida_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contratos_construccion_partida_id_fkey'
  ) THEN
    ALTER TABLE dilesa.contratos_construccion
      ADD CONSTRAINT contratos_construccion_partida_id_fkey
      FOREIGN KEY (partida_id) REFERENCES erp.presupuesto_partidas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contratos_construccion_partida_id
  ON dilesa.contratos_construccion (partida_id)
  WHERE partida_id IS NOT NULL;

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
    COALESCE(pp.presupuesto_aprobado, 0::numeric)
      - (COALESCE(comp.comprometido, 0::numeric) + COALESCE(con.comprometido_contratos, 0::numeric)) AS disponible
   FROM erp.presupuesto_partidas pp
     LEFT JOIN LATERAL (
            SELECT sum(ocd.cantidad * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric)) AS comprometido
              FROM erp.ordenes_compra_detalle ocd
                JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
             WHERE ocd.partida_id = pp.id
               AND (oc.estado = ANY (ARRAY['enviada'::text, 'parcial'::text, 'cerrada'::text]))
          ) comp ON true
     LEFT JOIN LATERAL (
            -- ADR-042: el contrato de obra compromete su partida (1:1). Activo = deleted_at IS NULL.
            -- Filtra por empresa_id (aislamiento defensivo: la vista no es security_invoker).
            SELECT sum(c.valor_total) AS comprometido_contratos
              FROM dilesa.contratos_construccion c
             WHERE c.partida_id = pp.id
               AND c.empresa_id = pp.empresa_id
               AND c.deleted_at IS NULL
          ) con ON true
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
