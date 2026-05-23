-- ============================================================================
-- DILESA · ventas · coda_row_id
-- ----------------------------------------------------------------------------
-- Agrega `coda_row_id` a `dilesa.ventas` para usar como llave de matching
-- estable contra Coda (`row.id` de la API, formato `i-<base64>`, único
-- por documento).
--
-- Contexto: el import inicial dedupló personas por CURP, lo cual mergeó
-- todos los clientes con CURP basura (`X`, `XXXXXXXXXX`, etc.) en una
-- sola persona (la peor: 183 ventas colapsadas en una). El expediente
-- también matchea por (CURP|identificador_unidad), reproduciendo el
-- mismo problema. `coda_row_id` desambigua 1:1 cada venta contra Coda.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS coda_row_id text;

-- Unique parcial: cada (empresa, coda_row_id) único cuando no es null
-- (deja la puerta abierta para ventas creadas fuera de Coda).
CREATE UNIQUE INDEX IF NOT EXISTS ventas_coda_row_id_empresa_uq
  ON dilesa.ventas (empresa_id, coda_row_id)
  WHERE coda_row_id IS NOT NULL AND deleted_at IS NULL;

-- Index para lookup por solo coda_row_id (en re-imports).
CREATE INDEX IF NOT EXISTS ventas_coda_row_id_idx
  ON dilesa.ventas (coda_row_id)
  WHERE coda_row_id IS NOT NULL;

COMMENT ON COLUMN dilesa.ventas.coda_row_id IS
  'Coda row.id (`i-<base64>`) — llave estable para matching contra Coda durante re-imports. Único por (empresa_id, coda_row_id) WHERE NOT NULL.';

NOTIFY pgrst, 'reload schema';

COMMIT;
