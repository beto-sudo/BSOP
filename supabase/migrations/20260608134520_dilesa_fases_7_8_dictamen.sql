-- ╭─ 20260608134520_dilesa_fases_7_8_dictamen ─╮
-- Sprint 7f — Fase 7 (Solicitud de Dictaminación) + Fase 8 (Dictaminada).
--
-- Habilita el flujo de dictamen notarial:
--   - Fase 7 (Solicitud de Dictaminación): Gerencia Ventas selecciona
--     notario del catálogo y dispara email con magic link.
--   - Fase 8 (Dictaminada): el notario sube la Carta de Instrucción
--     Notarial desde el magic link (sin login) — eso cierra F8
--     automáticamente. Fallback: Gerencia Ventas captura manualmente.
--
-- Patrón análogo al avalúo (Sprint 7d/7d-magic-link). Reusa
-- `AVALUO_UPLOAD_SECRET` para HMAC del token; el payload del token
-- distingue por `purpose='dictamen_upload_v1'`.
--
-- Cambios:
--   1. 4 columnas nuevas en `dilesa.ventas`: notario_id, fecha_solicitud_dictamen,
--      fecha_dictaminada, notif_solicitud_dictamen_at.
--   2. 2 sub-slugs nuevos en core.modulos.
--   3. Permitir tipo='notario' en erp.personas (mismo patrón que valuador).
--   4. Seed: 20 notarios + Beto (prueba). Algunos sin email — el dropdown
--      lo marca como "(falta email)" para que Beto sepa que la solicitud
--      hay que mandarla en papel/PDF impreso a esa notaría.
--   5. Backfill RBAC: lectura todos, escritura Gerencia Ventas + Dirección.

BEGIN;

-- ── 1. Columnas en dilesa.ventas ─────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS notario_id uuid REFERENCES erp.personas(id),
  ADD COLUMN IF NOT EXISTS fecha_solicitud_dictamen date,
  ADD COLUMN IF NOT EXISTS fecha_dictaminada date,
  ADD COLUMN IF NOT EXISTS notif_solicitud_dictamen_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.notario_id IS
  'FK a erp.personas (tipo=notario) — notaría asignada al cierre de Fase 7. Reemplaza el campo legacy `notario` (text de Coda).';
COMMENT ON COLUMN dilesa.ventas.fecha_solicitud_dictamen IS
  'Fecha en que Gerencia Ventas envió la solicitud al notario (cierre de Fase 7).';
COMMENT ON COLUMN dilesa.ventas.fecha_dictaminada IS
  'Fecha en que el notario entregó la Carta de Instrucción Notarial (cierre de Fase 8).';
COMMENT ON COLUMN dilesa.ventas.notif_solicitud_dictamen_at IS
  'Timestamp del email de solicitud — idempotencia para evitar dobles envíos.';

-- ── 2. Sub-slugs en core.modulos ─────────────────────────────────────────
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
    ('dilesa.ventas.fase07_solicitud_dictamen',
     'Ventas — Fase 7 (Solicitud de Dictaminación)',
     'Asignación de notario + envío de solicitud por correo. Soporta magic link para que el notario suba el dictamen sin login.',
     v_empresa_id, v_seccion),
    ('dilesa.ventas.fase08_dictaminada',
     'Ventas — Fase 8 (Dictaminada)',
     'Captura del dictamen notarial (Carta de Instrucción Notarial). Cierra automáticamente cuando el notario sube via magic link; captura manual como fallback.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 3. Permitir tipo='notario' en erp.personas ───────────────────────────
ALTER TABLE erp.personas DROP CONSTRAINT IF EXISTS personas_tipo_check;
ALTER TABLE erp.personas ADD CONSTRAINT personas_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'empleado'::text,
    'proveedor'::text,
    'cliente'::text,
    'accionista'::text,
    'contratista'::text,
    'general'::text,
    'valuador'::text,
    'notario'::text
  ]));

-- ── 4. Seed de notarios (Coda + Beto prueba) ─────────────────────────────
-- Mantengo 20 entradas de Coda tal cual (incluye duplicados y typos para
-- preservar referencia histórica; Beto los limpia con SQL después).
-- Los notarios sin email NO se omiten — el dropdown los muestra con
-- "(falta email)" para que el operador sepa que ese contacto va offline.
-- Idempotente con NOT EXISTS por (empresa, tipo, nombre).

INSERT INTO erp.personas (empresa_id, tipo, tipo_persona, nombre, email, telefono)
SELECT e.id, 'notario', 'fisica', n.nombre,
       NULLIF(n.email, '') AS email,
       NULLIF(n.telefono, '') AS telefono
FROM core.empresas e
CROSS JOIN (VALUES
  ('Lic. Noelia Angeles Moreno 19', '', ''),
  ('Francisco Cedillo', '', ''),
  ('notaria 10 imss', '', ''),
  ('Lic. Heriberto Fuentes Maciel', '', ''),
  ('Lic. Jesus Mario Flores Garza', '', ''),
  ('Lic. Hermilo J. Ramos Hilario', '', ''),
  ('Lic. Francisco Javier Cedillo', '', ''),
  ('Lic. Jesus Mario Flores Farias', '', ''),
  ('Lic. Raul P. Garcia Elizondo', '', ''),
  ('Lic. Hugo Gonzalez', 'hugo@notario15.com', '8787822150'),
  ('Lic. Dulce Jimenez', 'djimenez@jimenezasociado.com.mx', '8787821322'),
  ('Lic. Guillermo Lopez Elizondo', 'notaria25pn@gmail.com', '8787840074'),
  ('Lic. Nicanor Moyeda', 'notariapublica13@hotmail.com', '8787822844'),
  ('Lic. Felipe A. Gonzalez Rodriguez', 'notaria222013@gmail.com', '8666333700'),
  ('Lic. Ma. Inmaculada del Rosario Martinez Ortegon',
   'njuridico@n13saltillo.com', '8444308437'),
  ('Lic. Humberto Salinas', 'salinasainley@hotmail.com', '8781237870'),
  ('Lic. Antonio Muela', 'muela84@hotmail.com', '8666321955'),
  ('Lic. Alejo Emanuel Saucedo', 'notariopublico16@hotmail.com', '8787030093'),
  ('Lic. Noelia Angeles Moreno', 'nava_notaria19@hotmail.com', '8626245555'),
  ('Marisa Jauregui', '', '')
) AS n(nombre, email, telefono)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id AND p.tipo = 'notario' AND p.nombre = n.nombre
  );

-- Beto como notario de prueba (mismo email del valuador — para probar
-- el flujo end-to-end desde su inbox).
INSERT INTO erp.personas (
  empresa_id, tipo, tipo_persona, nombre, apellido_paterno, apellido_materno, email
)
SELECT e.id, 'notario', 'fisica',
       'Adalberto', 'Santos', 'de los Santos',
       'beto@anorte.com'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id AND p.tipo = 'notario'
      AND p.nombre = 'Adalberto' AND p.apellido_paterno = 'Santos'
  );

-- ── 5. Backfill defensivo de permisos ────────────────────────────────────
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
WHERE m_new.slug IN (
        'dilesa.ventas.fase07_solicitud_dictamen',
        'dilesa.ventas.fase08_dictaminada'
      )
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
