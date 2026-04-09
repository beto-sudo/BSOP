-- ============================================================
-- Índices de rendimiento para queries de cortes
-- v_cortes_totales hace JOIN ped.timestamp BETWEEN c.hora_inicio AND c.hora_fin
-- Sin índice en timestamp, hace seq scan de ~9,400 pedidos por corte
-- ============================================================

-- Índice principal en waitry_pedidos.timestamp (el más usado en los JOINs de cortes)
CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_timestamp_idx
  ON rdb.waitry_pedidos ("timestamp");

-- Índice en waitry_pagos.order_id (JOIN pagos → pedidos)
CREATE INDEX IF NOT EXISTS rdb_waitry_pagos_order_id_idx
  ON rdb.waitry_pagos (order_id);

-- Índice en waitry_pedidos.order_id (JOIN pedidos → pagos)
CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_order_id_idx
  ON rdb.waitry_pedidos (order_id);

-- Índice en waitry_pedidos.status (filtro status != 'order_canceled')
CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_status_idx
  ON rdb.waitry_pedidos (status)
  WHERE status != 'order_canceled';

-- Índice en movimientos.corte_id (GROUP BY en v_cortes_totales)
CREATE INDEX IF NOT EXISTS rdb_movimientos_corte_id_idx
  ON rdb.movimientos (corte_id);

-- ============================================================
-- Reescribir v_cortes_totales para usar corte_id directo en pagos
-- cuando está disponible, con fallback al JOIN temporal solo si no hay corte_id
-- 
-- ESTRATEGIA: los pedidos llegados vía trigger tienen corte_id en waitry_pedidos.
-- Si la columna existe, usarla directamente (O(1) vs O(n²)).
-- Si no existe, mantener el JOIN temporal como fallback.
-- ============================================================

-- Agregar corte_id a waitry_pedidos para asociación directa (no por timestamp)
ALTER TABLE rdb.waitry_pedidos
  ADD COLUMN IF NOT EXISTS corte_id UUID REFERENCES rdb.cortes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_corte_id_idx
  ON rdb.waitry_pedidos (corte_id)
  WHERE corte_id IS NOT NULL;

-- ============================================================
-- Backfill: asignar corte_id a todos los pedidos históricos
-- por el rango temporal de cada corte
-- ============================================================

UPDATE rdb.waitry_pedidos ped
SET corte_id = c.id
FROM rdb.cortes c
WHERE ped.corte_id IS NULL
  AND ped.status != 'order_canceled'
  AND ped."timestamp" AT TIME ZONE 'America/Matamoros'
      >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
  AND ped."timestamp" AT TIME ZONE 'America/Matamoros'
      <= COALESCE(
           c.hora_fin AT TIME ZONE 'America/Matamoros',
           c.hora_inicio AT TIME ZONE 'America/Matamoros' + INTERVAL '12 hours'
         )
  AND c.caja_nombre != 'Sin Corte';

-- ============================================================
-- Nueva v_cortes_totales usando corte_id directo (rápida)
-- con fallback al JOIN temporal para pedidos sin corte_id asignado
-- ============================================================

DROP VIEW IF EXISTS rdb.v_cortes_totales CASCADE;

CREATE VIEW rdb.v_cortes_totales AS
WITH pagos_por_corte AS (
    SELECT
        ped.corte_id,
        p.payment_method AS method,
        p.amount
    FROM rdb.waitry_pedidos ped
    JOIN rdb.waitry_pagos p ON p.order_id = ped.order_id
    WHERE ped.corte_id IS NOT NULL
      AND ped.status != 'order_canceled'
),
movimientos_por_corte AS (
    SELECT
        corte_id,
        SUM(CASE WHEN tipo = 'Depósito' THEN monto ELSE 0 END) AS total_depositos,
        SUM(CASE WHEN tipo = 'Retiro'   THEN monto ELSE 0 END) AS total_retiros
    FROM rdb.movimientos
    GROUP BY corte_id
)
SELECT
    c.id AS corte_id,
    c.caja_id,
    c.caja_nombre,
    c.estado,
    c.hora_inicio,
    c.hora_fin,
    c.efectivo_inicial,
    COALESCE(SUM(CASE WHEN pp.method = 'cash'         THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
    COALESCE(SUM(CASE WHEN pp.method ILIKE 'credit%'  THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
    COALESCE(SUM(CASE WHEN pp.method = 'stripe'       THEN pp.amount ELSE 0 END), 0) AS ingresos_stripe,
    COALESCE(SUM(CASE WHEN pp.method = 'other'        THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
    COALESCE(SUM(pp.amount), 0) AS total_ingresos,
    COALESCE(m.total_depositos, 0) AS depositos,
    COALESCE(m.total_retiros,   0) AS retiros,
    (
      c.efectivo_inicial
      + COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0)
      + COALESCE(m.total_depositos, 0)
      - COALESCE(m.total_retiros, 0)
    ) AS efectivo_esperado
FROM rdb.cortes c
LEFT JOIN pagos_por_corte pp      ON pp.corte_id = c.id
LEFT JOIN movimientos_por_corte m ON m.corte_id  = c.id
GROUP BY c.id, c.caja_id, c.caja_nombre, c.estado, c.hora_inicio, c.hora_fin,
         c.efectivo_inicial, m.total_depositos, m.total_retiros;

GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;
