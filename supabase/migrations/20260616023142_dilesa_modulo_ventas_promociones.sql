-- ╭─ 20260616023142_dilesa_modulo_ventas_promociones ─╮
-- Iniciativa `dilesa-descuentos-promos` · Sprint 2 — catálogo de promociones.
--
-- Libera el sub-slug `dilesa.ventas.promociones` (6º tab del hub de Ventas,
-- ADR-030) que gobierna el acceso a la página de administración del catálogo
-- de promociones (alta/baja/vigencia/monto). Hereda empresa_id + seccion del
-- padre `dilesa.ventas`. Backfill defensivo: clona los permisos del padre a
-- cada rol, así nadie que ya veía el hub de Ventas pierde la tab nueva (el
-- WRITE se gatea en la página a Dirección/admin, como en Cuadratura).
--
-- Solo data (filas en core.modulos + core.permisos_rol); no cambia schema.

BEGIN;

-- Paso 1: sub-slug como módulo hijo (hereda empresa_id + seccion del padre).
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT
  'dilesa.ventas.promociones',
  'Ventas · Promociones',
  'Catálogo de promociones/bonos (tope de descuento autorizado por prototipo)',
  parent.empresa_id,
  parent.seccion
FROM core.modulos parent
WHERE parent.slug = 'dilesa.ventas'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: backfill defensivo de permisos_rol — clona (lectura, escritura) del
-- padre a la tab nueva. Sin esto, agregar el sub-slug ESCONDE la tab a los
-- no-admin (canAccessModulo → false). Idempotente vía ON CONFLICT.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.ventas'
  AND child.slug = 'dilesa.ventas.promociones'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
