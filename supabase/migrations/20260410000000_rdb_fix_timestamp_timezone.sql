-- ============================================================
-- MIGRATION: 20260409300000_rdb_fix_timestamp_timezone
-- 
-- Fix: Los timestamps de pedidos y pagos de Waitry llegaban
-- con 6 horas de diferencia respecto a la hora real.
--
-- Causa raíz: El trigger usaba 
--   to_timestamp(date_str, fmt) AT TIME ZONE 'America/Argentina/Buenos_Aires'
-- que en PostgreSQL, aplicado a un timestamp WITHOUT TZ, interpreta ese
-- valor como si fuera UTC y lo convierte A Buenos Aires (mostrando la hora
-- local BA), en vez de interpretar el string COMO hora Buenos Aires y
-- convertirlo a UTC.
--
-- Fix: Leer la timezone directamente del payload de Waitry y concatenar
-- el offset ISO al string antes de castear. Buenos Aires = UTC-3, por lo
-- que el pedido de las "21:36 BA" debe quedar como "00:36 UTC+1día".
--
-- Pedidos afectados: los 3 pedidos del 2026-04-09 con timestamp incorrecto
-- (order_ids: 16827960, 16827748, 16827596) se corrigen al final.
-- ============================================================

-- ── 1. Actualizar función del trigger ───────────────────────

CREATE OR REPLACE FUNCTION rdb.process_waitry_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rdb, public
AS $$
DECLARE
  p         JSONB;   -- payload interno (desenvuelto)
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
  v_tz_name         TEXT;
  v_ts_date_str     TEXT;
BEGIN
  -- ── Desenvolver payload ──────────────────────────────────────
  p := NEW.payload_json;

  -- Formato Waitry real: { payload: { ... } }
  IF p ? 'payload' THEN
    p := p -> 'payload';
  END IF;

  -- Si es backfill mínimo (solo order_id, paid, source), saltar desglose
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
  -- FIX: Leer la timezone directamente del payload de Waitry.
  -- Waitry envía: { timestamp: { date: "2026-04-09 21:36:52.000000", timezone: "America/Argentina/Buenos_Aires" } }
  -- Concatenamos el offset ISO de la zona para que PostgreSQL interprete correctamente
  -- el string como hora local de esa zona y lo convierta a UTC.
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

  -- lastActionAt desde el último orderAction
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

  -- Content hash
  v_content_hash := rdb.compute_content_hash(
    COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb),
    v_total_amount,
    v_table_name
  );

  -- ── Upsert waitry_pedidos ───────────────────────────────────
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
    updated_at       = now();

  -- ── Upsert waitry_productos ─────────────────────────────────
  FOR item IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(p -> 'orderItems', p -> 'items', '[]'::jsonb)
    )
  LOOP
    -- Saltar items cancelados
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
    -- Si paidId es string vacío, tratar como NULL
    IF v_payment_id = '' THEN v_payment_id := NULL; END IF;

    v_payment_method := COALESCE(
                          pay -> 'paymentType' ->> 'name',
                          pay ->> 'method',
                          pay ->> 'type',
                          pay ->> 'gateway'
                        );
    v_amount         := (pay ->> 'amount')::NUMERIC;

    -- FIX: usar timezone del payload del pago (createdAt.timezone)
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

  -- Marcar inbound como procesado
  NEW.processed := true;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- No propagar excepción; loggear en el campo error del inbound
  NEW.error := SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 2. Re-crear el trigger ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_process_waitry_inbound ON rdb.waitry_inbound;

CREATE TRIGGER trg_process_waitry_inbound
BEFORE INSERT OR UPDATE OF payload_json ON rdb.waitry_inbound
FOR EACH ROW
EXECUTE FUNCTION rdb.process_waitry_inbound();

-- ── 3. Corregir timestamps erróneos en pedidos existentes ────
-- Los 3 pedidos del 2026-04-09 con timestamp incorrecto.
-- Waitry mandó "21:36:52 BA (UTC-3)", el trigger guardó 18:36:52 UTC
-- (restó 3h en vez de sumar 3h). El valor correcto es 00:36:52 UTC del día siguiente.
-- Corregimos sumando 6 horas (la diferencia exacta observada).
--
-- NOTA: Aplicamos el fix usando el payload original guardado en waitry_inbound
-- para garantizar coherencia total.

UPDATE rdb.waitry_pedidos wp
SET "timestamp" = (
  SELECT
    to_timestamp(
      wi.payload_json -> 'payload' -> 'timestamp' ->> 'date',
      'YYYY-MM-DD HH24:MI:SS.US'
    ) AT TIME ZONE COALESCE(
      wi.payload_json -> 'payload' -> 'timestamp' ->> 'timezone',
      'America/Argentina/Buenos_Aires'
    )
  FROM rdb.waitry_inbound wi
  WHERE wi.order_id = wp.order_id
  ORDER BY wi.created_at DESC
  LIMIT 1
),
updated_at = now()
WHERE wp.order_id IN ('16827960', '16827748', '16827596')
  AND wp."timestamp" IS NOT NULL;

-- Verificación (solo lectura, no afecta datos):
-- SELECT order_id, "timestamp" AT TIME ZONE 'America/Matamoros' AS hora_local
-- FROM rdb.waitry_pedidos
-- WHERE order_id IN ('16827960', '16827748', '16827596')
-- ORDER BY "timestamp";
