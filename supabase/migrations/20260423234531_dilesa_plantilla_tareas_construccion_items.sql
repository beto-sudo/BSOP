-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.plantilla_tareas_construccion_items
-- ════════════════════════════════════════════════════════════════════════════
--
-- Items de una plantilla de tareas. Cada item define una tarea genérica con
-- su orden, etapa, tipo de trabajo y duración estimada. Se instancia en
-- dilesa.tareas_construccion al materializar la plantilla sobre un
-- construccion_lote.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.plantilla_tareas_construccion_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  plantilla_id          uuid NOT NULL
    REFERENCES dilesa.plantilla_tareas_construccion(id) ON DELETE CASCADE,
  etapa_construccion_id uuid REFERENCES dilesa.etapas_construccion(id) ON DELETE SET NULL,
  tipo_trabajo_id       uuid REFERENCES dilesa.tipo_trabajo(id) ON DELETE SET NULL,

  -- Definición
  orden                   int NOT NULL,
  nombre_tarea            text NOT NULL,
  descripcion             text,
  duracion_dias_estimada  int,
  obligatoria             boolean NOT NULL DEFAULT true,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT plantilla_items_orden_uk
    UNIQUE (plantilla_id, orden)
);

CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_items_empresa_idx
  ON dilesa.plantilla_tareas_construccion_items(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_items_coda_row_idx
  ON dilesa.plantilla_tareas_construccion_items(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_items_plantilla_idx
  ON dilesa.plantilla_tareas_construccion_items(plantilla_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_items_etapa_idx
  ON dilesa.plantilla_tareas_construccion_items(etapa_construccion_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.plantilla_tareas_construccion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plantilla_tareas_construccion_items_select ON dilesa.plantilla_tareas_construccion_items;
CREATE POLICY plantilla_tareas_construccion_items_select ON dilesa.plantilla_tareas_construccion_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS plantilla_tareas_construccion_items_write ON dilesa.plantilla_tareas_construccion_items;
CREATE POLICY plantilla_tareas_construccion_items_write ON dilesa.plantilla_tareas_construccion_items
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_plantilla_tareas_construccion_items_updated_at
  ON dilesa.plantilla_tareas_construccion_items;
CREATE TRIGGER dilesa_plantilla_tareas_construccion_items_updated_at
  BEFORE UPDATE ON dilesa.plantilla_tareas_construccion_items
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.plantilla_tareas_construccion_items IS
  'Items de una plantilla de tareas de construcción (orden, etapa, tipo trabajo, duración). CASCADE desde plantilla. UNIQUE (plantilla_id, orden) garantiza secuencia estable.';
