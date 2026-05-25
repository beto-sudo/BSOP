-- ============================================================================
-- DILESA · Ventas Sprint tabs-hub
--   Conversión del módulo Ventas en HUB con 5 tabs
-- ----------------------------------------------------------------------------
-- Refactor arquitectónico: `/dilesa/ventas` deja de ser una single-page
-- y pasa a ser un hub con 5 tabs hermanas (ADR-030 patrón de sub-slugs por
-- routed tabs, mismo pattern que `rdb.inventario` / `rdb.productos` /
-- `dilesa.construccion`):
--
--   /dilesa/ventas              → tab "Ventas"      (default, lista actual)
--   /dilesa/ventas/inventario   → tab "Inventario"  (movido desde top-level)
--   /dilesa/ventas/fases        → tab "Fases"       (NUEVO — pipeline view)
--   /dilesa/ventas/clientes     → tab "Clientes"    (NUEVO — KPIs)
--   /dilesa/ventas/vendedores   → tab "Vendedores"  (NUEVO — KPIs)
--
-- Cambios DB:
--   1. INSERT 5 sub-slugs nuevos en core.modulos:
--        - dilesa.ventas.lista
--        - dilesa.ventas.inventario
--        - dilesa.ventas.fases
--        - dilesa.ventas.clientes
--        - dilesa.ventas.vendedores
--   2. Backfill defensivo: clonar los permisos del padre `dilesa.ventas`
--      a cada uno de los 5 sub-slugs nuevos. Patrón ADR-030 SS3 — sin
--      esto, agregar los sub-slugs ESCONDE las tabs a no-admin users
--      (canAccessModulo retorna false para slug ausente en
--      permissions.modulos).
--   3. DELETE el slug top-level `dilesa.inventario`. Como las FKs en
--      core.permisos_rol y core.permisos_usuario_excepcion **NO tienen**
--      ON DELETE CASCADE (ver pre_migration_bootstrap.sql), borramos las
--      filas dependientes explícitamente antes de borrar el módulo. El
--      submódulo nuevo `dilesa.ventas.inventario` toma su lugar (con
--      backfill defensivo de permisos clonados desde el padre
--      `dilesa.ventas`).
--
-- Nota sobre `dilesa.ventas` (padre): se preserva como umbrella en
-- sidebar. NO se elimina ni se modifica. El sub-slug `.lista` gobierna
-- ahora el acceso real al contenido de la primera tab.
--
-- Idempotente: ON CONFLICT DO NOTHING en INSERTs; el DELETE es no-op si
-- ya corrió (slug ausente). NOTIFY pgrst al final para refrescar la
-- caché.
-- ============================================================================

BEGIN;

-- ── Sub-slugs nuevos en core.modulos ───────────────────────────────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'operaciones'
FROM core.empresas e
CROSS JOIN (VALUES
  ('dilesa.ventas.lista',
   'Ventas · Lista',
   'Tab Ventas del hub — lista filtrable de ventas activas + detalle por venta + captura Fase 1. Default landing del hub.'),
  ('dilesa.ventas.inventario',
   'Ventas · Inventario',
   'Tab Inventario del hub Ventas — catálogo de unidades disponibles (~1,590) por proyecto + precio calculado. Reemplaza el top-level dilesa.inventario.'),
  ('dilesa.ventas.fases',
   'Ventas · Fases',
   'Tab Fases del hub Ventas — vista pipeline/kanban global de las 17 fases con conteos de ventas por fase, filtrable por proyecto / vendedor / mes.'),
  ('dilesa.ventas.clientes',
   'Ventas · Clientes',
   'Tab Clientes del hub Ventas — lista de personas con ≥1 venta DILESA con KPIs (# ventas, monto total, última venta, proyectos).'),
  ('dilesa.ventas.vendedores',
   'Ventas · Vendedores',
   'Tab Vendedores del hub Ventas — lista con KPIs por vendedor (# ventas activas/cerradas, monto total, comisiones, tasa cierre).')
) AS s(slug, nombre, descripcion)
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ── Backfill defensivo de permisos ─────────────────────────────────────────
-- Clonar los permisos (acceso_lectura, acceso_escritura) del padre
-- `dilesa.ventas` a cada uno de los 5 sub-slugs nuevos. Idempotente
-- vía ON CONFLICT (rol_id, modulo_id) DO NOTHING — si ya se backfilleó
-- antes, se queda igual. Preserva 100% del status quo: estado pre-PR =
-- estado post-PR para todos los roles existentes (incluidos los 5 roles
-- de ventas con sub-slugs por fase del Sprint 7a).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent
  ON parent.id = pr.modulo_id
 AND parent.slug = 'dilesa.ventas'
JOIN core.modulos child
  ON child.empresa_id = parent.empresa_id
 AND child.slug IN (
   'dilesa.ventas.lista',
   'dilesa.ventas.inventario',
   'dilesa.ventas.fases',
   'dilesa.ventas.clientes',
   'dilesa.ventas.vendedores'
 )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── Deprecar slug top-level `dilesa.inventario` ────────────────────────────
-- Ahora vive como sub-slug `dilesa.ventas.inventario` (clonado arriba
-- desde el padre dilesa.ventas). Las FKs en core.permisos_rol y
-- core.permisos_usuario_excepcion NO tienen ON DELETE CASCADE, así que
-- limpiamos las filas dependientes antes del DELETE del módulo.
-- Idempotente: el WHERE no encuentra nada si la migración corrió antes
-- (o si el slug nunca existió, como en una preview branch fresca).
DELETE FROM core.permisos_rol
WHERE modulo_id IN (
  SELECT m.id FROM core.modulos m
  JOIN core.empresas e ON e.id = m.empresa_id
  WHERE m.slug = 'dilesa.inventario' AND e.slug = 'dilesa'
);

DELETE FROM core.permisos_usuario_excepcion
WHERE modulo_id IN (
  SELECT m.id FROM core.modulos m
  JOIN core.empresas e ON e.id = m.empresa_id
  WHERE m.slug = 'dilesa.inventario' AND e.slug = 'dilesa'
);

DELETE FROM core.modulos
WHERE slug = 'dilesa.inventario'
  AND empresa_id IN (SELECT id FROM core.empresas WHERE slug = 'dilesa');

NOTIFY pgrst, 'reload schema';

COMMIT;
