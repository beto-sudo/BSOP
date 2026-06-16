-- ╭─ 20260616224318_dilesa_construccion_avance_estado_terminada ─╮
-- Invariante de avance: una obra cuyo estado físico es post-terminación
-- (terminada/dtu/seguro_calidad/extraida) vale 100% de avance, aunque queden
-- tareas administrativas de la plantilla sin cerrar. Antes el avance se
-- calculaba SOLO por tareas terminadas y el estado se marca a mano, así que
-- obras terminadas/DTU quedaban atascadas en 97.53%/99.86%. El fix previo
-- (#594) fue un backfill one-shot que no persistió. Aquí se blinda por DB:
--   1. fn_calcular_avance_construccion: estado post-obra ⇒ 100 (fuente única).
--   2. trigger en construccion: al marcar estado post-obra ⇒ avance 100.
--   3. backfill de las obras actuales mal sincronizadas.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- 1) Fuente única del cálculo: si la obra física ya terminó (estado post-obra),
--    el avance es 100; si no, suma ponderada de tareas terminadas (igual que hoy).
--    Partido de la versión viva en prod (pg_get_functiondef) + el CASE nuevo.
CREATE OR REPLACE FUNCTION dilesa.fn_calcular_avance_construccion(p_construccion_id uuid)
  RETURNS numeric
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog', 'dilesa', 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT c.estado FROM dilesa.construccion c WHERE c.id = p_construccion_id)
         = ANY (ARRAY['terminada', 'dtu', 'seguro_calidad', 'extraida'])
      THEN 100::numeric(6, 2)
    ELSE COALESCE((
      SELECT SUM(pt.porcentaje_costo * 100)
      FROM dilesa.construccion_tareas_terminadas ctt
      JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
      WHERE ctt.construccion_id = p_construccion_id
        AND ctt.deleted_at IS NULL
        AND pt.deleted_at IS NULL
    ), 0)::numeric(6, 2)
  END;
$function$;

-- 2) Trigger que mantiene el invariante cuando se marca el estado (sin tocar
--    tareas): al pasar a un estado post-obra, fuerza avance_pct = 100.
CREATE OR REPLACE FUNCTION dilesa.fn_tg_construccion_estado_avance()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'dilesa', 'public'
AS $function$
BEGIN
  -- El paperwork administrativo pendiente no baja el avance de una obra cuya
  -- construcción física ya terminó.
  IF NEW.estado = ANY (ARRAY['terminada', 'dtu', 'seguro_calidad', 'extraida'])
     AND COALESCE(NEW.avance_pct, 0) < 100 THEN
    NEW.avance_pct := 100;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_construccion_estado_avance ON dilesa.construccion;
CREATE TRIGGER tg_construccion_estado_avance
  BEFORE INSERT OR UPDATE OF estado ON dilesa.construccion
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_tg_construccion_estado_avance();

-- 3) Backfill: obras ya en estado post-obra con avance < 100 → 100.
--    (No dispara el trigger de arriba porque es UPDATE de avance_pct, no de estado.)
UPDATE dilesa.construccion
SET avance_pct = 100
WHERE deleted_at IS NULL
  AND estado = ANY (ARRAY['terminada', 'dtu', 'seguro_calidad', 'extraida'])
  AND avance_pct < 100;

COMMIT;
