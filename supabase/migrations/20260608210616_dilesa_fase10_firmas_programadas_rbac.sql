-- ╭─ 20260608210616_dilesa_fase10_firmas_programadas_rbac ─╮
-- Sprint 7h — Fase 10 (Firmas Programadas), PR1.
--
-- Programa la fecha + hora de firma acordada con el notario y habilita la
-- Póliza de Garantía PDF. Crédito directo + pagaré van en PR2.
--
-- Cambios:
--   1. dilesa.ventas: fecha_firma_programada + hora_firma_programada.
--   2. core.empresas: registro_infonavit + telefono + email_contacto
--      (datos del desarrollador para la Póliza de Garantía; los llena Beto).
--   3. Sub-slug dilesa.ventas.fase10_firmas_programadas + backfill RBAC.

BEGIN;

-- ── 1. Columnas de firma en dilesa.ventas ────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS fecha_firma_programada date,
  ADD COLUMN IF NOT EXISTS hora_firma_programada time;

COMMENT ON COLUMN dilesa.ventas.fecha_firma_programada IS
  'Fecha de firma acordada con el notario (cierre de Fase 10 — Firmas Programadas).';
COMMENT ON COLUMN dilesa.ventas.hora_firma_programada IS
  'Hora de firma acordada con el notario (cierre de Fase 10).';

-- ── 2. Datos del desarrollador para la Póliza de Garantía ────────────────
-- Generales en core.empresas (nullable). DILESA los llena; el PDF los lee.
-- registro_infonavit = número de registro del oferente (ej. "10160308").
ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS registro_infonavit text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email_contacto text;

COMMENT ON COLUMN core.empresas.registro_infonavit IS
  'Número de registro del desarrollador/oferente ante Infonavit. Aparece en la Póliza de Garantía.';
COMMENT ON COLUMN core.empresas.telefono IS
  'Teléfono de contacto del desarrollador (documentos comerciales/legales).';
COMMENT ON COLUMN core.empresas.email_contacto IS
  'Email de contacto público del desarrollador (documentos comerciales/legales).';

-- ── 3. Sub-slug en core.modulos ──────────────────────────────────────────
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
    ('dilesa.ventas.fase10_firmas_programadas',
     'Ventas — Fase 10 (Firmas Programadas)',
     'Programación de fecha/hora de firma con el notario + Póliza de Garantía. Lista y totaliza los depósitos del cliente.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 4. Backfill defensivo de permisos ────────────────────────────────────
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
WHERE m_new.slug = 'dilesa.ventas.fase10_firmas_programadas'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
