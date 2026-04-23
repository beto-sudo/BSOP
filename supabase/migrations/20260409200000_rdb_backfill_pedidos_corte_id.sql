-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_pedidos / rdb.cortes are ambient.
-- ============================================================
-- Backfill pedidos sin corte_id
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL OR to_regclass('rdb.cortes') IS NULL THEN
    RETURN;
  END IF;

  -- Paso 1: Asignación por rango ampliado (hasta 14 horas)
  UPDATE rdb.waitry_pedidos ped
  SET corte_id = c.id
  FROM rdb.cortes c
  WHERE ped.corte_id IS NULL
    AND ped.status != 'order_canceled'
    AND c.caja_nombre NOT ILIKE '%Sin Corte%'
    AND c.hora_inicio IS NOT NULL
    AND ped."timestamp" >= c.hora_inicio - INTERVAL '30 minutes'
    AND ped."timestamp" <= COALESCE(
          c.hora_fin,
          c.hora_inicio + INTERVAL '14 hours'
        ) + INTERVAL '30 minutes';

  -- Paso 2: corte más cercano
  UPDATE rdb.waitry_pedidos ped
  SET corte_id = (
    SELECT c2.id
    FROM rdb.cortes c2
    WHERE c2.caja_nombre NOT ILIKE '%Sin Corte%'
      AND c2.hora_inicio IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (ped."timestamp" - c2.hora_inicio))) < 86400
    ORDER BY ABS(EXTRACT(EPOCH FROM (ped."timestamp" - c2.hora_inicio))) ASC
    LIMIT 1
  )
  WHERE ped.corte_id IS NULL
    AND ped.status != 'order_canceled';
END $do$;
