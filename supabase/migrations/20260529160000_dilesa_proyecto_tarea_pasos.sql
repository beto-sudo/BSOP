-- Iniciativa: dilesa-proyectos-checklist-inline Sprint 3 — pasos por tarea.
--
-- Cada tarea pasa de tener (`resultado_monto`, `resultado_documento_url`)
-- a tener 4 pasos canónicos modelados en tabla aparte: cotizacion,
-- factura, pago, resultado. Cada paso captura monto + documento +
-- fecha + estado (pendiente/hecho/no_aplica) + notas.
--
-- Decisiones cerradas D1-D6 documentadas en
-- `docs/planning/dilesa-proyectos-checklist-inline.md` §Sprint 3.
--
-- Backfill posterior (script Node, no parte de esta migración):
-- - Cada tarea con `resultado_documento_url` → INSERT paso='resultado'
--   estado='hecho' con `documento_url` poblado.
-- - Cada tarea con `resultado_monto` → INSERT paso='cotizacion'
--   estado='hecho' con `monto` poblado.
-- Los atajos en `proyecto_tareas` se mantienen como referencia rápida
-- (deprecados para captura nueva — la UI escribe a la tabla nueva).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Tabla `dilesa.proyecto_tarea_pasos`
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dilesa.proyecto_tarea_pasos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  tarea_id uuid NOT NULL REFERENCES dilesa.proyecto_tareas(id) ON DELETE CASCADE,
  paso text NOT NULL CHECK (paso IN ('cotizacion', 'factura', 'pago', 'resultado')),
  monto numeric,
  documento_url text,
  fecha date,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'hecho', 'no_aplica')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tarea_id, paso)
);

COMMENT ON TABLE dilesa.proyecto_tarea_pasos IS
  'Pasos del ciclo de vida operativo de una tarea (cotización, factura, pago, resultado). Cada paso captura monto + documento + fecha + estado. UNIQUE(tarea_id, paso) garantiza un solo row por paso. Sprint 3 de dilesa-proyectos-checklist-inline.';
COMMENT ON COLUMN dilesa.proyecto_tarea_pasos.estado IS
  'pendiente=sin capturar, hecho=monto/doc capturado y operador lo marca como cerrado, no_aplica=el paso no es relevante para esta tarea (se saca del denominador del avance).';
COMMENT ON COLUMN dilesa.proyecto_tarea_pasos.documento_url IS
  'Atajo a la URL pública del adjunto principal del paso (vía `/api/adjuntos/<path>`). El legajo completo vive en `erp.adjuntos` con entidad_tipo=''proyecto_tarea_paso''.';

CREATE INDEX IF NOT EXISTS idx_proyecto_tarea_pasos_tarea
  ON dilesa.proyecto_tarea_pasos (tarea_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proyecto_tarea_pasos_empresa
  ON dilesa.proyecto_tarea_pasos (empresa_id)
  WHERE deleted_at IS NULL;

-- Updated_at trigger reutilizando la convención DILESA.
CREATE OR REPLACE FUNCTION dilesa.fn_proyecto_tarea_pasos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proyecto_tarea_pasos_updated_at ON dilesa.proyecto_tarea_pasos;
CREATE TRIGGER trg_proyecto_tarea_pasos_updated_at
  BEFORE UPDATE ON dilesa.proyecto_tarea_pasos
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_proyecto_tarea_pasos_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 2) RLS canónica DILESA
-- ════════════════════════════════════════════════════════════════════════════
-- Política estándar: miembros de la empresa pueden SELECT/INSERT/UPDATE;
-- DELETE reservado a admin. Sigue el patrón usado en
-- `proyecto_presupuesto_partidas` (ver migración 20260526220000).

ALTER TABLE dilesa.proyecto_tarea_pasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proyecto_tarea_pasos_select ON dilesa.proyecto_tarea_pasos;
CREATE POLICY proyecto_tarea_pasos_select
  ON dilesa.proyecto_tarea_pasos
  FOR SELECT
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS proyecto_tarea_pasos_insert ON dilesa.proyecto_tarea_pasos;
CREATE POLICY proyecto_tarea_pasos_insert
  ON dilesa.proyecto_tarea_pasos
  FOR INSERT
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS proyecto_tarea_pasos_update ON dilesa.proyecto_tarea_pasos;
CREATE POLICY proyecto_tarea_pasos_update
  ON dilesa.proyecto_tarea_pasos
  FOR UPDATE
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS proyecto_tarea_pasos_delete ON dilesa.proyecto_tarea_pasos;
CREATE POLICY proyecto_tarea_pasos_delete
  ON dilesa.proyecto_tarea_pasos
  FOR DELETE
  USING (core.fn_is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Vista `dilesa.v_proyecto_avance` — avance ponderado por proyecto
-- ════════════════════════════════════════════════════════════════════════════
-- Avance tarea = (hechos / aplicables) * 100 (D2).
-- Avance proyecto = promedio ponderado por obligatoriedad (D3):
--   - obligatoria: peso 1.0
--   - condicional: peso 0.5
--   - opcional: peso 0 (se saca del cálculo)
--   - NULL (legacy): peso 1.0 (tratamos como obligatoria por defecto seguro)
--
-- Las tareas sin pasos instanciados tienen avance 0% (denominator NULL → 0).
-- security_invoker=on para respetar RLS del lector.

CREATE OR REPLACE VIEW dilesa.v_proyecto_avance
WITH (security_invoker = on) AS
WITH paso_tarea AS (
  SELECT
    pt.tarea_id,
    COUNT(*) FILTER (WHERE pt.estado <> 'no_aplica') AS aplicables,
    COUNT(*) FILTER (WHERE pt.estado = 'hecho') AS hechos
  FROM dilesa.proyecto_tarea_pasos pt
  WHERE pt.deleted_at IS NULL
  GROUP BY pt.tarea_id
),
avance_tarea AS (
  SELECT
    t.id AS tarea_id,
    t.proyecto_id,
    t.empresa_id,
    t.obligatoriedad_snapshot,
    CASE
      WHEN pt.aplicables IS NULL OR pt.aplicables = 0 THEN 0
      ELSE ROUND(100.0 * pt.hechos / pt.aplicables, 2)
    END AS avance_pct,
    CASE
      WHEN t.obligatoriedad_snapshot = 'obligatoria' THEN 1.0
      WHEN t.obligatoriedad_snapshot = 'condicional' THEN 0.5
      WHEN t.obligatoriedad_snapshot = 'opcional' THEN 0.0
      ELSE 1.0
    END AS peso
  FROM dilesa.proyecto_tareas t
  LEFT JOIN paso_tarea pt ON pt.tarea_id = t.id
  WHERE t.deleted_at IS NULL
)
SELECT
  proyecto_id,
  empresa_id,
  COUNT(*) FILTER (WHERE peso > 0) AS tareas_aplicables,
  COUNT(*) FILTER (WHERE peso > 0 AND avance_pct = 100) AS tareas_completadas,
  CASE
    WHEN SUM(peso) = 0 THEN 0
    ELSE ROUND(SUM(avance_pct * peso) / NULLIF(SUM(peso), 0), 2)
  END AS avance_pct
FROM avance_tarea
GROUP BY proyecto_id, empresa_id;

COMMENT ON VIEW dilesa.v_proyecto_avance IS
  'Avance del proyecto derivado de `proyecto_tarea_pasos`. Promedio ponderado por obligatoriedad de la tarea (obligatoria=1, condicional=0.5, opcional=0). Sprint 3 de dilesa-proyectos-checklist-inline.';

NOTIFY pgrst, 'reload schema';

COMMIT;
