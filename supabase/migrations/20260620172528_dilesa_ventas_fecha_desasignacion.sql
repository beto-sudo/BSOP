-- Fecha real de desasignación de ventas (DILESA) — iniciativa dilesa-reportes.
--
-- La fecha real de cuándo se desasignó una venta vive en Coda (columna
-- `F📅Desasigna🚫`); el import original solo la usó como bandera (sí/no), nunca
-- guardó el valor → en BSOP solo quedaba `updated_at` (pisado en el cutover del
-- 11-jun, por eso el reporte mostraba todo "de este mes"). Se agrega la columna
-- para poblarla (backfill desde Coda) y capturarla en re-imports futuros.

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS fecha_desasignacion date;

COMMENT ON COLUMN dilesa.ventas.fecha_desasignacion IS
  'Fecha real de desasignación. Origen: Coda F📅Desasigna🚫 (histórico) o el timestamp en notas (desasignadas nativas de BSOP).';

NOTIFY pgrst, 'reload schema';

COMMIT;
