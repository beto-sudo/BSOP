-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 4 — RBAC del módulo Ventas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Registra `dilesa.ventas` en core.modulos para la página /dilesa/ventas
-- (lista + detalle de las 1,425 ventas importadas en Fase 4). Patrón:
-- regla "Liberación de módulo nuevo" del CLAUDE.md — INSERT en core.modulos
-- + backfill defensivo de core.permisos_rol para que el page no se esconda
-- a usuarios no-admin.

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.ventas', 'Ventas', 'Ventas DILESA — comprador, unidad, pipeline de 17 fases, pagos y expediente digital', e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug = 'dilesa.ventas'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
