-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.tareas_construccion
-- ════════════════════════════════════════════════════════════════════════════
--
-- Instancias de tareas de obra asignadas a un construccion_lote. Pueden venir
-- de una plantilla (plantilla_item_id NOT NULL) o ser ad-hoc. Tracking de
-- estado, avance, fechas y contratista asignado.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.tareas_construccion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  construccion_lote_id  uuid NOT NULL
    REFERENCES dilesa.construccion_lote(id) ON DELETE CASCADE,
  plantilla_item_id     uuid
    REFERENCES dilesa.plantilla_tareas_construccion_items(id) ON DELETE SET NULL,
  etapa_construccion_id uuid REFERENCES dilesa.etapas_construccion(id) ON DELETE SET NULL,
  contratista_id        uuid REFERENCES dilesa.contratistas(id) ON DELETE SET NULL,

  -- Definición
  nombre       text NOT NULL,
  descripcion  text,
  orden        int,

  -- Tiempos
  fecha_inicio_estimada date,
  fecha_inicio_real     date,
  fecha_fin_estimada    date,
  fecha_fin_real        date,

  -- Avance
  estado     text NOT NULL DEFAULT 'pendiente',
  avance_pct numeric(5,2) NOT NULL DEFAULT 0,

  -- Evidencia
  evidencias_urls text[],
  observaciones   text,

  -- Gestión estándar
  etapa                 text,
  decision_actual       text,
  prioridad             text,
  responsable_id        uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_ultima_revision date,
  siguiente_accion      text,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT tareas_construccion_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT tareas_construccion_estado_check
    CHECK (estado IN ('pendiente','en_progreso','completada','cancelada','bloqueada')),
  CONSTRAINT tareas_construccion_avance_check
    CHECK (avance_pct >= 0 AND avance_pct <= 100),
  CONSTRAINT tareas_construccion_fechas_check
    CHECK (fecha_fin_real IS NULL
           OR fecha_inicio_real IS NULL
           OR fecha_fin_real >= fecha_inicio_real)
);

CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_empresa_idx
  ON dilesa.tareas_construccion(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_tareas_construccion_coda_row_idx
  ON dilesa.tareas_construccion(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_construccion_idx
  ON dilesa.tareas_construccion(construccion_lote_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_plantilla_item_idx
  ON dilesa.tareas_construccion(plantilla_item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_etapa_idx
  ON dilesa.tareas_construccion(etapa_construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_contratista_idx
  ON dilesa.tareas_construccion(contratista_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_estado_idx
  ON dilesa.tareas_construccion(estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tareas_construccion_responsable_idx
  ON dilesa.tareas_construccion(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tareas_construccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tareas_construccion_select ON dilesa.tareas_construccion;
CREATE POLICY tareas_construccion_select ON dilesa.tareas_construccion
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS tareas_construccion_write ON dilesa.tareas_construccion;
CREATE POLICY tareas_construccion_write ON dilesa.tareas_construccion
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tareas_construccion_updated_at ON dilesa.tareas_construccion;
CREATE TRIGGER dilesa_tareas_construccion_updated_at
  BEFORE UPDATE ON dilesa.tareas_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tareas_construccion IS
  'Instancias de tareas asignadas a un construccion_lote. plantilla_item_id NULL = tarea ad-hoc. Estado pendiente/en_progreso/completada/cancelada/bloqueada. CASCADE desde construccion_lote.';
