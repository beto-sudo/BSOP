-- ╭─ 20260611213221_modulos_saldos_bancos_subslugs ─╮
-- Iniciativa: conciliacion-bancaria · v0 — sub-slugs RBAC para el módulo
-- Saldos Bancos al ganar su segunda tab ("Estados de cuenta"), según ADR-030
-- (módulo con routed tabs → 1 sub-slug por tab desde el inicio).
--
-- `dilesa.saldos-bancos` se preserva como umbrella (visibilidad en sidebar);
-- los sub-slugs gobiernan acceso al contenido de cada tab:
--   /dilesa/saldos-bancos          → dilesa.saldos-bancos.saldos
--   /dilesa/saldos-bancos/estados  → dilesa.saldos-bancos.estados
--
-- Backfill defensivo: por cada rol con permiso al padre, clonar el mismo
-- (acceso_lectura, acceso_escritura) a cada hijo — preserva el status quo
-- (sin esto, los sub-slugs ESCONDERÍAN las tabs a usuarios no-admin).
-- Plantilla: 20260509162620_modulos_subscope_permissions.sql

BEGIN;

-- Paso 1: sub-slugs heredando empresa_id y seccion del padre.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.saldos-bancos.saldos',  'Saldos Bancos · Saldos',           'Captura de saldo por cuenta con historial'),
    ('dilesa.saldos-bancos.estados', 'Saldos Bancos · Estados de cuenta', 'Archivo mensual de estados de cuenta y conciliación')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.saldos-bancos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: backfill defensivo de permisos_rol (clonar permisos del padre).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.saldos-bancos'
  AND child.slug IN ('dilesa.saldos-bancos.saldos', 'dilesa.saldos-bancos.estados')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
