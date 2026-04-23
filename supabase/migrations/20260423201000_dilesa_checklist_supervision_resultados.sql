-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.checklist_supervision_resultados
-- ════════════════════════════════════════════════════════════════════════════
--
-- Resultado por cada item (checklist_maestro_items) dentro de una inspección
-- (checklist_supervision): cumple boolean + observaciones + evidencia.
--
-- checklist_item_id usa ON DELETE RESTRICT: no se puede borrar un item
-- maestro que ya tiene resultados registrados.
--
-- Nota: no se enforza vía DB que checklist_item_id pertenezca al checklist
-- maestro de checklist_supervision_id (requiere composite FK). Se enforza
-- en la capa de aplicación al insertar.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.checklist_supervision_resultados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  checklist_supervision_id uuid NOT NULL
    REFERENCES dilesa.checklist_supervision(id) ON DELETE CASCADE,
  checklist_item_id        uuid NOT NULL
    REFERENCES dilesa.checklist_maestro_items(id) ON DELETE RESTRICT,

  -- Resultado del item
  cumple        boolean NOT NULL,
  observaciones text,
  evidencia_url text,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT checklist_supervision_resultados_item_uk
    UNIQUE (checklist_supervision_id, checklist_item_id)
);

CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_resultados_empresa_idx
  ON dilesa.checklist_supervision_resultados(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_checklist_supervision_resultados_coda_row_idx
  ON dilesa.checklist_supervision_resultados(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_resultados_supervision_idx
  ON dilesa.checklist_supervision_resultados(checklist_supervision_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_resultados_item_idx
  ON dilesa.checklist_supervision_resultados(checklist_item_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.checklist_supervision_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_supervision_resultados_select ON dilesa.checklist_supervision_resultados;
CREATE POLICY checklist_supervision_resultados_select ON dilesa.checklist_supervision_resultados
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS checklist_supervision_resultados_write ON dilesa.checklist_supervision_resultados;
CREATE POLICY checklist_supervision_resultados_write ON dilesa.checklist_supervision_resultados
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_checklist_supervision_resultados_updated_at
  ON dilesa.checklist_supervision_resultados;
CREATE TRIGGER dilesa_checklist_supervision_resultados_updated_at
  BEFORE UPDATE ON dilesa.checklist_supervision_resultados
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.checklist_supervision_resultados IS
  'Resultado por item dentro de una inspección. UNIQUE (checklist_supervision_id, checklist_item_id) garantiza un resultado por item/inspección. CASCADE desde checklist_supervision; RESTRICT a checklist_maestro_items (no se borran items con historial).';
