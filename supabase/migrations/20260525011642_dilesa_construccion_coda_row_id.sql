-- Iniciativa: dilesa-construccion · Sprint 2
-- Agrega coda_row_id a las 8 tablas del schema construcción para UPSERT
-- idempotente desde Coda (patrón establecido por Sprint 6 de ventas).
--
-- Una columna nullable + índice único parcial (solo cuando hay valor y la
-- fila no está soft-deleted) permite que filas nativas BSOP (sin coda_row_id)
-- coexistan con filas importadas.

ALTER TABLE dilesa.etapas_construccion ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS etapas_construccion_coda_row_id_uk
  ON dilesa.etapas_construccion (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.tareas_construccion ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS tareas_construccion_coda_row_id_uk
  ON dilesa.tareas_construccion (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.plantilla_tareas ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS plantilla_tareas_coda_row_id_uk
  ON dilesa.plantilla_tareas (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.contratistas_datos ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contratistas_datos_coda_row_id_uk
  ON dilesa.contratistas_datos (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.contratos_construccion ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contratos_construccion_coda_row_id_uk
  ON dilesa.contratos_construccion (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.contrato_lotes ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contrato_lotes_coda_row_id_uk
  ON dilesa.contrato_lotes (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.construccion ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS construccion_coda_row_id_uk
  ON dilesa.construccion (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

ALTER TABLE dilesa.construccion_tareas_terminadas ADD COLUMN IF NOT EXISTS coda_row_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ctt_coda_row_id_uk
  ON dilesa.construccion_tareas_terminadas (empresa_id, coda_row_id)
  WHERE deleted_at IS NULL AND coda_row_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
