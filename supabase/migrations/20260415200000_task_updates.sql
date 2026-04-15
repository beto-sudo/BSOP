-- Task Updates: log de actividad por tarea (avances, cambios de estado, etc.)

CREATE TABLE erp.task_updates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES erp.tasks(id) ON DELETE CASCADE,
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('avance','cambio_estado','cambio_fecha','nota','cambio_responsable')),
  contenido     TEXT,
  valor_anterior TEXT,
  valor_nuevo   TEXT,
  creado_por    UUID REFERENCES core.usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_updates_task_id ON erp.task_updates(task_id);
CREATE INDEX idx_task_updates_empresa_created ON erp.task_updates(empresa_id, created_at);

ALTER TABLE erp.task_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_updates_authenticated" ON erp.task_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON erp.task_updates TO anon, authenticated, service_role;
