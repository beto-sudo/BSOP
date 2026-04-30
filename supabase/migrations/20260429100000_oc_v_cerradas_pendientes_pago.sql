-- oc-cierre-ciclo Sprint 3 — view de OCs cerradas pendientes de pago
--
-- View read-only que expone OCs en estado 'cerrada' con total_a_pagar > 0,
-- para que el módulo CxP futuro consulte sin retrabajo cuando exista.
-- Hoy la UI consulta erp.ordenes_compra directamente; la view queda como
-- contrato listo. Cuando CxP arranque (iniciativa `cxp`, planned), su
-- Sprint 1 reemplaza esta view por tabla materializada o lógica más rica
-- — sin afectar a OC porque la view es throwaway.

CREATE OR REPLACE VIEW erp.v_oc_cerradas_pendientes_pago AS
SELECT
  oc.id                    AS oc_id,
  oc.codigo                AS folio,
  oc.empresa_id,
  oc.proveedor_id,
  oc.total_a_pagar,
  oc.cerrada_at,
  oc.cerrada_por,
  EXTRACT(DAY FROM (now() - oc.cerrada_at))::int AS dias_desde_cierre
FROM erp.ordenes_compra AS oc
WHERE oc.estado = 'cerrada'
  AND oc.total_a_pagar IS NOT NULL
  AND oc.total_a_pagar > 0
  AND oc.deleted_at IS NULL;

COMMENT ON VIEW erp.v_oc_cerradas_pendientes_pago IS
  'OCs cerradas con total_a_pagar > 0 — handoff a CxP futuro. Throwaway: cuando módulo CxP exista, replazar por su modelo propio.';

-- Asegurar que PostgREST puede listar la view en el schema 'erp' (que ya
-- está en pgrst.db_schemas). No se requieren GRANTs adicionales: roles
-- authenticated/service_role heredan SELECT por convención del schema.

NOTIFY pgrst, 'reload schema';
