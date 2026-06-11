-- ╭─ 20260611141749_dilesa_promociones_monto_venta_promocion ─╮
-- Regla de Beto 2026-06-11: el "Descuento Máximo Autorizado" de la cuadratura
-- ES el valor de la promoción/bono elegido en la Solicitud de Asignación
-- (bonos flexibles que el cliente reparte entre los buckets) — debe
-- presentarse derivado, no como captura libre.
--
-- 1. dilesa.promociones.monto — valor estructurado del bono (antes solo en
--    el nombre). Backfill: $15,000 al bono LDLE-ISC existente.
-- 2. dilesa.ventas.promocion_id — FK a la promo elegida en la solicitud
--    (antes solo quedaba como texto en notas). Ventas legacy de Coda quedan
--    NULL y la UI cae al descuento_maximo_autorizado capturado allá.

BEGIN;

-- ── 1. Monto del bono en el catálogo ─────────────────────────────────────────
ALTER TABLE dilesa.promociones
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN dilesa.promociones.monto IS
  'Valor del bono ($). Es el tope de descuento flexible de la operación: el cliente lo reparte entre los buckets de descuento de la cuadratura. Regla Beto 2026-06-11.';

-- Backfill del único bono vigente (robusto a Preview: match por nombre).
UPDATE dilesa.promociones
SET monto = 15000
WHERE nombre = 'Bono de hasta $15,000 en gastos de escrituración'
  AND monto = 0
  AND deleted_at IS NULL;

-- ── 2. La venta recuerda qué promoción se eligió ─────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS promocion_id uuid REFERENCES dilesa.promociones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dilesa_ventas_promocion_idx
  ON dilesa.ventas (promocion_id) WHERE promocion_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN dilesa.ventas.promocion_id IS
  'Promoción/bono elegido al capturar la Solicitud de Asignación. Su monto es el Descuento Máximo Autorizado de la cuadratura (derivado, no capturable). NULL en ventas legacy de Coda — la UI cae a descuento_maximo_autorizado capturado allá.';

COMMENT ON COLUMN dilesa.ventas.descuento_maximo_autorizado IS
  'LEGACY (import Coda): tope de descuento capturado a mano. Para ventas nativas BSOP el tope se deriva de promociones.monto vía promocion_id; esta columna queda como fallback de las ventas migradas.';

NOTIFY pgrst, 'reload schema';

COMMIT;
