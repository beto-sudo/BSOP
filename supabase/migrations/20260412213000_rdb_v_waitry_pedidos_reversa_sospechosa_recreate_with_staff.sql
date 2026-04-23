-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_* are ambient.
-- Recreate view to add waiter/POS user columns in a controlled column order

DO $do$
BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL
     OR to_regclass('rdb.waitry_productos') IS NULL
     OR to_regclass('rdb.waitry_pagos') IS NULL
     OR to_regclass('rdb.waitry_inbound') IS NULL THEN
    RETURN;
  END IF;

  DROP VIEW IF EXISTS rdb.v_waitry_pedidos_reversa_sospechosa;

  EXECUTE $sql$
    CREATE VIEW rdb.v_waitry_pedidos_reversa_sospechosa AS
    WITH pedidos_base AS (
      SELECT
        p.order_id, p.status, p.timestamp, p.place_name, p.layout_name,
        p.table_name, p.total_amount, p.total_discount, p.tax,
        p.service_charge, p.corte_id
      FROM rdb.waitry_pedidos p
      WHERE p.status IN ('order_ended', 'order_delivered')
        AND p.status <> 'order_canceled'
    ),
    productos_agg AS (
      SELECT
        wp.order_id,
        COUNT(*) AS product_lines,
        SUM(COALESCE(wp.quantity, 0)) AS product_qty,
        ROUND(SUM(COALESCE(wp.total_price, 0)), 2) AS product_total,
        STRING_AGG(
          CONCAT(wp.product_name, ' x', COALESCE(wp.quantity, 0)),
          ' | ' ORDER BY wp.product_name, wp.created_at
        ) AS products_summary
      FROM rdb.waitry_productos wp
      GROUP BY wp.order_id
    ),
    pagos_agg AS (
      SELECT
        pg.order_id,
        COUNT(*) FILTER (WHERE pg.amount > 0) AS positive_payment_count,
        COUNT(*) FILTER (WHERE pg.amount < 0) AS negative_payment_count,
        ROUND(SUM(CASE WHEN pg.amount > 0 THEN pg.amount ELSE 0 END), 2) AS total_positive_amount,
        ROUND(ABS(SUM(CASE WHEN pg.amount < 0 THEN pg.amount ELSE 0 END)), 2) AS total_negative_amount,
        ROUND(SUM(pg.amount), 2) AS net_payments,
        STRING_AGG(
          CONCAT(pg.payment_method, ':', pg.amount),
          ' | ' ORDER BY pg.created_at, pg.payment_id
        ) AS payments_summary,
        ARRAY_AGG(DISTINCT pg.payment_method) FILTER (WHERE pg.amount > 0) AS positive_methods,
        ARRAY_AGG(DISTINCT pg.payment_method) FILTER (WHERE pg.amount < 0) AS negative_methods
      FROM rdb.waitry_pagos pg
      GROUP BY pg.order_id
    ),
    matched_pairs AS (
      SELECT
        pos.order_id,
        COUNT(*) AS matched_pair_count,
        ROUND(SUM(pos.amount), 2) AS matched_amount_total,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'positive_payment_id', pos.payment_id,
            'positive_method', pos.payment_method,
            'positive_amount', pos.amount,
            'positive_created_at', pos.created_at,
            'negative_payment_id', neg.payment_id,
            'negative_method', neg.payment_method,
            'negative_amount', neg.amount,
            'negative_created_at', neg.created_at,
            'same_method', pos.payment_method = neg.payment_method
          )
          ORDER BY pos.created_at, neg.created_at
        ) AS matched_pairs
      FROM rdb.waitry_pagos pos
      JOIN rdb.waitry_pagos neg
        ON neg.order_id = pos.order_id
       AND pos.amount > 0
       AND neg.amount < 0
       AND ABS(pos.amount) = ABS(neg.amount)
      GROUP BY pos.order_id
    ),
    latest_inbound AS (
      SELECT DISTINCT ON (wi.order_id)
        wi.order_id, wi.payload_json, wi.created_at
      FROM rdb.waitry_inbound wi
      WHERE wi.payload_json IS NOT NULL
      ORDER BY wi.order_id, wi.created_at DESC
    ),
    staff_agg AS (
      SELECT
        li.order_id,
        NULLIF(TRIM(CONCAT_WS(' ',
          li.payload_json #>> '{orderUsers,0,user,person,name}',
          li.payload_json #>> '{orderUsers,0,user,person,lastName}'
        )), '') AS mesero_nombre,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ',
            li.payload_json #>> '{orderActions,0,user,person,name}',
            li.payload_json #>> '{orderActions,0,user,person,lastName}'
          )), ''),
          NULLIF(TRIM(CONCAT_WS(' ',
            li.payload_json #>> '{orderUsers,0,user,person,name}',
            li.payload_json #>> '{orderUsers,0,user,person,lastName}'
          )), '')
        ) AS pos_nombre,
        COALESCE(
          li.payload_json #>> '{orderActions,0,user,username}',
          li.payload_json #>> '{orderUsers,0,user,username}'
        ) AS pos_username,
        COALESCE(
          li.payload_json #>> '{orderActions,0,user,email}',
          li.payload_json #>> '{orderUsers,0,user,email}'
        ) AS pos_email,
        COALESCE(
          li.payload_json #>> '{orderActions,0,user,userId}',
          li.payload_json #>> '{orderUsers,0,user,userId}'
        ) AS pos_user_id
      FROM latest_inbound li
    )
    SELECT
      pb.order_id, pb.timestamp, pb.status, pb.place_name, pb.layout_name,
      pb.table_name, pb.corte_id, pb.total_amount, pb.total_discount,
      pb.tax, pb.service_charge,
      pa.product_lines, pa.product_qty, pa.product_total, pa.products_summary,
      sa.mesero_nombre, sa.pos_nombre, sa.pos_username, sa.pos_email, sa.pos_user_id,
      pg.positive_payment_count, pg.negative_payment_count,
      pg.total_positive_amount, pg.total_negative_amount, pg.net_payments,
      pg.positive_methods, pg.negative_methods, pg.payments_summary,
      mp.matched_pair_count, mp.matched_amount_total, mp.matched_pairs,
      CASE
        WHEN ABS(pg.net_payments) < 0.01 THEN 'zero_net'
        ELSE 'partial_net'
      END AS anomaly_type,
      (ABS(pg.net_payments) < 0.01) AS is_zero_net,
      (ABS(pg.net_payments) >= 0.01) AS is_partial_net,
      TRUE AS looks_like_unmarked_cancellation
    FROM pedidos_base pb
    JOIN productos_agg pa ON pa.order_id = pb.order_id
    JOIN pagos_agg pg ON pg.order_id = pb.order_id
    JOIN matched_pairs mp ON mp.order_id = pb.order_id
    LEFT JOIN staff_agg sa ON sa.order_id = pb.order_id
    WHERE pa.product_lines > 0
      AND pg.positive_payment_count > 0
      AND pg.negative_payment_count > 0
    ORDER BY pb.timestamp DESC
  $sql$;

  GRANT SELECT ON rdb.v_waitry_pedidos_reversa_sospechosa TO service_role, authenticated;
END $do$;
