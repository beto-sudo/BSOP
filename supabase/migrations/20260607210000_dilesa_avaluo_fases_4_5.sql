-- Iniciativa dilesa-portafolio-activos · Sprint 7d (Fases 4 y 5 — Avalúo)
--
-- Habilita el flujo de avalúo en DILESA:
--   - Fase 4 (Solicitud de Avalúo): Gerencia Ventas asigna una casa
--     valuadora del catálogo y dispara email de solicitud.
--   - Fase 5 (Avalúo Cerrado): captura el monto del avalúo + el PDF
--     dictaminado por el valuador (rol de adjunto `avaluo_comercial`,
--     ya existente).
--
-- Cambios:
--   1. Columnas nuevas en `dilesa.ventas` (FK al valuador, fechas, idempotencia
--      del email).
--   2. Sub-slugs en `core.modulos`: `dilesa.ventas.fase04_solicitud_avaluo`
--      y `dilesa.ventas.fase05_avaluo_cerrado`.
--   3. Backfill defensivo de permisos: lectura a los roles que ya tienen
--      lectura en `dilesa.ventas`; escritura solo a Gerencia Ventas + Dirección.
--   4. Seed de los 3 valuadores iniciales en `erp.personas` con `tipo='valuador'`:
--      - "Avalúos y Asociados SA de CV" (moral, RFC AAS111209LM8)
--      - "Invalsa" (moral)
--      - "Adalberto Santos de los Santos" (física, prueba)
--   5. `NOTIFY pgrst, 'reload schema'` al final.

-- ── 1. Columnas en dilesa.ventas ─────────────────────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS valuador_id uuid REFERENCES erp.personas(id),
  ADD COLUMN IF NOT EXISTS fecha_solicitud_avaluo date,
  ADD COLUMN IF NOT EXISTS fecha_avaluo_cerrado date,
  ADD COLUMN IF NOT EXISTS notif_solicitud_avaluo_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.valuador_id IS
  'FK a erp.personas (tipo=valuador) — casa valuadora asignada al cierre de Fase 4. Reemplaza el campo legacy `casa_valuadora` (text de Coda).';
COMMENT ON COLUMN dilesa.ventas.fecha_solicitud_avaluo IS
  'Fecha en que Gerencia Ventas envió la solicitud al valuador (cierre de Fase 4).';
COMMENT ON COLUMN dilesa.ventas.fecha_avaluo_cerrado IS
  'Fecha en que el valuador entregó el avalúo y se capturó en BSOP (cierre de Fase 5).';
COMMENT ON COLUMN dilesa.ventas.notif_solicitud_avaluo_at IS
  'Timestamp del email de solicitud — idempotencia para evitar dobles envíos si la captura se re-intenta.';

-- ── 2. Sub-slugs en core.modulos ─────────────────────────────────────────────
-- Patrón ADR-030: cada sub-página de captura tiene su sub-slug. Los sub-slugs
-- viven en la misma sección que el módulo padre `dilesa.ventas`.

DO $$
DECLARE
  v_empresa_id uuid;
  v_seccion text;
BEGIN
  SELECT id INTO v_empresa_id FROM core.empresas WHERE slug = 'dilesa';
  SELECT seccion INTO v_seccion FROM core.modulos
    WHERE empresa_id = v_empresa_id AND slug = 'dilesa.ventas' LIMIT 1;

  INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
  VALUES
    ('dilesa.ventas.fase04_solicitud_avaluo',
     'Ventas — Fase 4 (Solicitud de Avalúo)',
     'Captura de la solicitud de avalúo: Gerencia Ventas asigna casa valuadora y dispara email.',
     v_empresa_id, v_seccion),
    ('dilesa.ventas.fase05_avaluo_cerrado',
     'Ventas — Fase 5 (Avalúo Cerrado)',
     'Captura del avalúo entregado: monto dictaminado + PDF del avalúo comercial.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 3. Backfill defensivo de permisos ────────────────────────────────────────
-- Lectura para todos los roles que ya tienen lectura en `dilesa.ventas`.
-- Escritura SOLO para "Gerencia Ventas" + "Dirección" (decisión Beto: ellos
-- capturan; los demás roles solo ven el estado en el pipeline).

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  pr.rol_id,
  m_new.id,
  true AS acceso_lectura,
  (r.nombre IN ('Gerencia Ventas', 'Dirección')) AS acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_old
  ON m_old.id = pr.modulo_id
 AND m_old.slug = 'dilesa.ventas'
JOIN core.roles r
  ON r.id = pr.rol_id
CROSS JOIN core.modulos m_new
WHERE m_new.slug IN ('dilesa.ventas.fase04_solicitud_avaluo', 'dilesa.ventas.fase05_avaluo_cerrado')
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── 4. Permitir tipo='valuador' en erp.personas ──────────────────────────────
-- El check constraint original solo aceptaba ['empleado','proveedor','cliente',
-- 'accionista','contratista','general']. Agregamos 'valuador' como séptimo
-- tipo válido para que el seed de Casa Valuadora + Beto pueda insertarse.

ALTER TABLE erp.personas DROP CONSTRAINT IF EXISTS personas_tipo_check;
ALTER TABLE erp.personas ADD CONSTRAINT personas_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'empleado'::text,
    'proveedor'::text,
    'cliente'::text,
    'accionista'::text,
    'contratista'::text,
    'general'::text,
    'valuador'::text
  ]));

-- ── 5. Seed de valuadores iniciales ──────────────────────────────────────────
-- 3 registros con `tipo='valuador'`. Idempotente: NOT EXISTS por (empresa_id,
-- tipo, nombre) evita duplicados si la migración se re-corre.

INSERT INTO erp.personas (
  empresa_id, tipo, tipo_persona, nombre, email, rfc, domicilio
)
SELECT
  e.id, 'valuador', 'moral',
  'Avalúos y Asociados SA de CV',
  'fotoscentral.aya@gmail.com',
  'AAS111209LM8',
  'C. Armando Meléndez No. 398 Col. Las Margaritas C.P. 27130 Torreón, Coah.'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id AND p.tipo = 'valuador'
      AND p.nombre = 'Avalúos y Asociados SA de CV'
  );

INSERT INTO erp.personas (
  empresa_id, tipo, tipo_persona, nombre, email
)
SELECT
  e.id, 'valuador', 'moral',
  'Invalsa',
  'jabier_lu@yahoo.com.mx'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id AND p.tipo = 'valuador'
      AND p.nombre = 'Invalsa'
  );

INSERT INTO erp.personas (
  empresa_id, tipo, tipo_persona, nombre, apellido_paterno, apellido_materno, email
)
SELECT
  e.id, 'valuador', 'fisica',
  'Adalberto', 'Santos', 'de los Santos',
  'beto@anorte.com'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id AND p.tipo = 'valuador'
      AND p.nombre = 'Adalberto'
      AND p.apellido_paterno = 'Santos'
  );

-- ── 5. Refrescar PostgREST ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
