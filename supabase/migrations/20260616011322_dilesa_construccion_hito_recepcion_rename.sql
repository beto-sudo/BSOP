-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 1, S1a.
--
-- Marca semántica del bloque de cierre de obra. ADITIVA: NO toca nombres,
-- porcentajes, etapas, estructura de plantillas ni avance de obras en curso.
--
-- Identifica, por ID estable, cuál tarea es el CHECKLIST de recepción y cuál la
-- RECEPCIÓN final, sin depender de nombre/etapa/% (que divergen entre las 2
-- familias de prototipos). La consistencia visual del nombre se resuelve en la
-- UI derivando un label canónico de esta marca — NO se renombra/consolida en DB
-- (decisión Beto 2026-06-16: evitar el cambio estructural sobre obras en curso).
--
-- Mapeo (verificado en prod): el catálogo tiene 4 filas relevantes —
--   checklist:        b6251d2e (familia interés social) + 1fddb6e7 (residencial medio)
--   recepcion_final:  8cd3f31c (familia interés social) + 6149e030 (residencial medio)
-- El "retiro de escombro" (solo RM) queda SIN marca -> nunca entra a los hitos
-- de Atención a Clientes (es trabajo del contratista).
--
-- Preview-safe: los UPDATE son no-op si las filas no existen (Preview corre sin
-- datos de prod). La verificación post-aplicación se hace por SELECT en prod.

BEGIN;

ALTER TABLE dilesa.tareas_construccion
  ADD COLUMN IF NOT EXISTS hito_recepcion text
    CHECK (hito_recepcion IS NULL OR hito_recepcion IN ('checklist', 'recepcion_final'));

COMMENT ON COLUMN dilesa.tareas_construccion.hito_recepcion IS
  'Marca semántica del hito de Atención a Clientes (checklist | recepcion_final). '
  'La identificación del hito por obra es por esta columna, NO por nombre/etapa/%. '
  'NO afecta avance_pct: el trigger tg_construccion_avance solo escucha construccion_tareas_terminadas.';

CREATE INDEX IF NOT EXISTS tareas_construccion_hito_recepcion_idx
  ON dilesa.tareas_construccion (empresa_id, hito_recepcion)
  WHERE hito_recepcion IS NOT NULL AND deleted_at IS NULL;

-- Marcar las 4 filas (ambas familias), por id — aditivo, no toca nombres ni %.
UPDATE dilesa.tareas_construccion SET hito_recepcion = 'checklist'
  WHERE id IN ('b6251d2e-5005-437e-9711-6ffbd8c75034', '1fddb6e7-60fd-4d20-ab92-e6cde71d0a80');

UPDATE dilesa.tareas_construccion SET hito_recepcion = 'recepcion_final'
  WHERE id IN ('8cd3f31c-6d7e-427c-bcc0-e9d1743c9eeb', '6149e030-68eb-4c04-ba69-d7c3bfa1b8e9');

NOTIFY pgrst, 'reload schema';

COMMIT;
