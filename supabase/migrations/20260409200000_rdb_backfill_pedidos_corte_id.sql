-- ============================================================
-- Backfill pedidos sin corte_id
-- El UPDATE anterior no cubrió todos los pedidos históricos
-- porque los rangos timestamp de cortes históricos no coincidían exactamente.
-- Esta migración usa una estrategia más permisiva: si el timestamp
-- del pedido cae dentro de la ventana extendida del corte (hasta 14h),
-- o si es el corte más cercano por tiempo, se asigna.
-- ============================================================

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

-- Paso 2: Para pedidos que aún no tienen corte_id,
-- asignar al corte más cercano por caja (por timestamp más próximo de hora_inicio)
UPDATE rdb.waitry_pedidos ped
SET corte_id = (
  SELECT c2.id
  FROM rdb.cortes c2
  WHERE c2.caja_nombre NOT ILIKE '%Sin Corte%'
    AND c2.hora_inicio IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (ped."timestamp" - c2.hora_inicio))) < 86400 -- dentro de 24h
  ORDER BY ABS(EXTRACT(EPOCH FROM (ped."timestamp" - c2.hora_inicio))) ASC
  LIMIT 1
)
WHERE ped.corte_id IS NULL
  AND ped.status != 'order_canceled';
