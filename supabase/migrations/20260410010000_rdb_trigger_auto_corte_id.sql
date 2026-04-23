-- ============================================================
-- MIGRATION: 20260410010000_rdb_trigger_auto_corte_id
--
-- Fix: El trigger process_waitry_inbound nunca asignaba corte_id
-- a los pedidos que llegaban. Lo dejaba en NULL siempre, requiriendo
-- asignación manual.
--
-- Fix: Al finalizar el upsert de waitry_pedidos, buscar el corte
-- con estado = 'abierto' y asignarlo automáticamente al pedido
-- si aún no tiene corte_id.
-- ============================================================

CREATE OR REPLACE FUNCTION rdb.process_waitry_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rdb, public
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
  v_tz_name         TEXT;
  v_ts_date_str     TEXT;
BEGIN
  -- ── Desenvolver payload ──────────────────────────────────────
  p := NEW.payload_json;

  IF p ? 'payload' THEN
    p := p -> 'payload';
  END IF;

  IF (p ? 'backfill') OR NOT (p ? 'orderId' OR p ? 'order_id') THEN
    RETURN NEW;
  END IF;

  -- ── Extraer campos del pedido ───────────────────────────────
  v_order_id := COALESCE(
    NEW.order_id,
    (p ->> 'orderId'),
    (p ->> 'order_id')
  );

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
  v_place_id        := COALESCE(
                         (p -> 'table' -> 'place' ->> 'placeId')::INTEGER,
                         (p ->> 'placeId')::INTEGER
                       );
  v_place_name      := COALESCE(
                         p -> 'table' -> 'place' ->> 'name',
                         p ->> 'placeName'
                       );
  v_table_name      := COALESCE(
                         p -> 'table' ->> 'name',
                         p ->> 'tableName'
                       );
  v_layout_name     := COALESCE(
                         p -> 'table' -> 'layout' ->> 'name',
                         p ->> 'layoutName'
                       );

  -- ── Timestamp del pedido ─────────────────────────────────────
  -- Lee timezone directamente del payload (fix 20260410000000)
  v_ts_date_str := p -> 'timestamp' ->> 'date';
  v_tz_name     := COALESCE(p -> 'timestamp' ->> 'timezone', 'America/Argentina/Buenos_Aires');

  v_timestamp := COALESCE(
    CASE
      WHEN v_ts_date_str IS NOT NULL THEN
        to_timestamp(v_ts_date_str, 'YYYY-MM-DD HH24:MI:SS.US')
          AT TIME ZONE v_tz_name
      ELSE NULL
    END,
    (p ->> 'timestamp')::TIMESTAMPTZ
  );

  -- ── lastActionAt ─────────────────────────────────────────────
  SELECT to_timestamp(
    (action -> 'timestamp' ->> 'date'), 'YYYY-MM-DD HH24:MI:SS.US'
  ) AT TIME ZONE COALESCE(
    action -> 'timestamp' ->> 'timezone',
    'America/Argentina/Buenos_Aires'
  )
  INTO v_last_action_at
  FROM jsonb_array_elements(COALESCE(p -> 'orderActions', '[]'::jsonb)) AS action
  ORDER BY (action -> 'timestamp' ->> 'date') DESC
  LIMIT 1;

  -- ── Content hash ─────────────────────────────────────────────
  v_content_hash := rdb.compute_content_hash(
    COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb),
    v_total_amount,
    v_table_name
  );

  -- ── Buscar corte abierto para asignar automáticamente ────────
  SELECT id INTO v_corte_id
  FROM rdb.cortes
  WHERE estado = 'abierto'
  ORDER BY hora_inicio DESC
  LIMIT 1;

  -- ── Upsert waitry_pedidos ───────────────────────────────────
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
    -- Solo asignar corte_id si aún es NULL (no sobreescribir asignación manual)
    corte_id         = COALESCE(rdb.waitry_pedidos.corte_id, EXCLUDED.corte_id),
    updated_at       = now();

  -- ── Upsert waitry_productos ─────────────────────────────────
  FOR item IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb)
    )
  LOOP
    CONTINUE WHEN (item ->> 'deletedAt') IS NOT NULL
               OR (item ->> 'cancelled')::boolean = true
               OR (item ->> 'canceled')::boolean = true;

    v_product_id   := COALESCE(
                        item -> 'item' ->> 'itemId',
                        item ->> 'itemId',
                        item ->> 'productId'
                      );
    v_product_name := COALESCE(
                        item -> 'item' ->> 'name',
                        item ->> 'name'
                      );
    v_quantity     := COALESCE((item ->> 'count')::NUMERIC, (item ->> 'quantity')::NUMERIC, 1);
    v_unit_price   := COALESCE(
                        (item ->> 'discountPrice')::NUMERIC,
                        (item -> 'item' ->> 'price')::NUMERIC,
                        (item ->> 'price')::NUMERIC
                      );
    v_total_price  := COALESCE((item ->> 'subtotal')::NUMERIC, v_quantity * v_unit_price);

    CONTINUE WHEN v_product_name IS NULL;

    INSERT INTO rdb.waitry_productos (
      order_id, product_id, product_name, quantity, unit_price, total_price, notes
    ) VALUES (
      v_order_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_total_price,
      item ->> 'notes'
    )
    ON CONFLICT (order_id, product_id, product_name) DO NOTHING;
  END LOOP;

  -- ── Upsert waitry_pagos ─────────────────────────────────────
  FOR pay IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(p -> 'payments', '[]'::jsonb)
    )
  LOOP
    v_payment_id     := COALESCE(
                          pay ->> 'orderPaymentId',
                          pay ->> 'paymentId',
                          pay ->> 'id',
                          pay ->> 'paidId'
                        );
    IF v_payment_id = '' THEN v_payment_id := NULL; END IF;

    v_payment_method := COALESCE(
                          pay -> 'paymentType' ->> 'name',
                          pay ->> 'method',
                          pay ->> 'type',
                          pay ->> 'gateway'
                        );
    v_amount         := (pay ->> 'amount')::NUMERIC;

    v_created_at := COALESCE(
      CASE
        WHEN (pay -> 'createdAt' ->> 'date') IS NOT NULL THEN
          to_timestamp(pay -> 'createdAt' ->> 'date', 'YYYY-MM-DD HH24:MI:SS.US')
            AT TIME ZONE COALESCE(
              pay -> 'createdAt' ->> 'timezone',
              'America/Argentina/Buenos_Aires'
            )
        ELSE NULL
      END,
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

-- Re-crear trigger — EDITED 2026-04-23 (drift-1.5): rdb.waitry_inbound ambient.
DO $do$
BEGIN
  IF to_regclass('rdb.waitry_inbound') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_process_waitry_inbound ON rdb.waitry_inbound;
    CREATE TRIGGER trg_process_waitry_inbound
    BEFORE INSERT OR UPDATE OF payload_json ON rdb.waitry_inbound
    FOR EACH ROW
    EXECUTE FUNCTION rdb.process_waitry_inbound();
  END IF;
END $do$;
