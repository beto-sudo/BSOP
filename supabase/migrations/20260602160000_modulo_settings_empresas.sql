-- ════════════════════════════════════════════════════════════════════════════
-- Módulo RBAC `settings.empresas` — acceso delegado a Configuración → Empresas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora /settings/empresas (listado + detalle) vivía detrás de
-- `<RequireAccess adminOnly>`: o eras admin global y veías TODAS las empresas,
-- o no entrabas. No había forma de delegar el módulo a un usuario no-admin ni
-- de acotar qué empresas ve.
--
-- Esta migración registra el módulo `settings.empresas` en `core.modulos` para
-- que la página se gobierne por RBAC (igual que `settings.acceso` y
-- `settings.notificaciones`). Con el módulo en su lugar, un admin puede
-- delegarlo desde /settings/acceso — vía rol o vía "Excepción de módulo" por
-- usuario (lectura). El filtro de qué empresas ve cada quien lo aplica la UI a
-- partir de `core.usuarios_empresas` (las empresas a las que el usuario tiene
-- acceso); ver app/settings/empresas/page.tsx.
--
-- Bajo la empresa "Configuración" (slug `settings`), sección `sistema` — mismo
-- bucket que `settings.acceso` / `settings.notificaciones`.
--
-- ── Sin backfill de permisos_rol (a propósito) ──────────────────────────────
-- El comportamiento previo era admin-only. El default correcto al introducir
-- el módulo es CERRADO: ningún no-admin lo obtiene automáticamente (admin sigue
-- entrando por `core.fn_is_admin()` / bypass de permisos). Esto PRESERVA el
-- status quo. La delegación es deliberada y manual, empresa por empresa, desde
-- /settings/acceso. (La RLS de las tablas sensibles del detalle —
-- empresa_socios, gobierno_*, empresa_documentos — ya aísla por empresa vía
-- `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`, así que el delegado
-- solo lee gobierno/cuadro accionario de las empresas que tiene asignadas.)
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT
  'settings.empresas',
  'Empresas',
  'Datos fiscales, branding, cuadro accionario, gobierno corporativo y actas de cada empresa. El acceso se acota a las empresas asignadas al usuario en core.usuarios_empresas.',
  e.id,
  'sistema'
FROM core.empresas e
WHERE e.slug = 'settings'
ON CONFLICT (empresa_id, slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
