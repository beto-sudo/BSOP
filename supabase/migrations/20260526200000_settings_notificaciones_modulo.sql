-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa notificaciones-catalogo · Sprint 3 — RBAC del módulo UI
-- ════════════════════════════════════════════════════════════════════════════
--
-- Registra `settings.notificaciones` en core.modulos para la página
-- /settings/notificaciones (catálogo de emails del sistema + log de envíos).
--
-- Bajo la empresa "Configuración" (slug `settings`, id 89e16a49-..., mismo
-- bucket que settings.acceso). Sección `sistema` — siguiendo el patrón de
-- settings.acceso (la única otra entrada `settings.*` en core.modulos).
--
-- Backfill defensivo: por cada rol asignado a la empresa `settings`, otorga
-- read+write en este módulo nuevo. Sin esto, `canAccessModulo` devuelve
-- false para no-admin (admin siempre bypasea por `fn_is_admin()`).
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT
  'settings.notificaciones',
  'Notificaciones',
  'Catálogo de emails del sistema (welcome, minutas, estimaciones, sync, etc.) con preview, edición runtime de destinatarios/subject/kill switch y log de envíos. Iniciativa notificaciones-catalogo.',
  e.id,
  'sistema'
FROM core.empresas e
WHERE e.slug = 'settings'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Backfill defensivo (admin bypassea, este permiso solo importa si en el
-- futuro se delega a roles no-admin como marketing/comms).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = e.id
WHERE e.slug = 'settings'
  AND m.slug = 'settings.notificaciones'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
