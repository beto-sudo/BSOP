-- ╭─ 20260625204005_dilesa_ventas_saldo_residual_resolucion ─╮
-- Resolución del saldo residual de PRECIO en la dictaminación (fase 8).
-- Iniciativa `dilesa-saldos-residuales` · companion de ADR-048.
--
-- Cuando el precio de escrituración queda con un residual chico tras crédito +
-- enganche (p.ej. JUAN ANTONIO M3-L9: $792), Dirección lo resuelve de forma
-- EXPLÍCITA en la dictaminación: cobrarlo (pagaré) o absorberlo (nota de
-- crédito). Hoy ese residual solo se mostraba como nota suave "lo absorbe el
-- bono", sin decisión ni rastro. Estos campos son el GOBIERNO de la decisión:
-- la nota de crédito se mantiene DERIVADA (Facturado − Valor Real, que ya
-- incluye lo absorbido); F13 reconcilia contra esta autorización.
-- Aditivo y nullable (no toca ninguna venta existente; null = sin resolver).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS saldo_residual_resolucion text
    CHECK (saldo_residual_resolucion IN ('cobrar', 'absorber')),
  ADD COLUMN IF NOT EXISTS saldo_residual_monto numeric(14, 2),
  ADD COLUMN IF NOT EXISTS saldo_residual_autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS saldo_residual_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.saldo_residual_resolucion IS
  'Resolución del saldo residual de precio en la dictaminación (fase 8): cobrar (pagaré) o absorber (nota de crédito). null = sin resolver. Iniciativa dilesa-saldos-residuales / ADR-048.';
COMMENT ON COLUMN dilesa.ventas.saldo_residual_monto IS
  'Monto del saldo residual de precio al momento de la resolución (snapshot de saldoPrecioPorCubrir). Lo absorbido ya cae en la NC derivada; F13 reconcilia.';
COMMENT ON COLUMN dilesa.ventas.saldo_residual_autorizado_por IS
  'Usuario (auth.users.id) que autorizó la resolución del saldo residual (Dirección).';
COMMENT ON COLUMN dilesa.ventas.saldo_residual_at IS
  'Timestamp de la resolución del saldo residual.';

-- Recarga el cache de PostgREST (columnas nuevas en una tabla con embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
