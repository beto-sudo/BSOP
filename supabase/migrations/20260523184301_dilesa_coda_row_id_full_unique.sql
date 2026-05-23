-- ============================================================================
-- DILESA · ventas + venta_pagos · convertir unique parcial a full
-- ----------------------------------------------------------------------------
-- Los unique parciales (WHERE coda_row_id IS NOT NULL AND deleted_at IS NULL)
-- NO son utilizables como destino de ON CONFLICT en UPSERT desde supabase-js
-- — PostgreSQL requiere que la query incluya el WHERE del partial index para
-- usarlo, y `.upsert()` no lo hace.
--
-- Fix: drop los partial uniques y crear regular uniques sobre
-- (empresa_id, coda_row_id). NULL multi-column no conflictúa con otros NULL,
-- así que ventas nativas BSOP (sin coda_row_id) siguen pudiendo coexistir.
--
-- Riesgo aceptado: si se soft-deletea una venta con coda_row_id=X y luego
-- vuelve a venir desde Coda con el mismo coda_row_id, el unique trona. Caso
-- raro y semánticamente correcto manejarlo manualmente.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS dilesa.ventas_coda_row_id_empresa_uq;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_coda_row_id_empresa_uq
  ON dilesa.ventas (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.venta_pagos_coda_row_id_empresa_uq;
CREATE UNIQUE INDEX IF NOT EXISTS venta_pagos_coda_row_id_empresa_uq
  ON dilesa.venta_pagos (empresa_id, coda_row_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
