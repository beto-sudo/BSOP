CREATE OR REPLACE VIEW caja.v_cortes_totales AS
WITH pedidos_validos AS (
    -- Pedidos que no están marcados como "confirmed_duplicate" en order_id_b
    SELECT ped.*
    FROM waitry.pedidos ped
    LEFT JOIN waitry.duplicate_candidates dc 
        ON dc.order_id_b = ped.order_id AND dc.resolution = 'confirmed_duplicate'
    WHERE dc.id IS NULL
),
pagos_por_corte AS (
    SELECT 
        c.id AS corte_id,
        p.payment_method AS method,
        p.amount
    FROM caja.cortes c
    JOIN pedidos_validos ped 
        ON (ped."timestamp" AT TIME ZONE 'UTC') >= (c.hora_inicio AT TIME ZONE 'America/Matamoros')
        AND (ped."timestamp" AT TIME ZONE 'UTC') <= COALESCE(c.hora_fin AT TIME ZONE 'America/Matamoros', (c.hora_inicio AT TIME ZONE 'America/Matamoros') + interval '12 hours')
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
WITH pedidos_validos AS (
    SELECT ped.*
    FROM waitry.pedidos ped
    LEFT JOIN waitry.duplicate_candidates dc 
        ON dc.order_id_b = ped.order_id AND dc.resolution = 'confirmed_duplicate'
    WHERE dc.id IS NULL
)
SELECT 
    c.id AS corte_id,
    wp.product_id,
    wp.product_name AS producto_nombre,
    SUM(wp.quantity) AS cantidad_vendida,
    SUM(wp.unit_price * wp.quantity) AS importe_total
FROM caja.cortes c
JOIN pedidos_validos ped 
    ON (ped."timestamp" AT TIME ZONE 'UTC') >= (c.hora_inicio AT TIME ZONE 'America/Matamoros')
    AND (ped."timestamp" AT TIME ZONE 'UTC') <= COALESCE(c.hora_fin AT TIME ZONE 'America/Matamoros', (c.hora_inicio AT TIME ZONE 'America/Matamoros') + interval '12 hours')
    AND ped.status != 'order_canceled'
JOIN waitry.productos wp ON wp.order_id = ped.order_id
GROUP BY c.id, wp.product_id, wp.product_name;

CREATE OR REPLACE VIEW inventario.v_stock_actual AS
WITH pedidos_validos AS (
    SELECT ped.*
    FROM waitry.pedidos ped
    LEFT JOIN waitry.duplicate_candidates dc 
        ON dc.order_id_b = ped.order_id AND dc.resolution = 'confirmed_duplicate'
    WHERE dc.id IS NULL
),
salidas_waitry AS (
    SELECT 
        wp.product_id,
        SUM(wp.quantity) AS total_vendido
    FROM waitry.productos wp
    JOIN pedidos_validos ped ON ped.order_id = wp.order_id
    WHERE ped.status != 'order_canceled'
    GROUP BY wp.product_id
),
entradas_manuales AS (
    SELECT producto_id, SUM(cantidad) AS total_entrado
    FROM inventario.entradas
    GROUP BY producto_id
),
ajustes_manuales AS (
    SELECT producto_id, SUM(cantidad) AS total_ajustado
    FROM inventario.ajustes
    WHERE estado = 'Aplicado'
    GROUP BY producto_id
)
SELECT 
    p.id AS producto_id,
    p.nombre,
    p.categoria,
    p.stock_inicial,
    COALESCE(e.total_entrado, 0) AS entradas,
    COALESCE(s.total_vendido, 0) AS salidas_ventas,
    COALESCE(a.total_ajustado, 0) AS ajustes,
    (p.stock_inicial + COALESCE(e.total_entrado, 0) - COALESCE(s.total_vendido, 0) + COALESCE(a.total_ajustado, 0)) AS stock_actual
FROM inventario.productos p
LEFT JOIN salidas_waitry s ON s.product_id = p.id
LEFT JOIN entradas_manuales e ON e.producto_id = p.id
LEFT JOIN ajustes_manuales a ON a.producto_id = p.id;;
