-- Add soft-delete (deleted_at) to erp.departamentos and erp.puestos
-- Matches pattern already applied to erp.empleados and erp.personas.
-- Partial indexes filter active rows (deleted_at IS NULL) for fast list queries.

ALTER TABLE erp.departamentos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE erp.puestos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS erp_departamentos_deleted_idx
  ON erp.departamentos USING btree (empresa_id)
  WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS erp_puestos_deleted_idx
  ON erp.puestos USING btree (empresa_id)
  WHERE (deleted_at IS NULL);

COMMENT ON COLUMN erp.departamentos.deleted_at IS 'Soft-delete timestamp. NULL = active row. Use .is("deleted_at", null) on list queries.';
COMMENT ON COLUMN erp.puestos.deleted_at IS 'Soft-delete timestamp. NULL = active row. Use .is("deleted_at", null) on list queries.';
