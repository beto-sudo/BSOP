-- ╭─ 20260611042746_dilesa_pagare_tasas_ordinario_moratorio ─╮
-- Corrige el modelo de tasas del pagaré de crédito directo (regla de Beto
-- 2026-06-11): el interés ORDINARIO es siempre TIIE 28d + spread (mínimo 4
-- puntos) — antes el spread alimentaba el moratorio y el ordinario era
-- libre con default 0. El MORATORIO pactado es 3× la tasa ordinaria
-- (defendible vs doctrina anti-usura SCJN; no existe tope legal fijo).
--
-- 1. RENAME cd_spread_moratorio_pct → cd_spread_ordinario_pct + CHECK ≥ 4.
-- 2. Columna nueva cd_interes_moratorio_pct (snapshot pactado por venta).
-- 3. Backfill de la única venta nativa con TIIE capturada: ordinario =
--    TIIE + spread, moratorio = 3× ordinario. Las 17 legacy de Coda no
--    tienen TIIE (sus pagarés ya existen en papel) — quedan intactas.

BEGIN;

-- ── 1. El spread es del interés ordinario ────────────────────────────────────
ALTER TABLE dilesa.ventas
  RENAME COLUMN cd_spread_moratorio_pct TO cd_spread_ordinario_pct;

ALTER TABLE dilesa.ventas
  DROP CONSTRAINT IF EXISTS ventas_cd_spread_ordinario_min_check;
ALTER TABLE dilesa.ventas
  ADD CONSTRAINT ventas_cd_spread_ordinario_min_check
  CHECK (cd_spread_ordinario_pct IS NULL OR cd_spread_ordinario_pct >= 4);

COMMENT ON COLUMN dilesa.ventas.cd_spread_ordinario_pct IS
  'Puntos porcentuales sobre la TIIE 28d para el interés ORDINARIO del crédito directo (mínimo 4, editable a más). Regla Beto 2026-06-11.';

COMMENT ON COLUMN dilesa.ventas.cd_interes_ordinario_pct IS
  'Interés ordinario anual (%) pactado = cd_tiie28_pct + cd_spread_ordinario_pct al momento de guardar. Snapshot — la TIIE cambia, el pagaré queda con la tasa del día de suscripción.';

COMMENT ON COLUMN dilesa.ventas.cd_tiie28_pct IS
  'TIIE a 28 días (%) vigente a la suscripción del pagaré — base del interés ordinario (TIIE + spread).';

-- ── 2. Moratorio pactado ─────────────────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS cd_interes_moratorio_pct numeric;

COMMENT ON COLUMN dilesa.ventas.cd_interes_moratorio_pct IS
  'Interés moratorio anual (%) pactado = 3× el interés ordinario al guardar. Snapshot por venta. No hay tope legal fijo en pagarés mercantiles; el límite es la doctrina anti-usura SCJN (referente práctico ~37%).';

-- ── 3. Backfill de ventas nativas con TIIE capturada ────────────────────────
UPDATE dilesa.ventas
SET cd_interes_ordinario_pct = round(cd_tiie28_pct + cd_spread_ordinario_pct, 2),
    cd_interes_moratorio_pct = round((cd_tiie28_pct + cd_spread_ordinario_pct) * 3, 2)
WHERE monto_credito_directo IS NOT NULL
  AND cd_tiie28_pct IS NOT NULL
  AND cd_spread_ordinario_pct IS NOT NULL
  AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
