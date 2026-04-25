CREATE OR REPLACE VIEW waitry.v_pedidos_30d AS
WITH confirmed_dupes AS (
  SELECT dc.order_id_b AS order_id
  FROM waitry.duplicate_candidates dc
  WHERE dc.resolved = true
    AND dc.resolution = 'confirmed_duplicate'
)
SELECT ped.*
FROM waitry.pedidos ped
LEFT JOIN confirmed_dupes cd
  ON cd.order_id = ped.order_id
WHERE ((ped."timestamp" AT TIME ZONE 'America/Matamoros') - interval '6 hours')::date >= CURRENT_DATE - INTERVAL '35 days'
  AND cd.order_id IS NULL;

CREATE OR REPLACE VIEW waitry.v_pagos_30d AS
WITH confirmed_dupes AS (
  SELECT dc.order_id_b AS order_id
  FROM waitry.duplicate_candidates dc
  WHERE dc.resolved = true
    AND dc.resolution = 'confirmed_duplicate'
), pedidos_validos AS (
  SELECT ped.order_id
  FROM waitry.pedidos ped
  LEFT JOIN confirmed_dupes cd
    ON cd.order_id = ped.order_id
  WHERE ((ped."timestamp" AT TIME ZONE 'America/Matamoros') - interval '6 hours')::date >= CURRENT_DATE - INTERVAL '35 days'
    AND cd.order_id IS NULL
)
SELECT pg.*
FROM waitry.pagos pg
JOIN pedidos_validos pv
  ON pv.order_id = pg.order_id;

CREATE OR REPLACE VIEW waitry.v_productos_30d AS
WITH confirmed_dupes AS (
  SELECT dc.order_id_b AS order_id
  FROM waitry.duplicate_candidates dc
  WHERE dc.resolved = true
    AND dc.resolution = 'confirmed_duplicate'
), pedidos_validos AS (
  SELECT ped.order_id
  FROM waitry.pedidos ped
  LEFT JOIN confirmed_dupes cd
    ON cd.order_id = ped.order_id
  WHERE ((ped."timestamp" AT TIME ZONE 'America/Matamoros') - interval '6 hours')::date >= CURRENT_DATE - INTERVAL '35 days'
    AND cd.order_id IS NULL
)
SELECT pr.*
FROM waitry.productos pr
JOIN pedidos_validos pv
  ON pv.order_id = pr.order_id;

CREATE OR REPLACE VIEW caja.v_cortes_totales_30d AS
SELECT *
FROM caja.v_cortes_totales
WHERE fecha_operativa >= CURRENT_DATE - INTERVAL '35 days';

CREATE OR REPLACE VIEW caja.v_cortes_productos_30d AS
SELECT vcp.*
FROM caja.v_cortes_productos vcp
JOIN caja.cortes c
  ON c.id = vcp.corte_id
WHERE c.fecha_operativa >= CURRENT_DATE - INTERVAL '35 days';
;
