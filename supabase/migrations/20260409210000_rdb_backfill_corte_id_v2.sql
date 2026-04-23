-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_pedidos / rdb.cortes are ambient.
-- ============================================================
-- Backfill v2: reasignar corte_id en waitry_pedidos
-- ============================================================

DO $do$
DECLARE
    total_pedidos     INTEGER;
    con_corte         INTEGER;
    sin_corte         INTEGER;
BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL OR to_regclass('rdb.cortes') IS NULL THEN
    RETURN;
  END IF;

  -- Paso 1: Limpiar asignaciones anteriores
  UPDATE rdb.waitry_pedidos
  SET corte_id = NULL
  WHERE status != 'order_cancelled';

  -- Paso 2: Asignar corte_id por rango temporal
  UPDATE rdb.waitry_pedidos ped
  SET corte_id = sub.corte_id
  FROM (
      SELECT DISTINCT ON (ped2.id)
          ped2.id AS pedido_id,
          c2.id AS corte_id
      FROM rdb.waitry_pedidos ped2
      JOIN rdb.cortes c2
          ON ped2.timestamp >= c2.hora_inicio
          AND ped2.timestamp <= c2.hora_fin
          AND c2.hora_fin IS NOT NULL
      WHERE ped2.status != 'order_cancelled'
      ORDER BY ped2.id, c2.hora_inicio DESC
  ) sub
  WHERE ped.id = sub.pedido_id;

  -- Paso 3: Reporte
  SELECT COUNT(*) INTO total_pedidos FROM rdb.waitry_pedidos WHERE status != 'order_cancelled';
  SELECT COUNT(*) INTO con_corte     FROM rdb.waitry_pedidos WHERE status != 'order_cancelled' AND corte_id IS NOT NULL;
  sin_corte := total_pedidos - con_corte;
  RAISE NOTICE 'Backfill v2 completado: % total, % asignados, % sin corte', total_pedidos, con_corte, sin_corte;
END $do$;
