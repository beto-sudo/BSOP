-- Iniciativa p2p-cancelaciones · Fase 2 — cancelar contrato de obra.
--
-- Mismo patrón canónico que la estimación (Fase 1): cancelada_at/_por/motivo +
-- creado_por. El contrato cancelado queda VISIBLE con badge y DEJA de comprometer
-- su partida (se filtra en erp.v_partida_control).
--
-- Bloqueo (D3): no se puede cancelar un contrato que ya tiene estimaciones activas
-- → primero se cancelan las estimaciones (Fase 1). Gating (D2): admin o quien capturó.

ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS creado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

CREATE OR REPLACE FUNCTION dilesa.fn_contrato_construccion_set_creado_por()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.creado_por IS NULL THEN
    NEW.creado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_construccion_creado_por ON dilesa.contratos_construccion;
CREATE TRIGGER trg_contrato_construccion_creado_por
  BEFORE INSERT ON dilesa.contratos_construccion
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_contrato_construccion_set_creado_por();

CREATE OR REPLACE FUNCTION dilesa.contrato_obra_cancelar(
  p_contrato_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_c dilesa.contratos_construccion%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_c FROM dilesa.contratos_construccion WHERE id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;
  IF v_c.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El contrato está eliminado';
  END IF;
  IF v_c.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'El contrato ya está cancelado';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo de cancelación es obligatorio';
  END IF;

  IF NOT (core.fn_is_admin() OR v_c.creado_por = v_uid) THEN
    RAISE EXCEPTION 'Solo un administrador o quien capturó el contrato puede cancelarlo';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dilesa.obra_estimaciones e
    WHERE e.contrato_id = p_contrato_id
      AND e.deleted_at IS NULL
      AND e.cancelada_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El contrato tiene estimaciones registradas. Cancélalas primero antes de cancelar el contrato.';
  END IF;

  UPDATE dilesa.contratos_construccion
    SET cancelada_at = now(),
        cancelada_por = v_uid,
        motivo_cancelacion = btrim(p_motivo),
        updated_at = now()
    WHERE id = p_contrato_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.contrato_obra_cancelar(uuid, text) TO authenticated;

-- El comprometido de contratos en el control de partidas excluye los cancelados.
-- (Resto de la vista idéntico a 20260605190000; solo cambia el LATERAL `con`.)
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
            SELECT sum(c.valor_total) AS comprometido_contratos
              FROM dilesa.contratos_construccion c
             WHERE c.partida_id = pp.id
               AND c.empresa_id = pp.empresa_id
               AND c.deleted_at IS NULL
               AND c.cancelada_at IS NULL
          ) con ON true
     LEFT JOIN LATERAL (
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
