-- Sub-slugs de `dilesa.proyectos` — granularidad RBAC por sub-página.
--
-- Sprint 1 de la iniciativa `dilesa-proyectos-anteproyectos`
-- (ver docs/planning/dilesa-proyectos-anteproyectos.md):
--
-- Reestructura el módulo `dilesa.proyectos` (hoy flat) a 2 sub-tabs
-- siguiendo ADR-005 (routed tabs) + ADR-030 (submodule permissions):
--
--   - /dilesa/proyectos               → tab "Activos"       → sub-slug `dilesa.proyectos.activos`
--   - /dilesa/proyectos/anteproyectos → tab "Anteproyectos" → sub-slug `dilesa.proyectos.anteproyectos`
--
-- El padre `dilesa.proyectos` se preserva como umbrella para sidebar; los
-- sub-slugs gobiernan acceso real al contenido.
--
-- Backfill defensivo (paso 2): por cada rol con permiso al padre, clona
-- (acceso_lectura, acceso_escritura) idéntico a cada hijo. Esto preserva
-- 100% del status quo — usuarios actuales NO pierden la tab que tenían.
-- Sin esto, agregar el sub-slug ESCONDERÍA la tab a no-admin users
-- (porque canAccessModulo retorna false cuando el slug no está en
-- permissions.modulos).

BEGIN;

-- Paso 1: INSERT de los 2 sub-slugs en core.modulos.
-- Hereda empresa_id y seccion del módulo padre vía CROSS JOIN.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.proyectos.activos',       'Proyectos · Activos',       'Proyectos en curso o terminados (lo que hoy es /dilesa/proyectos)'),
    ('dilesa.proyectos.anteproyectos', 'Proyectos · Anteproyectos', 'Evaluación de viabilidad antes del arranque formal (Sprint 2+)')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.proyectos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol.
-- Por cada (rol_id, modulo_padre) con permiso, copia la misma combinación
-- (acceso_lectura, acceso_escritura) a cada modulo_hijo correspondiente.
-- Idempotente vía ON CONFLICT (rol_id, modulo_id) DO NOTHING.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id
WHERE
  parent.slug = 'dilesa.proyectos'
  AND child.slug IN (
    'dilesa.proyectos.activos',
    'dilesa.proyectos.anteproyectos'
  )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (defensivo — los tipos no cambiaron pero
-- las nuevas filas en core.modulos se exponen vía PostgREST).
NOTIFY pgrst, 'reload schema';

COMMIT;
