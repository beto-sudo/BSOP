-- ╭─ 20260625140306_core_usuarios_directorio ─╮
-- Directorio mínimo de usuarios (id + nombre) legible por cualquier autenticado.
--
-- Problema: `core.usuarios` tiene RLS self-only (`usuarios_select_own`: solo ves
-- tu propia fila por email), así que los módulos cliente que resuelven nombres de
-- OTROS usuarios (solicitante de una requisición, autor, asignado…) los muestran
-- en BLANCO. Es sistémico: ~15 componentes leen `core.usuarios` desde el browser
-- y todos fallan igual para nombres de terceros, sin un estándar compartido.
--
-- Solución: una vista security-definer (`security_invoker = false`) que expone
-- SOLO `id + nombre + activo` (no email, rol, ni nada sensible) de todos los
-- usuarios, bypaseando el RLS self-only de la tabla base. Son nombres de
-- compañeros de trabajo en una herramienta interna → exposición de bajo riesgo y
-- deliberada. Los módulos cliente resuelven nombres desde aquí en vez de
-- `core.usuarios`. No toca la tabla ni su RLS.

BEGIN;

CREATE OR REPLACE VIEW core.v_usuarios_directorio
WITH (security_invoker = false) AS
SELECT
  u.id,
  NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS nombre,
  u.activo
FROM core.usuarios u;

COMMENT ON VIEW core.v_usuarios_directorio IS
  'Directorio mínimo (id + nombre + activo) legible por autenticados; bypasea el RLS self-only de core.usuarios para resolver nombres de terceros en el cliente. Solo nombres, sin datos sensibles.';

REVOKE ALL ON core.v_usuarios_directorio FROM PUBLIC;
GRANT SELECT ON core.v_usuarios_directorio TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
