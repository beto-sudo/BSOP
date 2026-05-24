-- ============================================================================
-- DILESA · Inventario — sub-slug RBAC
-- ----------------------------------------------------------------------------
-- Vista operativa de unidades disponibles para venta. Distinta de Portafolio
-- (vista patrimonial). Cualquier rol de Ventas (Vendedor, Gerencia,
-- Administración) + Comité + Maribel pueden ver. Vendedor ve TODAS las
-- unidades disponibles aquí (no restringido por vendedor_usuario_id como en
-- la lista de ventas).
--
-- Lectura pura — no escribe nada (las acciones "Asignar a cliente" redirigen
-- al form de Solicitud que ya tiene su propio sub-slug RBAC).
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.inventario', 'Inventario', 'Unidades disponibles para venta: precio actual, características, días en inventario.', e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, false
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug = 'dilesa.inventario'
  AND r.nombre IN ('Vendedor', 'Gerencia Ventas', 'Administración', 'Contabilidad', 'Obra', 'Dirección', 'Maribel')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
