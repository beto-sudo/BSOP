-- ╭─ 20260628014658_requisiciones_es_mano_obra ─╮
-- Sprint 1 · iniciativa dilesa-adjudicacion-contrato-obra
--
-- La requisición declara si es MANO DE OBRA / servicio contratado. Con esto el
-- spawn de la RFQ deja de hardcodear tipo='compra' y nace tipo='obra' cuando es
-- mano de obra → la adjudicación rutea a Contrato (no a OC). Es la pieza que hace
-- canónica la ruta requisición → cotización → adjudicación → Contrato de obra.
--
-- `terminos_ofrecidos`: nota suave del solicitante (anticipo/plazo que se está
-- dispuesto a ofrecer). Informativo — las condiciones formales del contrato se
-- capturan al adjudicar (Sprint 2). No gobierna nada todavía.
--
-- Additiva y defensiva: columnas nullable/DEFAULT, sin reescritura de filas ni
-- lock pesado (boolean NOT NULL DEFAULT false = metadata-only en PG11+). La RLS
-- de erp.requisiciones (empresa-scoped set-membership) se hereda sin cambios.

BEGIN;

ALTER TABLE erp.requisiciones
  ADD COLUMN IF NOT EXISTS es_mano_obra boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminos_ofrecidos text;

COMMENT ON COLUMN erp.requisiciones.es_mano_obra IS
  'La requisición es mano de obra / servicio contratado → la RFQ nace tipo=obra (adjudica a Contrato). Default false = compra de material (→ OC).';
COMMENT ON COLUMN erp.requisiciones.terminos_ofrecidos IS
  'Términos suaves que el solicitante propone ofrecer (anticipo/plazo). Informativo; las condiciones formales del contrato se capturan al adjudicar.';

-- Recarga el cache de PostgREST (columnas nuevas en tabla con embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
