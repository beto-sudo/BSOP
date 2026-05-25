-- ============================================================================
-- DILESA · Construcción — supervisor real = usuario del sistema (no persona ERP)
-- ============================================================================
--
-- Contexto: con la nueva captura inline de tareas terminadas (click directo
-- en el círculo de la lista), el "supervisor" es quien hace click — es decir,
-- el usuario logueado. Históricamente `revisado_por_persona_id` apuntaba a
-- `erp.personas.id` porque Coda modelaba "revisor" como persona física, pero
-- en BSOP los operadores reales son usuarios del sistema (core.usuarios) que
-- no necesariamente tienen un registro en `erp.personas`.
--
-- Solución: agregamos una nueva columna `revisado_por_user_id` que referencia
-- `core.usuarios(id)` directamente. La columna histórica `revisado_por_persona_id`
-- queda como nullable para preservar la data importada de Coda (14k registros
-- con esa información). El UI prioriza el user (nuevo, fuente operativa real)
-- con fallback a la persona (legacy, data histórica).
--
-- Es una migración aditiva, nullable, sin defaults — riesgo cero.
-- ============================================================================

ALTER TABLE dilesa.construccion_tareas_terminadas
  ADD COLUMN IF NOT EXISTS revisado_por_user_id uuid
    REFERENCES core.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN dilesa.construccion_tareas_terminadas.revisado_por_user_id IS
  'Usuario del sistema (core.usuarios) que palomeó la tarea como terminada. Se '
  'setea automáticamente con auth.uid() al insertar desde la UI de captura inline '
  '(post-2026-05-25). `revisado_por_persona_id` queda como legacy para data '
  'importada de Coda.';

CREATE INDEX IF NOT EXISTS idx_ctt_revisado_por_user
  ON dilesa.construccion_tareas_terminadas(revisado_por_user_id)
  WHERE revisado_por_user_id IS NOT NULL;

-- Refresca el cache del PostgREST para que la nueva columna sea visible
-- inmediatamente vía supabase-js sin requerir reinicio del cliente.
NOTIFY pgrst, 'reload schema';
