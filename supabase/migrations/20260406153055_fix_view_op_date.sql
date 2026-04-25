CREATE OR REPLACE VIEW caja.v_cortes_totales AS
WITH confirmed_dupes AS (
    SELECT duplicate_candidates.order_id_b
    FROM waitry.duplicate_candidates
    WHERE duplicate_candidates.resolved = true AND duplicate_candidates.resolution = 'confirmed_duplicate'::text
), pedidos_corte AS (
    SELECT c_1.id AS corte_id,
        ped.order_id,
        ped.total_amount
    FROM caja.cortes c_1
    JOIN waitry.pedidos ped 
        ON ((ped."timestamp" AT TIME ZONE 'America/Matamoros') - interval '6 hours')::date = c_1.fecha_operativa 
        AND ped.status <> 'order_canceled'::text 
        AND NOT (ped.order_id IN (SELECT confirmed_dupes.order_id_b FROM confirmed_dupes))
), pagos_corte AS (
    SELECT pc.corte_id,
        pg.payment_method,
        pg.amount
    FROM pedidos_corte pc
    JOIN waitry.pagos pg ON pg.order_id = pc.order_id
), movimientos_corte AS (
    SELECT movimientos.corte_id,
        sum(CASE WHEN movimientos.tipo = 'Depósito'::text THEN movimientos.monto ELSE 0::numeric END) AS total_depositos,
        sum(CASE WHEN movimientos.tipo = 'Retiro'::text THEN movimientos.monto ELSE 0::numeric END) AS total_retiros
    FROM caja.movimientos
    GROUP BY movimientos.corte_id
)
SELECT c.id AS corte_id,
    c.corte_nombre,
    c.estado,
    c.fecha_operativa,
    c.hora_inicio,
    c.hora_fin,
    c.efectivo_inicial,
    COALESCE(pt.total_pedidos_monto, 0::numeric) AS total_pedidos,
    COALESCE(sum(CASE WHEN pag.payment_method = 'cash'::text THEN pag.amount ELSE 0::numeric END), 0::numeric) AS ingresos_efectivo,
    COALESCE(sum(CASE WHEN pag.payment_method = ANY (ARRAY['credit_card_visa'::text, 'credit_card_master'::text, 'POS'::text]) THEN pag.amount ELSE 0::numeric END), 0::numeric) AS ingresos_tarjeta,
    COALESCE(sum(CASE WHEN pag.payment_method = 'STRIPE'::text THEN pag.amount ELSE 0::numeric END), 0::numeric) AS ingresos_stripe,
    COALESCE(sum(CASE WHEN pag.payment_method = 'other'::text THEN pag.amount ELSE 0::numeric END), 0::numeric) AS ingresos_transferencias,
    COALESCE(sum(pag.amount), 0::numeric) AS total_pagos,
    COALESCE(m.total_depositos, 0::numeric) AS depositos,
    COALESCE(m.total_retiros, 0::numeric) AS retiros,
    c.efectivo_inicial + COALESCE(sum(CASE WHEN pag.payment_method = 'cash'::text THEN pag.amount ELSE 0::numeric END), 0::numeric) + COALESCE(m.total_depositos, 0::numeric) - COALESCE(m.total_retiros, 0::numeric) AS efectivo_esperado
FROM caja.cortes c
LEFT JOIN (
    SELECT x.corte_id, sum(x.total_amount) AS total_pedidos_monto
    FROM (SELECT DISTINCT pc2.corte_id, pc2.order_id, pc2.total_amount FROM pedidos_corte pc2) x
    GROUP BY x.corte_id
) pt ON pt.corte_id = c.id
LEFT JOIN pagos_corte pag ON pag.corte_id = c.id
LEFT JOIN movimientos_corte m ON m.corte_id = c.id
GROUP BY c.id, c.corte_nombre, c.estado, c.fecha_operativa, c.hora_inicio, c.hora_fin, c.efectivo_inicial, pt.total_pedidos_monto, m.total_depositos, m.total_retiros;;
