-- ╭─ 20260609030045_dilesa_fase13_facturada_rbac ─╮
-- Sprint 7k — Fase 13 (Facturada).
--
-- (Aplicada a prod vía MCP apply_migration por drift de historial heredado
--  de RUV; versión = ledger remoto.)
--
-- Contabilidad registra la facturación: sube PDFs (factura, nota de crédito,
-- aviso PLD) y captura los montos de cuadratura. (valor_escrituracion ya
-- existía.) Los depósitos de la operación se muestran como referencia (CxC).
--
-- Espejo de Coda (fase "Facturada"):
--   - Valor Real Venta Dilesa  → valor_real_venta_dilesa
--   - Valor Facturado          → valor_facturado
--   - Monto Nota de Credito    → monto_nota_credito
--
-- Cambios:
--   1. dilesa.ventas: 3 columnas de montos.
--   2. Sub-slug dilesa.ventas.fase13_facturada + backfill RBAC.

BEGIN;

-- ── 1. Columnas de montos de facturación ─────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS valor_real_venta_dilesa numeric,
  ADD COLUMN IF NOT EXISTS valor_facturado numeric,
  ADD COLUMN IF NOT EXISTS monto_nota_credito numeric;

COMMENT ON COLUMN dilesa.ventas.valor_real_venta_dilesa IS
  'Valor real de la venta DILESA (Coda: "Valor Real Venta Dilesa"). Cuadratura de Fase 13.';
COMMENT ON COLUMN dilesa.ventas.valor_facturado IS
  'Valor facturado (Coda: "Valor Facturado"). Cierre de Fase 13.';
COMMENT ON COLUMN dilesa.ventas.monto_nota_credito IS
  'Monto de la nota de crédito (Coda: "Monto Nota de Credito").';

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
    ('dilesa.ventas.fase13_facturada',
     'Ventas — Fase 13 (Facturada)',
     'Registro de la facturación: PDFs (factura, nota de crédito, aviso PLD) + montos de cuadratura. Muestra los depósitos de la operación como referencia.',
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
WHERE m_new.slug = 'dilesa.ventas.fase13_facturada'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
