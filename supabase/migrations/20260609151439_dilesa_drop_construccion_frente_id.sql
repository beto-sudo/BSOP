-- ============================================================================
-- DILESA · RUV — drop de la columna vestigial dilesa.construccion.frente_id
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv`. La liga lote→frente vive ahora en unidades.frente_id
-- (Sprint 4); construccion.frente_id quedó sin lectores. Autorizado por Beto.
-- ============================================================================
ALTER TABLE dilesa.construccion DROP COLUMN IF EXISTS frente_id;
NOTIFY pgrst, 'reload schema';
