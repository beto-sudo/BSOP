-- ============================================================
-- Fix v_cortes_totales: corregir clasificación de métodos de pago
-- y agregar pedidos_count.
--
-- Métodos reales en waitry_pagos:
--   Efectivo:     'cash'
--   Tarjeta:      'credit_card_visa', 'credit_card', 'credit_card_master', 'POS'
--   Stripe:       'STRIPE', 'stripe'  (case-insensitive)
--   Transferencia:'other'
-- ============================================================

CREATE OR REPLACE VIEW rdb.v_cortes_totales AS
WITH pagos_por_corte AS (
    SELECT
        ped.corte_id,
        LOWER(p.payment_method) AS method,
        p.amount
    FROM rdb.waitry_pedidos ped
    JOIN rdb.waitry_pagos p ON p.order_id = ped.order_id
    WHERE ped.corte_id IS NOT NULL
      AND ped.status != 'order_cancelled'
),
pedidos_por_corte AS (
    SELECT
        corte_id,
        COUNT(*) AS total_pedidos
    FROM rdb.waitry_pedidos
    WHERE corte_id IS NOT NULL
      AND status != 'order_cancelled'
    GROUP BY corte_id
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
    c.id                                                           AS corte_id,
    c.caja_id,
    c.caja_nombre,
    c.estado,
    c.hora_inicio,
    c.hora_fin,
    c.efectivo_inicial,
    -- Efectivo
    COALESCE(SUM(CASE WHEN pp.method = 'cash'             THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
    -- Tarjeta (todas las variantes)
    COALESCE(SUM(CASE WHEN pp.method LIKE 'credit_card%'
                        OR pp.method = 'pos'               THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
    -- Stripe (case-insensitive ya resuelto con LOWER)
    COALESCE(SUM(CASE WHEN pp.method = 'stripe'           THEN pp.amount ELSE 0 END), 0) AS ingresos_stripe,
    -- Transferencias
    COALESCE(SUM(CASE WHEN pp.method = 'other'            THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
    -- Total
    COALESCE(SUM(pp.amount), 0)                                                           AS total_ingresos,
    COALESCE(m.total_depositos, 0)                                                        AS depositos,
    COALESCE(m.total_retiros,   0)                                                        AS retiros,
    -- Efectivo esperado al cierre
    (
        c.efectivo_inicial
        + COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0)
        + COALESCE(m.total_depositos, 0)
        - COALESCE(m.total_retiros,   0)
    )                                                                                     AS efectivo_esperado,
    -- Conteo de pedidos
    COALESCE(pc.total_pedidos, 0)                                                         AS pedidos_count
FROM rdb.cortes c
LEFT JOIN pagos_por_corte      pp ON pp.corte_id = c.id
LEFT JOIN pedidos_por_corte    pc ON pc.corte_id = c.id
LEFT JOIN movimientos_por_corte m ON m.corte_id  = c.id
GROUP BY c.id, c.caja_id, c.caja_nombre, c.estado, c.hora_inicio, c.hora_fin,
         c.efectivo_inicial, m.total_depositos, m.total_retiros, pc.total_pedidos;

GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;

-- Actualizar también v_cortes_lista para exponer pedidos_count real
CREATE OR REPLACE VIEW rdb.v_cortes_lista AS
SELECT
    c.id,
    COALESCE(c.corte_nombre, 'Corte-' || left(c.id::text, 8)) AS corte_nombre,
    c.coda_id,
    c.caja_id,
    c.caja_nombre,
    c.fecha_operativa,
    c.hora_inicio,
    c.hora_fin,
    c.estado,
    c.turno,
    c.tipo,
    c.observaciones,
    c.efectivo_inicial,
    c.efectivo_contado,
    c.responsable_apertura,
    c.responsable_cierre,
    COALESCE(vt.ingresos_efectivo,       0) AS ingresos_efectivo,
    COALESCE(vt.ingresos_tarjeta,        0) AS ingresos_tarjeta,
    COALESCE(vt.ingresos_stripe,         0) AS ingresos_stripe,
    COALESCE(vt.ingresos_transferencias, 0) AS ingresos_transferencias,
    COALESCE(vt.total_ingresos,          0) AS total_ingresos,
    COALESCE(vt.depositos,               0) AS depositos,
    COALESCE(vt.retiros,                 0) AS retiros,
    COALESCE(vt.efectivo_esperado,       0) AS efectivo_esperado,
    COALESCE(vt.pedidos_count,           0) AS pedidos_count
FROM rdb.cortes c
LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id;

GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
