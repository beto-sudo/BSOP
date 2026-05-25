-- ============================================================================
-- DILESA · Construcción Sprint 4 — Sub-slugs de captura
-- ----------------------------------------------------------------------------
-- Introduce los 3 sub-slugs de escritura para el módulo dilesa.construccion,
-- siguiendo el patrón ADR-030 (sub-slugs). El padre `dilesa.construccion`
-- ya existe (Sprint 3) y sigue actuando como umbrella de visibilidad en
-- sidebar; los sub-slugs gobiernan acceso real a cada form de captura.
--
-- Sub-slugs:
--   - dilesa.construccion.arrancar  → captura "Arrancar construcción nueva"
--   - dilesa.construccion.tareas    → captura "Registrar tareas terminadas"
--                                      (la más frecuente — Obra/Supervisor)
--   - dilesa.construccion.contratos → captura "Crear contrato de construcción"
--
-- Backfill defensivo: clona los permisos del padre (`dilesa.construccion`)
-- a cada hijo. Sin esto, agregar los sub-slugs esconde la capacidad de
-- captura a los roles que actualmente pueden ver/escribir construcción
-- (canAccessModulo retorna false si el slug no está en permissions.modulos).
-- Idempotente: ON CONFLICT DO NOTHING.
--
-- NOTA: NO se modifica `dilesa.contratistas` — los contratos son entrada
-- del módulo construcción (vía el sub-slug .contratos), no del módulo
-- contratistas. La página de detalle de contratista solo tiene un botón
-- que lleva al form de construcción.contratos.
-- ============================================================================

BEGIN;

-- ── Sub-slugs en core.modulos ──────────────────────────────────────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'operaciones'
FROM core.empresas e
CROSS JOIN (VALUES
  ('dilesa.construccion.arrancar',
   'Construcción · Arrancar obra',
   'Sub-slug captura: arrancar nueva construcción (asigna prototipo + contratista + fecha de inicio).'),
  ('dilesa.construccion.tareas',
   'Construcción · Registrar tareas',
   'Sub-slug captura: registrar tareas terminadas con MO + revisor. Cierra el loop del avance% — al cruzar 20% el trigger marca la unidad como en_construccion para venta.'),
  ('dilesa.construccion.contratos',
   'Construcción · Crear contratos',
   'Sub-slug captura: crear contrato de construcción (contratista + lotes + valor + fianzas).')
) AS s(slug, nombre, descripcion)
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ── Backfill defensivo de permisos ─────────────────────────────────────────
-- Clonar los permisos del padre `dilesa.construccion` a cada uno de los
-- 3 nuevos sub-slugs, para que los roles que hoy tienen acceso al módulo
-- conserven esa misma capacidad de captura sin pasos manuales.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent
  ON parent.id = pr.modulo_id
 AND parent.slug = 'dilesa.construccion'
JOIN core.modulos child
  ON child.empresa_id = parent.empresa_id
 AND child.slug IN (
   'dilesa.construccion.arrancar',
   'dilesa.construccion.tareas',
   'dilesa.construccion.contratos'
 )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
