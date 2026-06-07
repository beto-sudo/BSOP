-- Iniciativa: tesoreria · Sprint 1 — schema + carga de cuentas DILESA
-- Módulo Saldos Bancos: captura de saldo por cuenta con historial (snapshots).
-- Ver docs/planning/tesoreria.md

-- Historial de saldos: 1 snapshot por captura por cuenta (audit trail, no se edita)
CREATE TABLE IF NOT EXISTS erp.cuenta_saldos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas (id),
  cuenta_id     uuid NOT NULL REFERENCES erp.cuentas_bancarias (id),
  fecha         date NOT NULL DEFAULT current_date,
  saldo         numeric NOT NULL,
  capturado_por uuid,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cuenta_saldos_cuenta_fecha_idx
  ON erp.cuenta_saldos (cuenta_id, fecha DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS cuenta_saldos_empresa_idx
  ON erp.cuenta_saldos (empresa_id);

-- RLS canónica erp: aislamiento por empresa (patrón de erp.cuentas_bancarias)
ALTER TABLE erp.cuenta_saldos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_cuenta_saldos_select ON erp.cuenta_saldos;
CREATE POLICY erp_cuenta_saldos_select ON erp.cuenta_saldos FOR SELECT
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_cuenta_saldos_insert ON erp.cuenta_saldos;
CREATE POLICY erp_cuenta_saldos_insert ON erp.cuenta_saldos FOR INSERT
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_cuenta_saldos_update ON erp.cuenta_saldos;
CREATE POLICY erp_cuenta_saldos_update ON erp.cuenta_saldos FOR UPDATE
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_cuenta_saldos_delete ON erp.cuenta_saldos;
CREATE POLICY erp_cuenta_saldos_delete ON erp.cuenta_saldos FOR DELETE
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- Último saldo conocido por cuenta (lo que lee el correo al Consejo, bloque #1)
CREATE OR REPLACE VIEW erp.v_cuenta_saldo_actual WITH (security_invoker = on) AS
SELECT DISTINCT ON (cs.cuenta_id)
  cs.cuenta_id,
  cs.empresa_id,
  cb.banco,
  cb.nombre,
  cb.moneda_id,
  cs.saldo,
  cs.fecha       AS fecha_saldo,
  cs.created_at  AS capturado_at
FROM erp.cuenta_saldos cs
JOIN erp.cuentas_bancarias cb ON cb.id = cs.cuenta_id
ORDER BY cs.cuenta_id, cs.fecha DESC, cs.created_at DESC;

-- Carga de las 4 cuentas DILESA (solo nombres; moneda/número/CLABE/saldo los
-- captura Beto después). JOIN a core.empresas + NOT EXISTS para idempotencia y
-- robustez al Preview branch (que corre sin datos de prod).
INSERT INTO erp.cuentas_bancarias (empresa_id, nombre, banco, activo)
SELECT e.id, x.nombre, x.banco, true
FROM core.empresas e
CROSS JOIN (VALUES
  ('BBVA Bancomer',          'BBVA Bancomer'),
  ('BBVA Bancomer Dólares',  'BBVA Bancomer'),
  ('Casa de Bolsa Finamex',  'Finamex'),
  ('Monex Grupo Financiero', 'Monex')
) AS x (nombre, banco)
WHERE e.nombre ILIKE '%dilesa%'
  AND NOT EXISTS (
    SELECT 1 FROM erp.cuentas_bancarias cb
    WHERE cb.empresa_id = e.id AND cb.nombre = x.nombre
  );

NOTIFY pgrst, 'reload schema';
