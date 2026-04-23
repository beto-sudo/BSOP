-- ============================================================
-- MIGRATION: 20260412135500_rdb_fix_waitry_payload_timestamps_v2
--
-- Objetivo:
-- - Parsear correctamente timestamps tipo Waitry desde el payload JSON
-- - Corregir pedidos y pagos históricos ya guardados con desfase
-- - Dejar BSOP y Coda consumiendo datos correctos sin offsets hardcodeados
-- ============================================================

CREATE OR REPLACE FUNCTION rdb.parse_waitry_timestamptz(
  p_value JSONB,
  p_fallback_tz TEXT DEFAULT 'America/Argentina/Buenos_Aires'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_date TEXT;
  v_tz   TEXT;
  v_text TEXT;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      v_date := NULLIF(p_value ->> 'date', '');
      v_tz := COALESCE(NULLIF(p_value ->> 'timezone', ''), p_fallback_tz);

      IF v_date IS NULL THEN
        RETURN NULL;
      END IF;

      RETURN (v_date::timestamp AT TIME ZONE v_tz);

    WHEN 'string' THEN
      v_text := NULLIF(trim(both '"' from p_value::text), '');

      IF v_text IS NULL THEN
        RETURN NULL;
      END IF;

      BEGIN
        RETURN v_text::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;

    ELSE
      RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION rdb.process_waitry_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rdb, public
AS $$
DECLARE
  p                 JSONB;
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

  v_order_id := COALESCE(NEW.order_id, p ->> 'orderId', p ->> 'order_id');

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

  INSERT INTO rdb.waitry_pedidos (
    order_id, status, paid, "timestamp", place_id, place_name,
    table_name, layout_name, total_amount, total_discount,
    service_charge, tax, external_delivery_id, notes,
    last_action_at, content_hash
  ) VALUES (
    v_order_id, v_status, v_paid, v_timestamp, v_place_id, v_place_name,
    v_table_name, v_layout_name, v_total_amount, v_total_discount,
    v_service_charge, v_tax, v_ext_delivery_id, v_notes,
    v_last_action_at, v_content_hash
  )
  ON CONFLICT (order_id) DO UPDATE SET
    status = EXCLUDED.status,
    paid = EXCLUDED.paid,
    "timestamp" = COALESCE(EXCLUDED."timestamp", rdb.waitry_pedidos."timestamp"),
    place_id = COALESCE(EXCLUDED.place_id, rdb.waitry_pedidos.place_id),
    place_name = COALESCE(EXCLUDED.place_name, rdb.waitry_pedidos.place_name),
    table_name = COALESCE(EXCLUDED.table_name, rdb.waitry_pedidos.table_name),
    layout_name = COALESCE(EXCLUDED.layout_name, rdb.waitry_pedidos.layout_name),
    total_amount = COALESCE(EXCLUDED.total_amount, rdb.waitry_pedidos.total_amount),
    total_discount = COALESCE(EXCLUDED.total_discount, rdb.waitry_pedidos.total_discount),
    service_charge = COALESCE(EXCLUDED.service_charge, rdb.waitry_pedidos.service_charge),
    tax = COALESCE(EXCLUDED.tax, rdb.waitry_pedidos.tax),
    external_delivery_id = COALESCE(EXCLUDED.external_delivery_id, rdb.waitry_pedidos.external_delivery_id),
    last_action_at = COALESCE(EXCLUDED.last_action_at, rdb.waitry_pedidos.last_action_at),
    content_hash = COALESCE(EXCLUDED.content_hash, rdb.waitry_pedidos.content_hash),
    updated_at = now();

  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb))
  LOOP
    CONTINUE WHEN (item ->> 'deletedAt') IS NOT NULL
      OR (item ->> 'cancelled')::boolean = true
      OR (item ->> 'canceled')::boolean = true;

    v_product_id := COALESCE(item -> 'item' ->> 'itemId', item ->> 'itemId', item ->> 'productId');
    v_product_name := COALESCE(item -> 'item' ->> 'name', item ->> 'name');
    v_quantity := COALESCE((item ->> 'count')::NUMERIC, (item ->> 'quantity')::NUMERIC, 1);
    v_unit_price := COALESCE(
      (item ->> 'discountPrice')::NUMERIC,
      (item -> 'item' ->> 'price')::NUMERIC,
      (item ->> 'price')::NUMERIC
    );
    v_total_price := COALESCE((item ->> 'subtotal')::NUMERIC, v_quantity * v_unit_price);

    CONTINUE WHEN v_product_name IS NULL;

    INSERT INTO rdb.waitry_productos (
      order_id, product_id, product_name, quantity, unit_price, total_price, notes
    ) VALUES (
      v_order_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_total_price,
      item ->> 'notes'
    )
    ON CONFLICT (order_id, product_id, product_name) DO NOTHING;
  END LOOP;

  FOR pay IN
    SELECT value FROM jsonb_array_elements(COALESCE(p -> 'payments', '[]'::jsonb))
  LOOP
    v_payment_id := COALESCE(pay ->> 'orderPaymentId', pay ->> 'paymentId', pay ->> 'id', pay ->> 'paidId');
    IF v_payment_id = '' THEN v_payment_id := NULL; END IF;

    v_payment_method := COALESCE(
      pay -> 'paymentType' ->> 'name',
      pay ->> 'method',
      pay ->> 'type',
      pay ->> 'gateway'
    );
    v_amount := (pay ->> 'amount')::NUMERIC;
    v_created_at := COALESCE(
      rdb.parse_waitry_timestamptz(pay -> 'createdAt'),
      (pay ->> 'createdAt')::TIMESTAMPTZ,
      now()
    );

    INSERT INTO rdb.waitry_pagos (
      order_id, payment_id, payment_method, amount, created_at
    ) VALUES (
      v_order_id, v_payment_id, v_payment_method, v_amount, v_created_at
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  NEW.processed := true;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  NEW.error := SQLERRM;
  RETURN NEW;
END;
$$;

-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_inbound / waitry_pedidos /
-- waitry_pagos are ambient. Wrap the corrective UPDATEs in a guard so a
-- fresh DB without those tables (Preview Branch / dev local) skips them.
DO $do$
BEGIN
  IF to_regclass('rdb.waitry_inbound') IS NULL
     OR to_regclass('rdb.waitry_pedidos') IS NULL
     OR to_regclass('rdb.waitry_pagos') IS NULL THEN
    RETURN;
  END IF;

  WITH latest_inbound AS (
    SELECT DISTINCT ON (wi.order_id)
      wi.order_id,
      CASE
        WHEN wi.payload_json ? 'payload' THEN wi.payload_json -> 'payload'
        ELSE wi.payload_json
      END AS payload
    FROM rdb.waitry_inbound wi
    WHERE wi.order_id IS NOT NULL
    ORDER BY wi.order_id, wi.created_at DESC
  ), pedidos_source AS (
    SELECT
      li.order_id,
      rdb.parse_waitry_timestamptz(li.payload -> 'timestamp') AS pedido_timestamp,
      (
        SELECT rdb.parse_waitry_timestamptz(action -> 'timestamp')
        FROM jsonb_array_elements(COALESCE(li.payload -> 'orderActions', '[]'::jsonb)) AS action
        ORDER BY rdb.parse_waitry_timestamptz(action -> 'timestamp') DESC NULLS LAST
        LIMIT 1
      ) AS last_action_at
    FROM latest_inbound li
  )
  UPDATE rdb.waitry_pedidos wp
  SET
    "timestamp" = COALESCE(ps.pedido_timestamp, wp."timestamp"),
    last_action_at = COALESCE(ps.last_action_at, wp.last_action_at),
    updated_at = now()
  FROM pedidos_source ps
  WHERE wp.order_id = ps.order_id
    AND (
      wp."timestamp" IS DISTINCT FROM ps.pedido_timestamp
      OR wp.last_action_at IS DISTINCT FROM ps.last_action_at
    );

  WITH latest_inbound AS (
    SELECT DISTINCT ON (wi.order_id)
      wi.order_id,
      CASE
        WHEN wi.payload_json ? 'payload' THEN wi.payload_json -> 'payload'
        ELSE wi.payload_json
      END AS payload
    FROM rdb.waitry_inbound wi
    WHERE wi.order_id IS NOT NULL
    ORDER BY wi.order_id, wi.created_at DESC
  ), pagos_source AS (
    SELECT
      li.order_id,
      COALESCE(pay ->> 'orderPaymentId', pay ->> 'paymentId', pay ->> 'id', pay ->> 'paidId') AS payment_id,
      rdb.parse_waitry_timestamptz(pay -> 'createdAt') AS created_at
    FROM latest_inbound li
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(li.payload -> 'payments', '[]'::jsonb)) AS pay
  )
  UPDATE rdb.waitry_pagos wp
  SET created_at = ps.created_at
  FROM pagos_source ps
  WHERE wp.order_id = ps.order_id
    AND wp.payment_id = ps.payment_id
    AND ps.payment_id IS NOT NULL
    AND ps.payment_id <> ''
    AND ps.created_at IS NOT NULL
    AND wp.created_at IS DISTINCT FROM ps.created_at;
END $do$;
