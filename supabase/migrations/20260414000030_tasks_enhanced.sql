-- ============================================================
-- 20260414000030_tasks_enhanced.sql
-- Enhance erp.tasks for DILESA task import:
--   - asignado_por (who assigned/created the task as empleado)
--   - fecha_completado, completado_por (completion tracking)
--   - porcentaje_avance (progress 0-100)
-- ============================================================

-- ── New columns ─────────────────────────────────────────────────────────────

ALTER TABLE erp.tasks
  ADD COLUMN IF NOT EXISTS asignado_por      UUID REFERENCES erp.empleados(id),
  ADD COLUMN IF NOT EXISTS fecha_completado  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completado_por    UUID REFERENCES erp.empleados(id),
  ADD COLUMN IF NOT EXISTS porcentaje_avance INTEGER DEFAULT 0
    CHECK (porcentaje_avance BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS fecha_compromiso  DATE,
  ADD COLUMN IF NOT EXISTS tipo              TEXT,
  ADD COLUMN IF NOT EXISTS motivo_bloqueo    TEXT,
  ADD COLUMN IF NOT EXISTS siguiente_accion  TEXT,
  ADD COLUMN IF NOT EXISTS iniciativa        TEXT,
  ADD COLUMN IF NOT EXISTS departamento_nombre TEXT,
  ADD COLUMN IF NOT EXISTS prioridad         TEXT;

COMMENT ON COLUMN erp.tasks.asignado_por      IS 'Empleado que asignó la tarea.';
COMMENT ON COLUMN erp.tasks.fecha_completado  IS 'Timestamp cuando se marcó completada.';
COMMENT ON COLUMN erp.tasks.completado_por    IS 'Empleado que completó la tarea.';
COMMENT ON COLUMN erp.tasks.porcentaje_avance IS 'Progreso 0–100%.';

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS erp_tasks_asignado_por_idx
  ON erp.tasks (empresa_id, asignado_por);

-- ── Auto-set fecha_completado on estado change ──────────────────────────────

CREATE OR REPLACE FUNCTION erp.fn_tasks_completado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'completado' AND (OLD.estado IS DISTINCT FROM 'completado') THEN
    NEW.fecha_completado := COALESCE(NEW.fecha_completado, now());
  END IF;
  IF NEW.estado <> 'completado' AND OLD.estado = 'completado' THEN
    NEW.fecha_completado := NULL;
    NEW.completado_por   := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS erp_tasks_completado ON erp.tasks;
CREATE TRIGGER erp_tasks_completado
  BEFORE UPDATE ON erp.tasks
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_tasks_completado();
