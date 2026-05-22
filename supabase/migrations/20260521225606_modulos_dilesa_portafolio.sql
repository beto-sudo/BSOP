-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 4 — RBAC del módulo portafolio
-- ════════════════════════════════════════════════════════════════════════════
--
-- Registra en core.modulos los 2 módulos UI del schema dilesa v2:
--   • dilesa.portafolio — lista/detalle de activos
--   • dilesa.proyectos  — lista/detalle de proyectos
--
-- Reemplaza a los 4 módulos v1 (terrenos/prototipos/anteproyectos/proyectos)
-- borrados en el Sprint 1. Patrón: regla "Liberación de módulo nuevo" del
-- CLAUDE.md — INSERT en core.modulos + backfill defensivo de core.permisos_rol
-- para que los pages no se escondan a los usuarios no-admin.

BEGIN;

-- Paso 1: Insertar los 2 módulos en core.modulos (sección 'operaciones',
-- según ADR-014 Inmobiliario plegado en Operaciones para DILESA).
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT m.slug, m.nombre, m.descripcion, e.empresa_id, 'operaciones'
FROM (
  VALUES
    ('dilesa.portafolio', 'Portafolio', 'Portafolio de activos de DILESA — terrenos, lotes, locales, plazas, espectaculares y demás'),
    ('dilesa.proyectos', 'Proyectos', 'Proyectos de desarrollo e intervención sobre los activos del portafolio')
) AS m(slug, nombre, descripcion)
CROSS JOIN (SELECT id AS empresa_id FROM core.empresas WHERE slug = 'dilesa') AS e
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol. Por cada rol de DILESA × los 2
-- módulos nuevos, (lectura=true, escritura=true) para preservar el acceso
-- esperado. Sin esto, agregar los slugs a EXPECTED_DB_MODULE_SLUGS esconde
-- los pages a usuarios no-admin (canAccessModulo retorna false). Idempotente.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug IN ('dilesa.portafolio', 'dilesa.proyectos')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
