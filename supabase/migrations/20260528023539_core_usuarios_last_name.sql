-- ============================================================================
-- core.usuarios — agregar last_name
-- ----------------------------------------------------------------------------
-- Beto detectó que el ASESOR DE VENTAS en la Solicitud de Asignación de
-- DILESA solo mostraba el primer nombre. core.usuarios tenía solo
-- `first_name`. Agregamos `last_name` para que los documentos legales
-- (contrato, solicitud, FICU, etc.) puedan imprimir nombre completo.
--
-- Cambios:
--   1. Columna `last_name text` (NULL permitido). Sin DEFAULT — los
--      registros existentes quedan en NULL y Beto los carga via la UI
--      de Settings → Acceso (editor que se agrega en este mismo PR).
--   2. Reload schema cache de PostgREST.
--
-- Retro-compatible: callers que no leen `last_name` siguen funcionando.
-- Los renders de nombre completo concatenan `first_name + ' ' + last_name`
-- con fallback a solo `first_name` si `last_name IS NULL`.
--
-- Iniciativa: `dilesa-prelaunch-audit` · Fase 1 paridad Coda (PRs #565+#566+este).
-- ============================================================================

BEGIN;

ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN core.usuarios.last_name IS
  'Apellido(s) del usuario. Combinado con first_name forma el nombre completo que aparece en documentos legales (contratos, solicitudes, FICU). NULL hasta que el admin lo cargue desde Settings → Acceso.';

NOTIFY pgrst, 'reload schema';

COMMIT;
