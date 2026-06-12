-- ╭─ 20260612180114_dilesa_venta_fase_revisiones ─╮
-- Revisiones asistidas de fase del pipeline de ventas DILESA
-- (iniciativa dilesa-ventas-captura-colaborativa, Sprint 3).
--
-- Una fila por ejecución de la revisión (re-ejecutable): qué documento se
-- revisó (adjunto exacto — si el PLD se versiona, la revisión vieja queda
-- ligada a la versión vieja), qué extrajo la IA, los checks cruzados contra
-- el expediente y el veredicto. El gate de cierre de F13 exige revisión en
-- verde sobre el adjunto vigente, u override de Dirección (auditado en
-- core.audit_log).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

CREATE TABLE IF NOT EXISTS dilesa.venta_fase_revisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  venta_id uuid NOT NULL REFERENCES dilesa.ventas (id) ON DELETE CASCADE,
  fase integer NOT NULL,
  -- Adjunto revisado (erp.adjuntos). Si la venta sube otra versión del
  -- documento, esta revisión deja de ser vigente (stale por comparación).
  adjunto_id uuid REFERENCES erp.adjuntos (id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'completada', -- completada | error
  veredicto text NOT NULL,                   -- verde | advertencias | rojo
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraccion jsonb,
  modelo text,
  error_detalle text,
  ejecutado_por uuid REFERENCES core.usuarios (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dilesa.venta_fase_revisiones IS
  'Revisión asistida (IA + cruce determinista) de los documentos de una fase de venta. Append-only: una fila por ejecución; la vigente es la más reciente cuyo adjunto_id es el adjunto vigente. Gate de cierre de F13 (dilesa-ventas-captura-colaborativa S3).';

CREATE INDEX IF NOT EXISTS venta_fase_revisiones_venta_fase_idx
  ON dilesa.venta_fase_revisiones (venta_id, fase, created_at DESC);

-- RLS canónica (aislamiento por empresa, espejo de dilesa.ruv_*).
ALTER TABLE dilesa.venta_fase_revisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venta_fase_revisiones_select ON dilesa.venta_fase_revisiones;
CREATE POLICY venta_fase_revisiones_select ON dilesa.venta_fase_revisiones
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS venta_fase_revisiones_insert ON dilesa.venta_fase_revisiones;
CREATE POLICY venta_fase_revisiones_insert ON dilesa.venta_fase_revisiones
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- Append-only para usuarios autenticados: sin políticas de UPDATE/DELETE
-- (solo service role puede mutar — las revisiones no se editan, se re-corren).

NOTIFY pgrst, 'reload schema';

COMMIT;
