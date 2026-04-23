-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_*, rdb.cortes, rdb.movimientos
-- are ambient pre-migration tables; whole migration is a no-op when they're
-- absent on a fresh DB.
-- ============================================================
-- Índices de rendimiento para queries de cortes
-- v_cortes_totales hace JOIN ped.timestamp BETWEEN c.hora_inicio AND c.hora_fin
-- Sin índice en timestamp, hace seq scan de ~9,400 pedidos por corte
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL
     OR to_regclass('rdb.waitry_pagos') IS NULL
     OR to_regclass('rdb.cortes') IS NULL
     OR to_regclass('rdb.movimientos') IS NULL THEN
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_timestamp_idx
    ON rdb.waitry_pedidos ("timestamp");
  CREATE INDEX IF NOT EXISTS rdb_waitry_pagos_order_id_idx
    ON rdb.waitry_pagos (order_id);
  CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_order_id_idx
    ON rdb.waitry_pedidos (order_id);
  CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_status_idx
    ON rdb.waitry_pedidos (status)
    WHERE status != 'order_canceled';
  CREATE INDEX IF NOT EXISTS rdb_movimientos_corte_id_idx
    ON rdb.movimientos (corte_id);

  ALTER TABLE rdb.waitry_pedidos
    ADD COLUMN IF NOT EXISTS corte_id UUID REFERENCES rdb.cortes(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS rdb_waitry_pedidos_corte_id_idx
    ON rdb.waitry_pedidos (corte_id)
    WHERE corte_id IS NOT NULL;

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

  DROP VIEW IF EXISTS rdb.v_cortes_totales CASCADE;

  EXECUTE $sql$
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
             c.efectivo_inicial, m.total_depositos, m.total_retiros
  $sql$;

  GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;
END $do$;
