-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.plantilla_tareas_construccion
-- ════════════════════════════════════════════════════════════════════════════
--
-- Plantillas (templates) de tareas de construcción. Cada plantilla puede ser
-- global (prototipo_id NULL) o específica de un prototipo; sus items viven en
-- dilesa.plantilla_tareas_construccion_items.
--
-- Al crear un construccion_lote se puede materializar una plantilla a
-- dilesa.tareas_construccion para generar el plan de obra inicial.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.plantilla_tareas_construccion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identificación
  nombre       text NOT NULL,
  prototipo_id uuid REFERENCES dilesa.prototipos(id) ON DELETE SET NULL,
  descripcion  text,
  activa       boolean NOT NULL DEFAULT true,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT plantilla_tareas_construccion_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, nombre, prototipo_id)
);

CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_empresa_idx
  ON dilesa.plantilla_tareas_construccion(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_coda_row_idx
  ON dilesa.plantilla_tareas_construccion(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_prototipo_idx
  ON dilesa.plantilla_tareas_construccion(prototipo_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.plantilla_tareas_construccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plantilla_tareas_construccion_select ON dilesa.plantilla_tareas_construccion;
CREATE POLICY plantilla_tareas_construccion_select ON dilesa.plantilla_tareas_construccion
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS plantilla_tareas_construccion_write ON dilesa.plantilla_tareas_construccion;
CREATE POLICY plantilla_tareas_construccion_write ON dilesa.plantilla_tareas_construccion
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_plantilla_tareas_construccion_updated_at ON dilesa.plantilla_tareas_construccion;
CREATE TRIGGER dilesa_plantilla_tareas_construccion_updated_at
  BEFORE UPDATE ON dilesa.plantilla_tareas_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.plantilla_tareas_construccion IS
  'Plantilla maestra de tareas de construcción. prototipo_id NULL = global para cualquier modelo. UNIQUE NULLS NOT DISTINCT (empresa, nombre, prototipo_id) permite mismo nombre entre prototipos distintos.';
