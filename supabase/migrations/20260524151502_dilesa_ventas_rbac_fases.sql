-- ============================================================================
-- DILESA · Ventas Sprint 7a — RBAC por fase + ownership de vendedor
-- ----------------------------------------------------------------------------
-- 1. **17 sub-slugs** en `core.modulos` (uno por fase del pipeline) bajo el
--    umbrella `dilesa.ventas`. Cada uno representa "puede capturar la fase X"
--    y se gestiona en la UI de roles (/settings/acceso/<rol>).
--
-- 2. **5 roles nuevos** en `core.roles` para DILESA: Vendedor, Gerencia Ventas,
--    Administración, Contabilidad, Obra. (Ya existían: Dirección = el Comité +
--    Maribel = legacy multi-empresa).
--
-- 3. **Matriz de permisos default** según
--    `docs/planning/dilesa-ventas-captura.md`:
--    - Dirección (Comité): todas las 17 fases
--    - Vendedor: fases 1, 3, 7, 8, 15
--    - Gerencia Ventas: fases 2, 17
--    - Administración: fases 4-11
--    - Contabilidad: fases 12, 13, 16
--    - Obra: fase 14
--    - Maribel: igual a Dirección (admin operativo cross-empresa)
--
-- 4. **vendedor_usuario_id** en `dilesa.ventas` (uuid → core.usuarios) para
--    que el RLS pueda filtrar "vendedor ve solo sus propias ventas".
--
-- 5. **RLS policy** actualizada: vendedor ve solo ventas asignadas a su
--    usuario. Otros roles ven todas las ventas de DILESA.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- ── Sub-slugs por fase ──────────────────────────────────────────────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT f.slug, f.nombre, f.descripcion, e.id, 'operaciones'
FROM core.empresas e
CROSS JOIN (VALUES
  ('dilesa.ventas.fase01_solicitud',          'Ventas · 01 Solicitud de Asignación',     'Captura inicial: cliente + unidad + tipo de crédito'),
  ('dilesa.ventas.fase02_asignada',           'Ventas · 02 Asignada',                    'Autorización + KYC/PLD'),
  ('dilesa.ventas.fase03_formalizada',        'Ventas · 03 Formalizada',                 'Firma del contrato promesa'),
  ('dilesa.ventas.fase04_solicitud_avaluo',   'Ventas · 04 Solicitud de Avalúo',         'Solicitud al perito'),
  ('dilesa.ventas.fase05_avaluo_cerrado',     'Ventas · 05 Avalúo Cerrado',              'PDF del avalúo + monto'),
  ('dilesa.ventas.fase06_inscrita',           'Ventas · 06 Inscrita',                    'Registro público'),
  ('dilesa.ventas.fase07_solicitud_dictamen', 'Ventas · 07 Solicitud de Dictaminación',  'Crédito al banco'),
  ('dilesa.ventas.fase08_dictaminada',        'Ventas · 08 Dictaminada',                 'Aprobación bancaria + constancias'),
  ('dilesa.ventas.fase09_validacion_patronal','Ventas · 09 Validación Patronal',         'Infonavit/Fovissste validation'),
  ('dilesa.ventas.fase10_firmas_programadas', 'Ventas · 10 Firmas Programadas',          'Calendario con notario'),
  ('dilesa.ventas.fase11_escriturada',        'Ventas · 11 Escriturada',                 'Escritura + pagaré'),
  ('dilesa.ventas.fase12_detonada',           'Ventas · 12 Detonada',                    'Pago del banco recibido'),
  ('dilesa.ventas.fase13_facturada',          'Ventas · 13 Facturada',                   'Factura emitida'),
  ('dilesa.ventas.fase14_preparada_entrega',  'Ventas · 14 Preparada para Entrega',      'Pre-entrega de obra'),
  ('dilesa.ventas.fase15_entregada',          'Ventas · 15 Entregada',                   'Entrega final al cliente'),
  ('dilesa.ventas.fase16_comision_pagada',    'Ventas · 16 Comisión Pagada',             'Pago de comisión al vendedor'),
  ('dilesa.ventas.fase17_operacion_terminada','Ventas · 17 Operación Terminada',         'Cierre formal')
) AS f(slug, nombre, descripcion)
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ── Roles nuevos ────────────────────────────────────────────────────────────
INSERT INTO core.roles (nombre, empresa_id, descripcion)
SELECT nr.nombre, e.id, nr.descripcion
FROM core.empresas e
CROSS JOIN (VALUES
  ('Vendedor',         'Capturador de Solicitud, Formalización, Dictaminación, Entrega. Ve solo sus propias ventas.'),
  ('Gerencia Ventas',  'Autoriza Asignaciones y cierra operaciones terminadas.'),
  ('Administración',   'Fases administrativas: Avalúo, Inscripción, Dictamen, Validación Patronal, Firmas, Escrituración.'),
  ('Contabilidad',     'Detonación, Facturación, Pago de Comisiones.'),
  ('Obra',             'Pre-entrega de obra.')
) AS nr(nombre, descripcion)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.roles existing
    WHERE existing.empresa_id = e.id AND existing.nombre = nr.nombre
  );

