-- Sub-slugs del expediente de venta DILESA = routed tabs del detalle.
--
-- Iniciativa `dilesa-ventas-expediente-tabs` (Sprint 1, ADR-005/ADR-030). El
-- detalle `/dilesa/ventas/[id]` deja de ser un page scroll-largo con tabs en
-- `useState` y pasa a routed tabs montados en un layout compartido (los tabs
-- persisten al capturar una fase). Cada tab gana su sub-slug de RBAC:
--
--   /dilesa/ventas/[id]            → dilesa.ventas.operacion   (landing)
--   /dilesa/ventas/[id]/cuadratura → dilesa.ventas.cuadratura
--   /dilesa/ventas/[id]/documentos → dilesa.ventas.documentos
--   /dilesa/ventas/[id]/bitacora   → dilesa.ventas.bitacora
--
-- El padre umbrella sigue siendo `dilesa.ventas`; estos sub-slugs gobiernan el
-- acceso real a cada tab (gate fino en cada page, SS5). El layout además
-- conserva el gate umbrella `dilesa.ventas.lista` para el expediente completo.
--
-- Backfill defensivo (paso 2): por cada rol con permiso a `dilesa.ventas.lista`
-- (quien ve la lista de ventas y por ende el detalle), clonar
-- (acceso_lectura, acceso_escritura) idéntico a cada sub-slug nuevo. Sin esto,
-- agregar el sub-slug ESCONDERÍA el tab a no-admins (canAccessModulo → false).
-- El control de escritura fino (buckets de descuento solo Dirección en
-- Cuadratura) vive en la UI (canWrite), no en el permiso de módulo.

BEGIN;

-- Paso 1: Sub-slugs del expediente. Heredan empresa_id y seccion del primer
-- tab del hub (`dilesa.ventas.lista`) vía CROSS JOIN — mismo hub, misma sección.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.ventas.operacion',  'Ventas · Operación',  'Expediente de operación de la venta (copiloto, pipeline, estado de cuenta)'),
    ('dilesa.ventas.cuadratura', 'Ventas · Cuadratura', 'Cuadratura financiera de la operación'),
    ('dilesa.ventas.documentos', 'Ventas · Documentos', 'Expediente documental de la venta'),
    ('dilesa.ventas.bitacora',   'Ventas · Bitácora',   'Bitácora de fases cerradas de la venta')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.ventas.lista'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol. Por cada (rol, dilesa.ventas.lista)
-- con permiso, copiar la misma combinación a cada sub-slug del expediente.
-- Idempotente vía ON CONFLICT (rol_id, modulo_id) DO NOTHING.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.ventas.lista'
  AND child.slug IN (
    'dilesa.ventas.operacion',
    'dilesa.ventas.cuadratura',
    'dilesa.ventas.documentos',
    'dilesa.ventas.bitacora'
  )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (las nuevas filas en core.modulos se exponen
-- vía PostgREST; los tipos no cambiaron).
NOTIFY pgrst, 'reload schema';

COMMIT;
