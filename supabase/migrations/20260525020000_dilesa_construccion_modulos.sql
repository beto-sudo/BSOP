-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-construccion · Sprint 3 — RBAC de los módulos
--   Construcción + Contratistas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Registra `dilesa.construccion` y `dilesa.contratistas` en core.modulos
-- para las páginas /dilesa/construccion y /dilesa/contratistas (lista +
-- detalle, lectura pura — captura entra en Sprint 4).
--
-- Patrón: regla "Liberación de módulo nuevo" del CLAUDE.md — INSERT en
-- core.modulos + backfill defensivo de core.permisos_rol para que el page
-- no se esconda a usuarios no-admin. Sin backfill, `canAccessModulo`
-- regresa false para el slug nuevo (no aparece en `permissions.modulos`)
-- y la página queda 403 hasta corregir manualmente cada rol.
--
-- Sección 'operaciones' — mismo bucket que ventas/inventario (módulos
-- operativos DILESA). El nav-config los pone en grupo "Inmobiliario"
-- (visual del sidebar), pero la taxonomía RBAC (ADR-014) los agrupa en
-- 'operaciones'. Ver migración 20260524173055_dilesa_inventario_modulo.sql
-- como template idéntico.
--
-- Idempotente: ON CONFLICT DO NOTHING en ambas inserts.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Registro de los dos módulos ────────────────────────────────────────────

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.construccion', 'Construcción', 'Avance de obra por lote — pivot central del módulo Construcción (ADR-032). Lista + detalle: contratista, contrato, fechas críticas, tareas pendientes/terminadas, mano de obra.', e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.contratistas', 'Contratistas', 'Catálogo de contratistas con KPIs (efectividad, MO ejecutado, obras en curso/terminadas, REPSE, retención).', e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ── Backfill defensivo de permisos ────────────────────────────────────────
--
-- Cada rol existente de DILESA × cada módulo nuevo, read+write por default
-- (las páginas son lectura pura en Sprint 3; los flags de write se afinarán
-- cuando Sprint 4 introduzca los forms de captura con sub-slugs propios).

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug IN ('dilesa.construccion', 'dilesa.contratistas')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
