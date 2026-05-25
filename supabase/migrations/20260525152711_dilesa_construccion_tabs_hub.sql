-- ============================================================================
-- DILESA · Construcción Sprint tabs+prototipos
--   Conversión del módulo Construcción en HUB con 4 tabs
-- ----------------------------------------------------------------------------
-- Refactor arquitectónico: `/dilesa/construccion` deja de ser una single-page
-- y pasa a ser un hub con 4 tabs hermanas (ADR-030 patrón de sub-slugs por
-- routed tabs, mismo pattern que `rdb.inventario` / `rdb.productos`):
--
--   /dilesa/construccion              → tab "Obras"        (default, lo que ya estaba)
--   /dilesa/construccion/contratos    → tab "Contratos"     (NUEVO)
--   /dilesa/construccion/contratistas → tab "Contratistas"  (movido desde top-level)
--   /dilesa/construccion/prototipos   → tab "Prototipos"    (NUEVO)
--
-- Cambios DB:
--   1. INSERT 3 sub-slugs nuevos en core.modulos:
--        - dilesa.construccion.obras
--        - dilesa.construccion.contratistas
--        - dilesa.construccion.prototipos
--      (El sub-slug `dilesa.construccion.contratos` YA EXISTE — se creó en
--      Sprint 4 para el form de captura. ON CONFLICT lo deja igual; ahora
--      gobierna tanto el form como la lista/detalle del tab.)
--   2. Backfill defensivo: clonar los permisos del padre `dilesa.construccion`
--      a cada uno de los 3 sub-slugs nuevos. Patrón ADR-030 SS3 — sin esto,
--      agregar los sub-slugs ESCONDE las tabs a no-admin users (canAccessModulo
--      retorna false para slug ausente en permissions.modulos).
--   3. DELETE el slug top-level `dilesa.contratistas`. Como las FKs en
--      core.permisos_rol y core.permisos_usuario_excepcion **NO tienen**
--      ON DELETE CASCADE (ver pre_migration_bootstrap.sql), borramos las
--      filas dependientes explícitamente antes de borrar el módulo. El
--      submódulo nuevo `dilesa.construccion.contratistas` toma su lugar.
--
-- Idempotente: ON CONFLICT DO NOTHING en INSERTs; el DELETE es no-op si ya
-- corrió (slug ausente). NOTIFY pgrst al final para refrescar la caché.
-- ============================================================================

BEGIN;

-- ── Sub-slugs nuevos en core.modulos ───────────────────────────────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'operaciones'
FROM core.empresas e
CROSS JOIN (VALUES
  ('dilesa.construccion.obras',
   'Construcción · Obras',
   'Tab Obras del hub Construcción — lista de construcciones activas con avance, contratista y fechas críticas. Default landing del hub.'),
  ('dilesa.construccion.contratistas',
   'Construcción · Contratistas',
   'Tab Contratistas del hub Construcción — catálogo con KPIs (obras en curso/terminadas, MO ejecutado, REPSE, retención). Reemplaza el top-level dilesa.contratistas.'),
  ('dilesa.construccion.prototipos',
   'Construcción · Prototipos',
   'Tab Prototipos del hub Construcción — modelos de vivienda con planos JSONB + plantilla de tareas + costo MO calculado a partir del último precio MO/m² histórico.')
) AS s(slug, nombre, descripcion)
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Nota: el sub-slug `dilesa.construccion.contratos` ya existe (Sprint 4 —
-- ver migración 20260525024233_dilesa_construccion_subslugs_captura.sql).
-- No se reinserta porque ON CONFLICT (empresa_id, slug) DO NOTHING.
-- Ahora gobierna tanto la captura (form) como la lectura (lista/detalle).

-- ── Backfill defensivo de permisos ─────────────────────────────────────────
-- Clonar los permisos (acceso_lectura, acceso_escritura) del padre
-- `dilesa.construccion` a cada uno de los 3 sub-slugs nuevos. Idempotente
-- vía ON CONFLICT (rol_id, modulo_id) DO NOTHING — si ya se backfilleó
-- antes, se queda igual. Preserva 100% del status quo: estado pre-PR =
-- estado post-PR para todos los roles existentes.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent
  ON parent.id = pr.modulo_id
 AND parent.slug = 'dilesa.construccion'
JOIN core.modulos child
  ON child.empresa_id = parent.empresa_id
 AND child.slug IN (
   'dilesa.construccion.obras',
   'dilesa.construccion.contratistas',
   'dilesa.construccion.prototipos'
 )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── Deprecar slug top-level `dilesa.contratistas` ──────────────────────────
-- Ahora vive como sub-slug `dilesa.construccion.contratistas` (clonado
-- arriba). Las FKs en core.permisos_rol y core.permisos_usuario_excepcion
-- NO tienen ON DELETE CASCADE, así que limpiamos las filas dependientes
-- antes del DELETE del módulo. Idempotente: el WHERE no encuentra nada
-- si la migración corrió antes (o si el slug nunca existió, como en una
-- preview branch fresca).
DELETE FROM core.permisos_rol
WHERE modulo_id IN (
  SELECT m.id FROM core.modulos m
  JOIN core.empresas e ON e.id = m.empresa_id
  WHERE m.slug = 'dilesa.contratistas' AND e.slug = 'dilesa'
);

DELETE FROM core.permisos_usuario_excepcion
WHERE modulo_id IN (
  SELECT m.id FROM core.modulos m
  JOIN core.empresas e ON e.id = m.empresa_id
  WHERE m.slug = 'dilesa.contratistas' AND e.slug = 'dilesa'
);

DELETE FROM core.modulos
WHERE slug = 'dilesa.contratistas'
  AND empresa_id IN (SELECT id FROM core.empresas WHERE slug = 'dilesa');

NOTIFY pgrst, 'reload schema';

COMMIT;
