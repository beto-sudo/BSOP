-- MIGRATION: rdb-productos-categorias Sprint 1 — sub-slug RBAC rdb.productos.categorias
--
-- CONTEXTO:
--   La iniciativa rdb-productos-categorias agrega una tab "Categorías" al
--   módulo Productos (/rdb/productos) — catálogo navegable de las
--   categorías de productos. Patrón ADR-005/ADR-030 (routed tabs con
--   sub-slug RBAC por tab).
--
-- ALCANCE:
--   1. Sub-slug `rdb.productos.categorias` en core.modulos, heredando
--      empresa_id + seccion del padre `rdb.productos` vía CROSS JOIN.
--   2. Backfill defensivo de core.permisos_rol: por cada rol con permiso
--      al padre `rdb.productos`, clonar (acceso_lectura, acceso_escritura)
--      al sub-slug nuevo. Sin esto la tab queda oculta a los no-admin
--      (canAccessModulo retorna false cuando el slug no está en
--      permissions.modulos).
--
--   Mismo patrón que la migración 20260509162620 que creó los otros 4
--   sub-slugs de productos. Idempotente vía ON CONFLICT. No-op en
--   branches sin datos (Supabase Preview): el CROSS JOIN / JOIN al padre
--   ausente produce 0 filas.

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('rdb.productos.categorias', 'Productos · Categorías', 'Catálogo navegable de categorías de productos')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'rdb.productos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'rdb.productos'
  AND child.slug = 'rdb.productos.categorias'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
