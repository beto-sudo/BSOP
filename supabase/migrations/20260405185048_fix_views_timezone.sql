CREATE OR REPLACE VIEW caja.v_cortes_totales AS
WITH pagos_por_corte AS (
    SELECT 
        c.id AS corte_id,
        p.payment_method AS method,
        p.amount
    FROM caja.cortes c
    JOIN waitry.pedidos ped 
        ON ped."timestamp" AT TIME ZONE 'America/Matamoros' >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
        AND ped."timestamp" AT TIME ZONE 'America/Matamoros' <= COALESCE(c.hora_fin AT TIME ZONE 'America/Matamoros', c.hora_inicio AT TIME ZONE 'America/Matamoros' + interval '12 hours')
        AND ped.status != 'order_canceled'
    JOIN waitry.pagos p ON p.order_id = ped.order_id
),
movimientos_por_corte AS (
    SELECT 
        corte_id,
        SUM(CASE WHEN tipo = 'Depósito' THEN monto ELSE 0 END) AS total_depositos,
        SUM(CASE WHEN tipo = 'Retiro' THEN monto ELSE 0 END) AS total_retiros
    FROM caja.movimientos
    GROUP BY corte_id
)
SELECT 
    c.id AS corte_id,
    c.estado,
    c.hora_inicio,
    c.hora_fin,
    c.efectivo_inicial,
    COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
    COALESCE(SUM(CASE WHEN pp.method ILIKE 'credit%' THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
    0 AS ingresos_stripe, 
    COALESCE(SUM(CASE WHEN pp.method = 'other' THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
    COALESCE(SUM(pp.amount), 0) AS total_ingresos,
    COALESCE(m.total_depositos, 0) AS depositos,
    COALESCE(m.total_retiros, 0) AS retiros,
    (c.efectivo_inicial 
        + COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0) 
        + COALESCE(m.total_depositos, 0) 
        - COALESCE(m.total_retiros, 0)
    ) AS efectivo_esperado
FROM caja.cortes c
LEFT JOIN pagos_por_corte pp ON pp.corte_id = c.id
LEFT JOIN movimientos_por_corte m ON m.corte_id = c.id
GROUP BY c.id, c.estado, c.hora_inicio, c.hora_fin, c.efectivo_inicial, m.total_depositos, m.total_retiros;

CREATE OR REPLACE VIEW caja.v_cortes_productos AS
SELECT 
    c.id AS corte_id,
    wp.product_id,
    wp.product_name AS producto_nombre,
    SUM(wp.quantity) AS cantidad_vendida,
    SUM(wp.unit_price * wp.quantity) AS importe_total
FROM caja.cortes c
JOIN waitry.pedidos ped 
    ON ped."timestamp" AT TIME ZONE 'America/Matamoros' >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
    AND ped."timestamp" AT TIME ZONE 'America/Matamoros' <= COALESCE(c.hora_fin AT TIME ZONE 'America/Matamoros', c.hora_inicio AT TIME ZONE 'America/Matamoros' + interval '12 hours')
    AND ped.status != 'order_canceled'
JOIN waitry.productos wp ON wp.order_id = ped.order_id
GROUP BY c.id, wp.product_id, wp.product_name;;
