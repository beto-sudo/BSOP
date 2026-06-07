-- Iniciativa p2p-cancelaciones · Fase 4 — uniformar el motivo de cancelación.
--
-- Las 6 entidades que YA se cancelan tendrán todas un motivo de cancelación
-- (audit trail, D1). Estado por entidad antes de esta migración:
--   · factura  → RPC cxp_factura_cancelar ya guarda motivo_cancelacion ✓
--   · pago     → RPC cxp_pago_cancelar ya recibe motivo (lo persiste en notas) ✓
--   · requisición / cotización / orden de compra / partida del costeo → cancelan por
--     UPDATE directo (deleted_at o estado) SIN registrar motivo.
--
-- Esta migración agrega las columnas de audit a esas 4 tablas. El UPDATE de
-- cancelación de cada módulo (UI) las popula con el motivo capturado en el
-- <CancelarConMotivoDialog>. Aditivo puro (columnas nullable).

ALTER TABLE erp.requisiciones
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

ALTER TABLE erp.cotizaciones
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

ALTER TABLE erp.ordenes_compra
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

ALTER TABLE erp.presupuesto_partidas
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

NOTIFY pgrst, 'reload schema';
