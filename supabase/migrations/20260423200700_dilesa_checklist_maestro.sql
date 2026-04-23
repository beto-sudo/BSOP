-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.checklist_maestro
-- ════════════════════════════════════════════════════════════════════════════
--
-- Catálogo de checklists de supervisión/inspección (calidad estructural,
-- acabados, instalaciones, etc.). Cada checklist tiene items en
-- dilesa.checklist_maestro_items.
--
-- Scope: etapa_construccion_id + prototipo_id (ambos nullables) permiten
-- checklists globales, por etapa, por prototipo, o por la combinación.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.checklist_maestro (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identificación
  nombre      text NOT NULL,
  descripcion text,
  categoria   text,

  -- Scope
  etapa_construccion_id uuid REFERENCES dilesa.etapas_construccion(id) ON DELETE SET NULL,
  prototipo_id          uuid REFERENCES dilesa.prototipos(id) ON DELETE SET NULL,

  activa boolean NOT NULL DEFAULT true,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT checklist_maestro_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, nombre, etapa_construccion_id, prototipo_id)
);

CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_empresa_idx
  ON dilesa.checklist_maestro(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_checklist_maestro_coda_row_idx
  ON dilesa.checklist_maestro(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_etapa_idx
  ON dilesa.checklist_maestro(etapa_construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_prototipo_idx
  ON dilesa.checklist_maestro(prototipo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_maestro_categoria_idx
  ON dilesa.checklist_maestro(categoria) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.checklist_maestro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_maestro_select ON dilesa.checklist_maestro;
CREATE POLICY checklist_maestro_select ON dilesa.checklist_maestro
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS checklist_maestro_write ON dilesa.checklist_maestro;
CREATE POLICY checklist_maestro_write ON dilesa.checklist_maestro
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_checklist_maestro_updated_at ON dilesa.checklist_maestro;
CREATE TRIGGER dilesa_checklist_maestro_updated_at
  BEFORE UPDATE ON dilesa.checklist_maestro
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.checklist_maestro IS
  'Catálogo de checklists de inspección. Scope por etapa_construccion_id + prototipo_id (ambos nullables: global / por etapa / por prototipo / combinación). UNIQUE NULLS NOT DISTINCT en la 4-tupla.';
