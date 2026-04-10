-- ============================================================
-- Backfill v2: reasignar corte_id en waitry_pedidos
-- Ahora que los cortes tienen hora_inicio/hora_fin correctos
-- (sincronizados desde Coda via CSV), re-asignamos todos los
-- pedidos al corte correcto por rango temporal + caja.
-- ============================================================

-- Paso 1: Limpiar asignaciones anteriores para re-asignar limpiamente
-- (solo pedidos que no sean status 'order_cancelled')
UPDATE rdb.waitry_pedidos
SET corte_id = NULL
WHERE status != 'order_cancelled';

-- Paso 2: Asignar corte_id por rango temporal
-- Para cada pedido, encontrar el corte donde:
--   timestamp >= hora_inicio AND timestamp <= hora_fin
-- En caso de overlap entre cajas, tomamos el corte con
-- hora_inicio más reciente (más específico)
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

-- Paso 3: Reporte de resultados
DO $$
DECLARE
    total_pedidos     INTEGER;
    con_corte         INTEGER;
    sin_corte         INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_pedidos FROM rdb.waitry_pedidos WHERE status != 'order_cancelled';
    SELECT COUNT(*) INTO con_corte     FROM rdb.waitry_pedidos WHERE status != 'order_cancelled' AND corte_id IS NOT NULL;
    sin_corte := total_pedidos - con_corte;
    RAISE NOTICE 'Backfill v2 completado: % total, % asignados, % sin corte', total_pedidos, con_corte, sin_corte;
END $$;
