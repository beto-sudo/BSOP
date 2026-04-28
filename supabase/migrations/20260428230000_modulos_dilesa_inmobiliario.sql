-- Inserta los 4 módulos faltantes de DILESA Inmobiliario en core.modulos +
-- backfill defensivo de permisos preservando el status quo.
--
-- Contexto: hasta ahora `/dilesa/terrenos`, `/dilesa/prototipos`,
-- `/dilesa/anteproyectos` y `/dilesa/proyectos` no tenían entry en
-- `ROUTE_TO_MODULE` (lib/permissions.ts), por lo que el filtro del sidebar
-- (`components/app-shell/sidebar.tsx`) los consideraba "siempre visibles"
-- para usuarios con acceso a la empresa DILESA — sin granularidad por
-- módulo.
--
-- Sprint 2 de la iniciativa `modulos-catalog` cierra ese gap:
--   1. Insertar las 4 filas en core.modulos (sección 'operaciones',
--      según ADR-014 Inmobiliario plegado en Operaciones para DILESA).
--   2. Update ROUTE_TO_MODULE con los 4 slugs (en este mismo PR).
--   3. Backfill defensivo: por cada rol existente en DILESA, insertar
--      core.permisos_rol con (read=true, write=true) para los 4 módulos.
--      Esto preserva el comportamiento actual — sin esta cláusula los
--      pages se ESCONDERÍAN a no-admin users tras el cambio en código.

BEGIN;

-- Paso 1: Insertar los 4 módulos en core.modulos.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT m.slug, m.nombre, m.descripcion, e.empresa_id, 'operaciones'
FROM (
  VALUES
    ('dilesa.terrenos', 'Terrenos', 'Catálogo de terrenos del banco de tierra DILESA'),
    ('dilesa.prototipos', 'Prototipos', 'Diseños prototipo reusables para proyectos inmobiliarios'),
    ('dilesa.anteproyectos', 'Anteproyectos', 'Anteproyectos inmobiliarios — fase de diseño preliminar'),
    ('dilesa.proyectos', 'Proyectos', 'Proyectos inmobiliarios en desarrollo activo')
) AS m(slug, nombre, descripcion)
CROSS JOIN (SELECT id AS empresa_id FROM core.empresas WHERE slug = 'dilesa') AS e
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol para preservar status quo.
-- Inserta (read=true, write=true) para cada rol existente en DILESA × los
-- 4 módulos nuevos. Idempotente vía ON CONFLICT.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug IN (
    'dilesa.terrenos',
    'dilesa.prototipos',
    'dilesa.anteproyectos',
    'dilesa.proyectos'
  )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (no DDL pero por consistencia).
NOTIFY pgrst, 'reload schema';

COMMIT;
