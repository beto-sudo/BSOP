-- Liga explícita entre avances (erp.task_updates) y juntas (erp.juntas).
--
-- Problema: cuando dos juntas de la misma empresa están abiertas en paralelo,
-- sus ventanas temporales se solapan y los avances caen en ambas minutas.
-- Fix: columna explícita task_updates.junta_id, poblada automáticamente por
-- trigger desde core.usuarios.junta_activa_id del usuario que creó el avance.
-- La "junta activa" se setea al entrar a la pantalla de una junta en_curso.
--
-- Registros históricos ambiguos (caen en más de una junta al mismo tiempo)
-- se dejan con junta_id NULL a propósito — el query de minuta tiene fallback
-- temporal para que sigan apareciendo en ambas como hoy.

-- 1) Columna junta_id en task_updates
ALTER TABLE erp.task_updates
  ADD COLUMN IF NOT EXISTS junta_id uuid REFERENCES erp.juntas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_updates_junta_id
  ON erp.task_updates (junta_id)
  WHERE junta_id IS NOT NULL;

-- 2) Columna junta_activa_id en core.usuarios
ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS junta_activa_id uuid REFERENCES erp.juntas(id) ON DELETE SET NULL;

-- 3) Trigger BEFORE INSERT que auto-popula junta_id desde la junta activa
--    del usuario cuando el cliente no lo pasa explícito. Inserts desde UI
--    de tareas (módulo general, quick-progress, detail) se benefician sin
--    cambios en el cliente.
CREATE OR REPLACE FUNCTION erp.task_updates_set_junta_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.junta_id IS NULL AND NEW.creado_por IS NOT NULL THEN
    SELECT u.junta_activa_id
      INTO NEW.junta_id
      FROM core.usuarios u
     WHERE u.id = NEW.creado_por;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_updates_set_junta_id_trg ON erp.task_updates;
CREATE TRIGGER task_updates_set_junta_id_trg
  BEFORE INSERT ON erp.task_updates
  FOR EACH ROW EXECUTE FUNCTION erp.task_updates_set_junta_id();

-- 4) Backfill: asigna junta_id a históricos donde el timestamp cae en
--    EXACTAMENTE una junta de esa empresa. Los ambiguos se quedan NULL.
WITH matches AS (
  SELECT tu.id AS tu_id, j.id AS junta_id
    FROM erp.task_updates tu
    JOIN erp.juntas j
      ON j.empresa_id = tu.empresa_id
     AND tu.created_at >= j.fecha_hora
     AND (j.fecha_terminada IS NULL OR tu.created_at <= j.fecha_terminada)
   WHERE tu.junta_id IS NULL
),
counts AS (
  SELECT tu_id, COUNT(*) AS n
    FROM matches
   GROUP BY tu_id
),
unambiguous AS (
  SELECT m.tu_id, m.junta_id
    FROM matches m
    JOIN counts c ON c.tu_id = m.tu_id
   WHERE c.n = 1
)
UPDATE erp.task_updates tu
   SET junta_id = u.junta_id
  FROM unambiguous u
 WHERE tu.id = u.tu_id;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
