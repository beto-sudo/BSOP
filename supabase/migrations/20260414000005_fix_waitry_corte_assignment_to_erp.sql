-- ============================================================
-- Fix Waitry -> corte assignment after moving cortes to erp
-- Root cause: process_waitry_inbound still searched open cut in rdb.cortes
-- ============================================================

CREATE OR REPLACE FUNCTION rdb.process_waitry_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rdb, erp, public
AS $$
DECLARE
  p         JSONB;
  v_order_id        TEXT;
  v_status          TEXT;
  v_paid            BOOLEAN;
  v_timestamp       TIMESTAMPTZ;
  v_place_id        INTEGER;
  v_place_name      TEXT;
  v_table_name      TEXT;
  v_layout_name     TEXT;
  v_total_amount    NUMERIC(14,2);
  v_total_discount  NUMERIC(14,2);
  v_service_charge  NUMERIC(14,2);
  v_tax             NUMERIC(14,2);
  v_ext_delivery_id TEXT;
  v_notes           TEXT;
  v_last_action_at  TIMESTAMPTZ;
  v_content_hash    TEXT;
  v_corte_id        UUID;
  item              JSONB;
  pay               JSONB;
  v_product_id      TEXT;
  v_product_name    TEXT;
  v_quantity        NUMERIC(10,3);
  v_unit_price      NUMERIC(14,2);
  v_total_price     NUMERIC(14,2);
  v_payment_id      TEXT;
  v_payment_method  TEXT;
  v_amount          NUMERIC(14,2);
  v_created_at      TIMESTAMPTZ;
