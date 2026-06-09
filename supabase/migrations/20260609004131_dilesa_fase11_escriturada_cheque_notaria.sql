-- ╭─ 20260609004131_dilesa_fase11_escriturada_cheque_notaria ─╮
-- Sprint 7i — Fase 11 (Escriturada).
--
-- (Aplicada a prod vía MCP apply_migration por drift de historial heredado
--  de la migración RUV `…221845`/`…214309`; versión = ledger remoto.)
--
-- Tras la firma en notaría, Dirección registra fecha de escritura + el cheque
-- enviado a la notaría (número + monto). El monto entra a la cuadratura de la
-- operación. Nombres espejo de Coda: "Numero Cheque Notaria" / "Monto Cheque
-- Notaria".
--
-- (fecha_escritura, numero_escritura, gastos_escrituracion ya existían.)
--
-- Cambios:
--   1. dilesa.ventas: numero_cheque_notaria + monto_cheque_notaria.
--   2. Sub-slug dilesa.ventas.fase11_escriturada + backfill RBAC.

BEGIN;

-- ── 1. Columnas de cheque a la notaría ───────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS numero_cheque_notaria text,
  ADD COLUMN IF NOT EXISTS monto_cheque_notaria numeric;

COMMENT ON COLUMN dilesa.ventas.numero_cheque_notaria IS
  'Número del cheque enviado a la notaría para la escrituración (Coda: "Numero Cheque Notaria"). Cierre de Fase 11.';
COMMENT ON COLUMN dilesa.ventas.monto_cheque_notaria IS
  'Monto del cheque enviado a la notaría (Coda: "Monto Cheque Notaria"). Parte de la cuadratura de la operación.';

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
    ('dilesa.ventas.fase11_escriturada',
     'Ventas — Fase 11 (Escriturada)',
     'Registro de la escrituración: fecha de escritura + cheque enviado a la notaría (número y monto).',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 3. Backfill defensivo de permisos ────────────────────────────────────
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
WHERE m_new.slug = 'dilesa.ventas.fase11_escriturada'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
