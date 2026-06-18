-- Sub-slugs Pipeline + Estado de cuenta del expediente de venta DILESA.
--
-- Iniciativa `dilesa-ventas-expediente-tabs` (Sprint 2, ADR-005/ADR-030).
-- Pipeline y Estado de cuenta salen del tab Operación (donde vivían como
-- `Section` en el Sprint 1) a tab propio con URL:
--
--   /dilesa/ventas/[id]/pipeline       → dilesa.ventas.pipeline
--   /dilesa/ventas/[id]/estado-cuenta  → dilesa.ventas.estado_cuenta
--
-- Mismo patrón que los 4 sub-slugs del Sprint 1
-- (20260618155211_modulos_dilesa_ventas_expediente_tabs.sql): gate fino por
-- tab, padre umbrella `dilesa.ventas`. Backfill defensivo clonando permisos de
-- `dilesa.ventas.lista` (quien ve la lista de ventas ve el expediente completo)
-- — sin él, los sub-slugs ESCONDERÍAN el tab a no-admins (canAccessModulo →
-- false). El gate de escritura sobre CxC en Estado de cuenta vive en las RPCs
-- financieras + sus propios slugs, no aquí.

BEGIN;

-- Paso 1: Sub-slugs. Heredan empresa_id y seccion del primer tab del hub
-- (`dilesa.ventas.lista`) vía CROSS JOIN — mismo hub, misma sección.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.ventas.pipeline',      'Ventas · Pipeline',       'Las 17 fases del pipeline de la venta con sus documentos'),
    ('dilesa.ventas.estado_cuenta', 'Ventas · Estado de cuenta', 'Cuentas por cobrar de la venta: cargos, abonos y saldo')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.ventas.lista'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol. Por cada (rol, dilesa.ventas.lista)
-- con permiso, copiar la misma combinación a cada sub-slug nuevo.
-- Idempotente vía ON CONFLICT (rol_id, modulo_id) DO NOTHING.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.ventas.lista'
  AND child.slug IN ('dilesa.ventas.pipeline', 'dilesa.ventas.estado_cuenta')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
