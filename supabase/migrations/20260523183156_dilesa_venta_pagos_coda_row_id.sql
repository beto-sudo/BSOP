-- ============================================================================
-- DILESA · venta_pagos · coda_row_id
-- ----------------------------------------------------------------------------
-- Hermana de la migración 20260523035526 (dilesa_ventas_coda_row_id). Agrega
-- `coda_row_id` también a `dilesa.venta_pagos` para que el cron diario pueda
-- UPSERT pagos por llave estable de Coda (Depositos Clientes row.id).
--
-- Sin esto, el cron borraba+reinsertaba pagos en cada corrida → los
-- venta_pago_ids cambiaban → los adjuntos de pago en `erp.adjuntos` (con
-- entidad_tipo='venta_pago') quedaban huérfanos.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

BEGIN;

ALTER TABLE dilesa.venta_pagos
  ADD COLUMN IF NOT EXISTS coda_row_id text;

CREATE UNIQUE INDEX IF NOT EXISTS venta_pagos_coda_row_id_empresa_uq
  ON dilesa.venta_pagos (empresa_id, coda_row_id)
  WHERE coda_row_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS venta_pagos_coda_row_id_idx
  ON dilesa.venta_pagos (coda_row_id)
  WHERE coda_row_id IS NOT NULL;

COMMENT ON COLUMN dilesa.venta_pagos.coda_row_id IS
  'Coda row.id de la tabla Depositos Clientes — llave estable para UPSERT durante re-imports. Único por (empresa_id, coda_row_id) WHERE NOT NULL.';

NOTIFY pgrst, 'reload schema';

COMMIT;
