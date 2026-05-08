-- MIGRATION: Empresas — eliminar "Coda" y renombrar "Familia / Grupo SR" → "SANREN"
--
-- CONTEXTO:
--   core.empresas tenía 13 filas; dos eran "huérfanas" del catálogo de
--   contribuyentes:
--     - "Coda" (slug 'coda'): fila legacy sin RFC ni uso real (0 modulos,
--       0 documentos, 0 roles, 0 permisos_excepcion, 0 audit_log).
--     - "Familia / Grupo SR" (slug 'familia'): grupo lógico patrimonial.
--       Renombrada a SANREN porque ahí va a vivir todo lo familiar.
--
--   "Configuración" (slug 'settings') se queda intencionalmente: ancla del
--   módulo RBAC `settings.acceso`. La UI de /settings/empresas la oculta.

-- 1) Renombrar Familia/Grupo SR → SANREN
UPDATE core.empresas
SET nombre = 'SANREN', slug = 'sanren'
WHERE slug = 'familia';

-- 2) Eliminar Coda (1 self-grant en usuarios_empresas + fila empresa)
DELETE FROM core.usuarios_empresas
WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'coda');

DELETE FROM core.empresas
WHERE slug = 'coda';

NOTIFY pgrst, 'reload schema';