-- ── Matriz de permisos default ──────────────────────────────────────────────
-- Helper inline: insertar permiso (rol_nombre, slug)
WITH dilesa AS (SELECT id FROM core.empresas WHERE slug = 'dilesa'),
matriz(rol_nombre, slug) AS (VALUES
  -- Vendedor
  ('Vendedor', 'dilesa.ventas'),
  ('Vendedor', 'dilesa.ventas.fase01_solicitud'),
  ('Vendedor', 'dilesa.ventas.fase03_formalizada'),
  ('Vendedor', 'dilesa.ventas.fase07_solicitud_dictamen'),
  ('Vendedor', 'dilesa.ventas.fase08_dictaminada'),
  ('Vendedor', 'dilesa.ventas.fase15_entregada'),
  -- Gerencia Ventas
  ('Gerencia Ventas', 'dilesa.ventas'),
  ('Gerencia Ventas', 'dilesa.ventas.fase02_asignada'),
  ('Gerencia Ventas', 'dilesa.ventas.fase17_operacion_terminada'),
  -- Administración
  ('Administración', 'dilesa.ventas'),
  ('Administración', 'dilesa.ventas.fase04_solicitud_avaluo'),
  ('Administración', 'dilesa.ventas.fase05_avaluo_cerrado'),
  ('Administración', 'dilesa.ventas.fase06_inscrita'),
  ('Administración', 'dilesa.ventas.fase08_dictaminada'),
  ('Administración', 'dilesa.ventas.fase09_validacion_patronal'),
  ('Administración', 'dilesa.ventas.fase10_firmas_programadas'),
  ('Administración', 'dilesa.ventas.fase11_escriturada'),
  -- Contabilidad
  ('Contabilidad', 'dilesa.ventas'),
  ('Contabilidad', 'dilesa.ventas.fase12_detonada'),
  ('Contabilidad', 'dilesa.ventas.fase13_facturada'),
  ('Contabilidad', 'dilesa.ventas.fase16_comision_pagada'),
  -- Obra
  ('Obra', 'dilesa.ventas'),
  ('Obra', 'dilesa.ventas.fase14_preparada_entrega'),
  -- Dirección (Comité) + Maribel (legacy admin): TODAS las fases
  ('Dirección', 'dilesa.ventas'),
  ('Dirección', 'dilesa.ventas.fase01_solicitud'),
  ('Dirección', 'dilesa.ventas.fase02_asignada'),
  ('Dirección', 'dilesa.ventas.fase03_formalizada'),
  ('Dirección', 'dilesa.ventas.fase04_solicitud_avaluo'),
  ('Dirección', 'dilesa.ventas.fase05_avaluo_cerrado'),
  ('Dirección', 'dilesa.ventas.fase06_inscrita'),
  ('Dirección', 'dilesa.ventas.fase07_solicitud_dictamen'),
  ('Dirección', 'dilesa.ventas.fase08_dictaminada'),
  ('Dirección', 'dilesa.ventas.fase09_validacion_patronal'),
  ('Dirección', 'dilesa.ventas.fase10_firmas_programadas'),
  ('Dirección', 'dilesa.ventas.fase11_escriturada'),
  ('Dirección', 'dilesa.ventas.fase12_detonada'),
  ('Dirección', 'dilesa.ventas.fase13_facturada'),
  ('Dirección', 'dilesa.ventas.fase14_preparada_entrega'),
  ('Dirección', 'dilesa.ventas.fase15_entregada'),
  ('Dirección', 'dilesa.ventas.fase16_comision_pagada'),
  ('Dirección', 'dilesa.ventas.fase17_operacion_terminada'),
  ('Maribel', 'dilesa.ventas'),
  ('Maribel', 'dilesa.ventas.fase01_solicitud'),
  ('Maribel', 'dilesa.ventas.fase02_asignada'),
  ('Maribel', 'dilesa.ventas.fase03_formalizada'),
  ('Maribel', 'dilesa.ventas.fase04_solicitud_avaluo'),
  ('Maribel', 'dilesa.ventas.fase05_avaluo_cerrado'),
  ('Maribel', 'dilesa.ventas.fase06_inscrita'),
  ('Maribel', 'dilesa.ventas.fase07_solicitud_dictamen'),
  ('Maribel', 'dilesa.ventas.fase08_dictaminada'),
  ('Maribel', 'dilesa.ventas.fase09_validacion_patronal'),
  ('Maribel', 'dilesa.ventas.fase10_firmas_programadas'),
  ('Maribel', 'dilesa.ventas.fase11_escriturada'),
  ('Maribel', 'dilesa.ventas.fase12_detonada'),
  ('Maribel', 'dilesa.ventas.fase13_facturada'),
  ('Maribel', 'dilesa.ventas.fase14_preparada_entrega'),
  ('Maribel', 'dilesa.ventas.fase15_entregada'),
  ('Maribel', 'dilesa.ventas.fase16_comision_pagada'),
  ('Maribel', 'dilesa.ventas.fase17_operacion_terminada')
)
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM matriz x
JOIN core.roles r ON r.nombre = x.rol_nombre AND r.empresa_id = (SELECT id FROM dilesa)
JOIN core.modulos m ON m.slug = x.slug AND m.empresa_id = (SELECT id FROM dilesa)
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── vendedor_usuario_id ─────────────────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS vendedor_usuario_id uuid REFERENCES core.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dilesa_ventas_vendedor_usuario_idx
  ON dilesa.ventas (vendedor_usuario_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN dilesa.ventas.vendedor_usuario_id IS
  'Vendedor (core.usuarios.id) dueño de la venta. Si el usuario consultante tiene rol "Vendedor" y NO admin, RLS filtra ventas donde vendedor_usuario_id = auth.uid().';

-- ── RLS: vendedor ve solo sus ventas ────────────────────────────────────────
-- Función helper: ¿el usuario actual tiene rol Vendedor (y NO es admin) en
-- la empresa DILESA? Si sí, se le filtra.
CREATE OR REPLACE FUNCTION dilesa.fn_es_vendedor_restringido()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM core.usuarios_empresas ue
    JOIN core.roles r ON r.id = ue.rol_id
    JOIN core.empresas e ON e.id = ue.empresa_id
    JOIN core.usuarios u ON u.id = ue.usuario_id
    WHERE u.id = auth.uid()
      AND e.slug = 'dilesa'
      AND r.nombre = 'Vendedor'
      AND u.rol <> 'admin'
  );
$$;

COMMENT ON FUNCTION dilesa.fn_es_vendedor_restringido() IS
  'TRUE si el usuario actual tiene rol "Vendedor" en DILESA y no es admin global. Usado por RLS de dilesa.ventas para restringir a sus propias ventas.';

-- Reemplazar SELECT policy de ventas
DROP POLICY IF EXISTS ventas_select ON dilesa.ventas;
CREATE POLICY ventas_select ON dilesa.ventas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
    AND (
      NOT dilesa.fn_es_vendedor_restringido()
      OR vendedor_usuario_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
