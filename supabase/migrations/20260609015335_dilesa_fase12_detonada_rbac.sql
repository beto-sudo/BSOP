-- ╭─ 20260609015335_dilesa_fase12_detonada_rbac ─╮
-- Sprint 7j — Fase 12 (Detonada).
--
-- (Aplicada a prod vía MCP apply_migration por drift de historial heredado
--  de RUV; versión = ledger remoto.)
--
-- "Detonar" el crédito = la institución libera el recurso y DILESA recibe el
-- depósito. Se registra la fecha (y el monto recibido) y se sube el
-- comprobante del depósito (rol `imagen_detonacion`, ya en FASE_ROLES).
--
-- Cambios:
--   1. dilesa.ventas: fecha_detonacion + monto_detonado.
--   2. Sub-slug dilesa.ventas.fase12_detonada + backfill RBAC.

BEGIN;

-- ── 1. Columnas de detonación ────────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS fecha_detonacion date,
  ADD COLUMN IF NOT EXISTS monto_detonado numeric;

COMMENT ON COLUMN dilesa.ventas.fecha_detonacion IS
  'Fecha en que la institución detonó el crédito y DILESA recibió el depósito (cierre de Fase 12).';
COMMENT ON COLUMN dilesa.ventas.monto_detonado IS
  'Monto del depósito recibido al detonar el crédito. Parte de la cuadratura de la operación.';

-- ── 2. Sub-slug en core.modulos ──────────────────────────────────────────
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
    ('dilesa.ventas.fase12_detonada',
     'Ventas — Fase 12 (Detonada)',
     'Registro de la detonación del crédito: fecha + monto del depósito recibido + comprobante.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 3. Backfill defensivo de permisos ────────────────────────────────────
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  pr.rol_id,
  m_new.id,
  true AS acceso_lectura,
  (r.nombre IN ('Gerencia Ventas', 'Dirección', 'Contabilidad')) AS acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_old
  ON m_old.id = pr.modulo_id
 AND m_old.slug = 'dilesa.ventas'
JOIN core.roles r
  ON r.id = pr.rol_id
CROSS JOIN core.modulos m_new
WHERE m_new.slug = 'dilesa.ventas.fase12_detonada'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
