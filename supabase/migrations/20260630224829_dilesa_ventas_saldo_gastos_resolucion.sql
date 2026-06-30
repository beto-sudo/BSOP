-- ╭─ 20260630224829_dilesa_ventas_saldo_gastos_resolucion ─╮
-- Resolución del saldo residual de GASTOS notariales en la dictaminación (fase 8).
-- Iniciativa `dilesa-saldos-residuales` Sprint 3 · companion de ADR-048.
--
-- Hermana de `saldo_residual_*` (que gobierna el residual de PRECIO). Cuando el
-- faltante de gastos (`coberturaGastos.pagareNecesario`) supera el bono autorizado
-- y no hay sobreprecio capturado, el motor venía absorbiéndolo en silencio como
-- "sobreprecio" fantasma y el panel decía "Cuadra ✓" en falso (caso José Cruz
-- M3-L8: 8,230). Estos campos son el GOBIERNO de la decisión: Dirección lo resuelve
-- explícito — cobrarlo (pagaré), absorberlo DILESA (Máxima Aportación) o que el
-- cliente lo cubra con un depósito (que baja `pagareNecesario` solo, sin resolución).
-- La nota de crédito se mantiene DERIVADA (Facturado − Valor Real, que ya incluye lo
-- absorbido vía el cheque a notaría); F13 reconcilia contra esta autorización.
-- Aditivo y nullable (no toca ninguna venta existente; null = sin resolver).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS saldo_gastos_resolucion text
    CHECK (saldo_gastos_resolucion IN ('cobrar', 'absorber')),
  ADD COLUMN IF NOT EXISTS saldo_gastos_monto numeric(14, 2),
  ADD COLUMN IF NOT EXISTS saldo_gastos_autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS saldo_gastos_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.saldo_gastos_resolucion IS
  'Resolución del faltante de gastos notariales en la dictaminación (fase 8): cobrar (pagaré) o absorber (Máxima Aportación DILESA). null = sin resolver (o el cliente lo cubre con depósito, que baja pagareNecesario solo). Iniciativa dilesa-saldos-residuales S3 / ADR-048.';
COMMENT ON COLUMN dilesa.ventas.saldo_gastos_monto IS
  'Monto del faltante de gastos al momento de la resolución (snapshot de coberturaGastos.pagareNecesario). Lo absorbido ya cae en la NC derivada vía el cheque a notaría; F13 reconcilia.';
COMMENT ON COLUMN dilesa.ventas.saldo_gastos_autorizado_por IS
  'Usuario (auth.users.id) que autorizó la resolución del faltante de gastos (Dirección).';
COMMENT ON COLUMN dilesa.ventas.saldo_gastos_at IS
  'Timestamp de la resolución del faltante de gastos.';

-- Recarga el cache de PostgREST (columnas nuevas en una tabla con embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
