-- ╭─ 20260702034030_modulos_dilesa_portafolio_prediales ─╮
-- Iniciativa `dilesa-portafolio-predios` · S3 — sub-slug RBAC
-- `dilesa.portafolio.prediales` para el tab Prediales del hub Portafolio
-- (ADR-030). Hereda empresa/sección del padre `dilesa.portafolio` +
-- backfill defensivo de permisos (clona lectura/escritura de cada rol con
-- permiso al padre) — sin esto el tab quedaría oculto a no-admins.
-- Plantilla: 20260509162620_modulos_subscope_permissions.sql.

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.portafolio.prediales', 'Portafolio · Prediales',
     'Control anual de impuesto predial por cuenta catastral')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.portafolio'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.portafolio'
  AND child.slug = 'dilesa.portafolio.prediales'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
