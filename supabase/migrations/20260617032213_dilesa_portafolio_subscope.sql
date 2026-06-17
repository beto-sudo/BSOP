-- ╭─ 20260617032213_dilesa_portafolio_subscope ─╮
-- Iniciativa dilesa-portafolio-expediente · hub de tabs (ADR-030).
--
-- Convierte el módulo Portafolio en hub con 2 tabs:
--   /dilesa/portafolio            → tab "Inventario"  (dilesa.portafolio.inventario)
--   /dilesa/portafolio/evaluacion → tab "Evaluación"  (dilesa.portafolio.evaluacion)
--
-- Crea los 2 sub-slugs heredando seccion/empresa_id del padre `dilesa.portafolio`
-- (que sigue de umbrella en el sidebar) + backfill defensivo de permisos: clona
-- al sub-slug los permisos que cada rol ya tenía sobre el padre, para NO esconder
-- el módulo a quien ya lo veía. Patrón de 20260509162620_modulos_subscope_permissions.
--
-- Aditiva (sub-slugs + permisos clonados). No toca el padre ni datos.

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.portafolio.inventario', 'Portafolio · Inventario', 'Todos los activos del portafolio (lista, filtros, KPIs, ficha)'),
    ('dilesa.portafolio.evaluacion', 'Portafolio · Evaluación', 'Terrenos en evaluación de compra (pipeline de adquisición)')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.portafolio'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Backfill defensivo: cada rol que ve el padre ve también los sub-slugs.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.portafolio'
  AND child.slug IN ('dilesa.portafolio.inventario', 'dilesa.portafolio.evaluacion')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
