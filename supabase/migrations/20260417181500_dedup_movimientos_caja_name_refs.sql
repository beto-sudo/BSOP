-- Deduplicación post-backfill de erp.movimientos_caja (2026-04-17)
--
-- Contexto:
--   Durante la migración rdb → erp (2026-04-14), los 396 rows históricos
--   se copiaron a erp.movimientos_caja con un patrón de `referencia` mixto:
--     - Rows viejos (antes del 2026-04-09): referencia = nombre de cajera (ej. "Laisha Martinez")
--     - Rows nuevos (2026-04-09 en adelante): referencia = coda rowId (ej. "i-PwItJd_27q")
--
--   El 2026-04-17 se corrió un backfill completo desde Coda vía
--   rdb.upsert_movimiento (ver scripts/backfill_coda_movimientos_2026_04_17.py).
--   Ese upsert usa `referencia = p_coda_id` como natural key — los rows con
--   nombre en referencia NO hicieron match, así que terminaron como duplicados
--   junto a los insertados frescos desde Coda.
--
--   Análisis previo confirmó 0 grupos huérfanos (todo name-row tiene su twin coda_id)
--   y 0 grupos donde #name > #coda → safe to drop.
--
-- Migración:
--   Borra los 390 rows con nombre en referencia (preservando el evento vía
--   el row nuevo que lleva coda_id y `realizado_por_nombre`).

DELETE FROM erp.movimientos_caja
WHERE referencia IS NOT NULL
  AND referencia <> ''
  AND referencia NOT LIKE 'i-%';
