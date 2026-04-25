-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.checklist_maestro_items
-- ════════════════════════════════════════════════════════════════════════════
--
-- Items de un checklist maestro — cada punto a verificar con su criterio de
-- aceptación. Al ejecutar una inspección (checklist_supervision), cada item
-- genera un resultado en checklist_supervision_resultados.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.checklist_maestro_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculo
  checklist_id uuid NOT NULL
    REFERENCES dilesa.checklist_maestro(id) ON DELETE CASCADE,

  -- Definición
  orden                int NOT NULL,
  descripcion_item     text NOT NULL,
  criterio_aceptacion  text,
  obligatorio          boolean NOT NULL DEFAULT true,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT checklist_maestro_items_orden_uk
    UNIQUE (checklist_id, orden)
);

CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_items_empresa_idx
  ON dilesa.checklist_maestro_items(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_checklist_maestro_items_coda_row_idx
  ON dilesa.checklist_maestro_items(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_items_checklist_idx
  ON dilesa.checklist_maestro_items(checklist_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.checklist_maestro_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_maestro_items_select ON dilesa.checklist_maestro_items;
CREATE POLICY checklist_maestro_items_select ON dilesa.checklist_maestro_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS checklist_maestro_items_write ON dilesa.checklist_maestro_items;
CREATE POLICY checklist_maestro_items_write ON dilesa.checklist_maestro_items
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_checklist_maestro_items_updated_at ON dilesa.checklist_maestro_items;
CREATE TRIGGER dilesa_checklist_maestro_items_updated_at
  BEFORE UPDATE ON dilesa.checklist_maestro_items
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.checklist_maestro_items IS
  'Items (puntos a verificar) de un checklist maestro. CASCADE desde checklist_maestro. UNIQUE (checklist_id, orden) garantiza secuencia estable.';
