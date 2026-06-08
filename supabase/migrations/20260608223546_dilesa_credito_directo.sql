-- ╭─ 20260608223546_dilesa_credito_directo ─╮
-- Crédito directo + pagaré (Sprint 7h, PR2 de Fase 10).
--
-- (Aplicada a prod vía MCP apply_migration por drift de historial con una
--  migración paralela `20260608221845_dilesa_ruv_modulo` de otra sesión; la
--  versión coincide con el ledger remoto.)
--
-- Cuando el crédito de la institución + los depósitos no cubren el precio,
-- DILESA puede otorgar un crédito directo por el saldo, documentado con un
-- pagaré (un solo pagaré por el saldo, con plan de pagos a varias fechas).
--
-- Campos en dilesa.ventas:
--   - monto_credito_directo: saldo financiado por DILESA.
--   - cd_plan_pagos (jsonb): [{ num, fecha, monto }] — vencimientos editables.
--   - cd_tiie28_pct: TIIE a 28 días vigente a la suscripción (base del moratorio).
--   - cd_spread_moratorio_pct: puntos sobre TIIE (default 4, editable a más).
--   - cd_interes_ordinario_pct: interés ordinario anual (default 0).
--   - cd_fecha_suscripcion: fecha de suscripción del pagaré.
--   - cd_aval_nombre / cd_aval_domicilio: aval opcional (respaldo).
--
-- El pagaré firmado se sube como adjunto rol `pagare_credito_directo` al
-- cerrar la fase. Reusa el sub-slug fase10 (sin RBAC nuevo).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS monto_credito_directo numeric,
  ADD COLUMN IF NOT EXISTS cd_plan_pagos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cd_tiie28_pct numeric,
  ADD COLUMN IF NOT EXISTS cd_spread_moratorio_pct numeric DEFAULT 4,
  ADD COLUMN IF NOT EXISTS cd_interes_ordinario_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cd_fecha_suscripcion date,
  ADD COLUMN IF NOT EXISTS cd_aval_nombre text,
  ADD COLUMN IF NOT EXISTS cd_aval_domicilio text;

COMMENT ON COLUMN dilesa.ventas.monto_credito_directo IS
  'Saldo financiado por DILESA como crédito directo (precio − crédito institución − depósitos). NULL si no aplica.';
COMMENT ON COLUMN dilesa.ventas.cd_plan_pagos IS
  'Plan de pagos del crédito directo: arreglo JSON [{num, fecha, monto}] con los vencimientos del pagaré.';
COMMENT ON COLUMN dilesa.ventas.cd_tiie28_pct IS
  'TIIE a 28 días (%) vigente a la suscripción del pagaré — base del interés moratorio.';
COMMENT ON COLUMN dilesa.ventas.cd_spread_moratorio_pct IS
  'Puntos porcentuales sobre la TIIE para el interés moratorio (default 4, editable a más según riesgo).';
COMMENT ON COLUMN dilesa.ventas.cd_interes_ordinario_pct IS
  'Interés ordinario anual (%) del crédito directo. Default 0.';
COMMENT ON COLUMN dilesa.ventas.cd_fecha_suscripcion IS
  'Fecha de suscripción del pagaré del crédito directo.';
COMMENT ON COLUMN dilesa.ventas.cd_aval_nombre IS
  'Nombre del aval del pagaré (opcional, respaldo).';
COMMENT ON COLUMN dilesa.ventas.cd_aval_domicilio IS
  'Domicilio del aval del pagaré (opcional).';

NOTIFY pgrst, 'reload schema';

COMMIT;