BEGIN
  p := NEW.payload_json;

  IF p ? 'payload' THEN
    p := p -> 'payload';
  END IF;

  IF (p ? 'backfill') OR NOT (p ? 'orderId' OR p ? 'order_id') THEN
    RETURN NEW;
  END IF;

  v_order_id := COALESCE(NEW.order_id, (p ->> 'orderId'), (p ->> 'order_id'));
  IF v_order_id IS NULL OR v_order_id = '' OR v_order_id = 'unknown' THEN
    RETURN NEW;
  END IF;

  v_status          := COALESCE(p ->> 'event', p ->> 'status', NEW.event);
  v_paid            := COALESCE((p ->> 'paid')::boolean, false);
  v_total_amount    := (p ->> 'totalAmount')::NUMERIC;
  v_total_discount  := (p ->> 'totalDiscount')::NUMERIC;
  v_service_charge  := (p ->> 'serviceCharge')::NUMERIC;
  v_tax             := COALESCE((p -> 'table' -> 'place' ->> 'tax')::NUMERIC, (p ->> 'tax')::NUMERIC);
  v_ext_delivery_id := COALESCE(p ->> 'externalDeliveryId', p ->> 'extDeliveryId');
  v_notes           := p ->> 'notes';
  v_place_id        := COALESCE((p -> 'table' -> 'place' ->> 'placeId')::INTEGER, (p ->> 'placeId')::INTEGER);
  v_place_name      := COALESCE(p -> 'table' -> 'place' ->> 'name', p ->> 'placeName');
  v_table_name      := COALESCE(p -> 'table' ->> 'name', p ->> 'tableName');
  v_layout_name     := COALESCE(p -> 'table' -> 'layout' ->> 'name', p ->> 'layoutName');

  v_timestamp := COALESCE(
    rdb.parse_waitry_timestamptz(p -> 'timestamp'),
    (p ->> 'timestamp')::TIMESTAMPTZ
  );

  SELECT rdb.parse_waitry_timestamptz(action -> 'timestamp')
  INTO v_last_action_at
  FROM jsonb_array_elements(COALESCE(p -> 'orderActions', '[]'::jsonb)) AS action
  ORDER BY rdb.parse_waitry_timestamptz(action -> 'timestamp') DESC NULLS LAST
  LIMIT 1;

  v_content_hash := rdb.compute_content_hash(
    COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb),
    v_total_amount,
    v_table_name
  );

  -- Find matching corte in erp.cortes_caja
  -- Prefer an open cut whose abierto_at <= order timestamp
  SELECT c.id INTO v_corte_id
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND c.estado = 'abierto'
    AND c.abierto_at IS NOT NULL
    AND v_timestamp >= c.abierto_at
  ORDER BY c.abierto_at DESC
  LIMIT 1;

  -- Fallback: if no open cut, match a closed cut by time range
  IF v_corte_id IS NULL THEN
    SELECT c.id INTO v_corte_id
    FROM erp.cortes_caja c
    WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
      AND c.abierto_at IS NOT NULL
      AND c.cerrado_at IS NOT NULL
      AND v_timestamp >= c.abierto_at
      AND v_timestamp <= c.cerrado_at
    ORDER BY c.abierto_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO rdb.waitry_pedidos (
    order_id, status, paid, "timestamp", place_id, place_name,
    table_name, layout_name, total_amount, total_discount,
    service_charge, tax, external_delivery_id, notes,
    last_action_at, content_hash, corte_id
  ) VALUES (
    v_order_id, v_status, v_paid, v_timestamp, v_place_id, v_place_name,
    v_table_name, v_layout_name, v_total_amount, v_total_discount,
    v_service_charge, v_tax, v_ext_delivery_id, v_notes,
    v_last_action_at, v_content_hash, v_corte_id
  )
  ON CONFLICT (order_id) DO UPDATE SET
    status           = EXCLUDED.status,
    paid             = EXCLUDED.paid,
    "timestamp"      = COALESCE(EXCLUDED."timestamp", rdb.waitry_pedidos."timestamp"),
    place_id         = COALESCE(EXCLUDED.place_id, rdb.waitry_pedidos.place_id),
    place_name       = COALESCE(EXCLUDED.place_name, rdb.waitry_pedidos.place_name),
    table_name       = COALESCE(EXCLUDED.table_name, rdb.waitry_pedidos.table_name),
    layout_name      = COALESCE(EXCLUDED.layout_name, rdb.waitry_pedidos.layout_name),
    total_amount     = COALESCE(EXCLUDED.total_amount, rdb.waitry_pedidos.total_amount),
    total_discount   = COALESCE(EXCLUDED.total_discount, rdb.waitry_pedidos.total_discount),
    service_charge   = COALESCE(EXCLUDED.service_charge, rdb.waitry_pedidos.service_charge),
    tax              = COALESCE(EXCLUDED.tax, rdb.waitry_pedidos.tax),
    external_delivery_id = COALESCE(EXCLUDED.external_delivery_id, rdb.waitry_pedidos.external_delivery_id),
    last_action_at   = COALESCE(EXCLUDED.last_action_at, rdb.waitry_pedidos.last_action_at),
    content_hash     = COALESCE(EXCLUDED.content_hash, rdb.waitry_pedidos.content_hash),
    corte_id         = COALESCE(rdb.waitry_pedidos.corte_id, EXCLUDED.corte_id),
    updated_at       = now();

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb)) LOOP
    CONTINUE WHEN (item ->> 'deletedAt') IS NOT NULL
               OR (item ->> 'cancelled')::boolean = true
               OR (item ->> 'canceled')::boolean = true;

    v_product_id   := COALESCE(item -> 'item' ->> 'itemId', item ->> 'itemId', item ->> 'productId');
    v_product_name := COALESCE(item -> 'item' ->> 'name', item ->> 'name');
    v_quantity     := COALESCE((item ->> 'count')::NUMERIC, (item ->> 'quantity')::NUMERIC, 1);
    v_unit_price   := COALESCE((item ->> 'discountPrice')::NUMERIC, (item -> 'item' ->> 'price')::NUMERIC, (item ->> 'price')::NUMERIC);
    v_total_price  := COALESCE((item ->> 'subtotal')::NUMERIC, v_quantity * v_unit_price);

    CONTINUE WHEN v_product_name IS NULL;

    INSERT INTO rdb.waitry_productos (order_id, product_id, product_name, quantity, unit_price, total_price, notes)
    VALUES (v_order_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_total_price, item ->> 'notes')
    ON CONFLICT (order_id, product_id, product_name) DO NOTHING;
  END LOOP;

  FOR pay IN SELECT value FROM jsonb_array_elements(COALESCE(p -> 'payments', '[]'::jsonb)) LOOP
    v_payment_id     := COALESCE(pay ->> 'orderPaymentId', pay ->> 'paymentId', pay ->> 'id', pay ->> 'paidId');
    IF v_payment_id = '' THEN v_payment_id := NULL; END IF;

    v_payment_method := COALESCE(pay -> 'paymentType' ->> 'name', pay ->> 'method', pay ->> 'type', pay ->> 'gateway');
    v_amount         := (pay ->> 'amount')::NUMERIC;
    v_created_at     := COALESCE(rdb.parse_waitry_timestamptz(pay -> 'createdAt'), (pay ->> 'createdAt')::TIMESTAMPTZ, now());

    INSERT INTO rdb.waitry_pagos (order_id, payment_id, payment_method, amount, created_at)
    VALUES (v_order_id, v_payment_id, v_payment_method, v_amount, v_created_at)
    ON CONFLICT DO NOTHING;
  END LOOP;

  NEW.processed := true;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.error := SQLERRM;
  RETURN NEW;
END;
$$;

-- Backfill orphan orders — EDITED 2026-04-23 (drift-1.5): rdb.waitry_pedidos ambient.
DO $do$ BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    WITH matches AS (
      SELECT DISTINCT ON (wp.order_id)
        wp.order_id,
        c.id AS corte_id
      FROM rdb.waitry_pedidos wp
      JOIN erp.cortes_caja c
        ON c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
       AND c.abierto_at IS NOT NULL
       AND wp."timestamp" >= c.abierto_at
       AND (
         (c.cerrado_at IS NOT NULL AND wp."timestamp" <= c.cerrado_at)
         OR (c.estado = 'abierto' AND c.cerrado_at IS NULL)
       )
      WHERE wp.corte_id IS NULL
        AND wp.status != 'order_cancelled'
      ORDER BY wp.order_id,
        CASE WHEN c.estado = 'abierto' THEN 0 ELSE 1 END,
        c.abierto_at DESC
    )
    UPDATE rdb.waitry_pedidos wp
    SET corte_id = m.corte_id,
        updated_at = now()
    FROM matches m
    WHERE wp.order_id = m.order_id
  $sql$;
END $do$;

NOTIFY pgrst, 'reload schema';
