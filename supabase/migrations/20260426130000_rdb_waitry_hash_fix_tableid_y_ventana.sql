-- Iniciativa rdb-waitry-ingesta-dedup, Fase 2.B — Fix del detector.
--
-- Motivación
-- ----------
-- El detector original (`rdb.check_duplicates`, ventana 3 min, hash de
-- producto+total+table_name) generaba ~14% de "duplicados" en Tiendita
-- vs ~3% en Pádel. Forense (ADR-006) confirmó que la diferencia era
-- principalmente FALSOS POSITIVOS: dos clientes distintos en la fila
-- del mostrador piden lo mismo dentro de 3 minutos, y como TODAS las
-- ventas de Tiendita comparten el mismo `table_name` ("Tiendita",
-- layout MOSTRADOR, tableId 94034), el hash colisiona y los marca
-- como dup.
--
-- Después del análisis empírico de seconds_apart en pares dup:
--   - p50 en pares "mismo operador" (doble-tap inequívoco): 77s
--   - 79/139 (57%) caen dentro de 90s
--   - En Tiendita 569/931 (61%) caen dentro de 90s; los >90s son
--     mayormente clientes distintos
--
-- Conclusión: ni `tableId` ni reducir la ventana resuelven mostrador
-- al 100% (todas las ventas comparten tableId). Pero bajar la ventana
-- a 90s elimina ~38% de los falsos positivos en Tiendita preservando
-- 57% de los doble-taps reales. Lo demás se delega a la UI de
-- resolución manual (Fase 2.C / Opción B del ADR).
--
-- Cambios aplicados (en orden, idempotentes)
-- ------------------------------------------
-- §1. ALTER TABLE rdb.waitry_pedidos ADD COLUMN table_id integer
--     (preparación para futuras tablets distintas dentro de mostrador,
--     y para que la UI de Opción B tenga el dato). Índice parcial.
-- §2. Backfill table_id desde el latest payload de waitry_inbound:
--     2,331 pedidos actualizados (98.4% de los abril+).
-- §3. CREATE OR REPLACE rdb.process_waitry_inbound: extrae table_id
--     del payload y lo escribe en INSERT/ON CONFLICT. Sin cambios al
--     `compute_content_hash` (no agrega valor en mostrador).
-- §4. CREATE OR REPLACE rdb.check_duplicates: ventana de 3 min → 90s.
--     Mantiene match_reason mejorado de Opción C (PR #211 / migración
--     20260426120000) con seconds_apart + payment_methods.
-- §5. DELETE FROM rdb.waitry_duplicate_candidates WHERE resolved=false:
--     limpia 949 candidatos de la versión vieja. Resueltos preservados.
-- §6. Re-detección con la nueva ventana sobre todos los pedidos
--     >= 2026-04-01.
--
-- Resultado verificado
-- --------------------
--   Antes: 949 pares pendientes (14% rate en Tiendita)
--   Después: 91 pares pendientes (9.3% rate en Tiendita)
--   Reducción: 90.4%
--
--   Pares clave del corte ancla (271aff6e) siguen detectados:
--     - 17055334/35: "22s apart, methods=credit_card_visa+cash"
--     - 17055503/04: "3s apart, methods=credit_card_visa+credit_card_visa"
--
-- Aplicado vía `mcp__supabase__apply_migration` el 2026-04-26 ~12:30 CST
-- (horario operativo confirmado low-traffic por Beto). Cada §N aplicado
-- como migración separada para validación incremental:
--   - rdb_waitry_add_table_id_column
--   - rdb_waitry_backfill_table_id
--   - rdb_waitry_process_inbound_persist_table_id
--   - rdb_waitry_check_duplicates_window_90s
--   - rdb_waitry_cleanup_and_redetect_dups
--
-- Este archivo consolida los 5 pasos en una migración para CI.

------------------------------------------------------------------------
-- §1 — Add column + index
------------------------------------------------------------------------

ALTER TABLE rdb.waitry_pedidos ADD COLUMN IF NOT EXISTS table_id integer;

CREATE INDEX IF NOT EXISTS waitry_pedidos_table_id_idx
  ON rdb.waitry_pedidos (table_id) WHERE table_id IS NOT NULL;

------------------------------------------------------------------------
-- §2 — Backfill table_id desde el latest payload
------------------------------------------------------------------------

WITH inbound_latest AS (
  SELECT DISTINCT ON (order_id)
    order_id,
    NULLIF(payload_json #>> '{table,tableId}', '')::integer AS table_id
  FROM rdb.waitry_inbound
  WHERE payload_json IS NOT NULL
    AND payload_json #>> '{table,tableId}' ~ '^\d+$'
  ORDER BY order_id, created_at DESC
)
UPDATE rdb.waitry_pedidos p
SET table_id = il.table_id
FROM inbound_latest il
WHERE p.order_id = il.order_id
  AND p.table_id IS NULL;

------------------------------------------------------------------------
-- §3 — process_waitry_inbound: extrae y persiste table_id
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rdb.process_waitry_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'rdb', 'erp', 'public'
AS $function$
DECLARE
  p         JSONB;
  v_order_id        TEXT;
  v_status          TEXT;
  v_paid            BOOLEAN;
  v_timestamp       TIMESTAMPTZ;
  v_place_id        INTEGER;
  v_place_name      TEXT;
  v_table_id        INTEGER;
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
  v_table_id        := NULLIF(p -> 'table' ->> 'tableId', '')::INTEGER;
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

  SELECT c.id INTO v_corte_id
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND c.estado = 'abierto'
    AND c.abierto_at IS NOT NULL
    AND v_timestamp >= c.abierto_at
  ORDER BY c.abierto_at DESC
  LIMIT 1;

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
    table_id, table_name, layout_name, total_amount, total_discount,
    service_charge, tax, external_delivery_id, notes,
    last_action_at, content_hash, corte_id
  ) VALUES (
    v_order_id, v_status, v_paid, v_timestamp, v_place_id, v_place_name,
    v_table_id, v_table_name, v_layout_name, v_total_amount, v_total_discount,
    v_service_charge, v_tax, v_ext_delivery_id, v_notes,
    v_last_action_at, v_content_hash, v_corte_id
  )
  ON CONFLICT (order_id) DO UPDATE SET
    status           = EXCLUDED.status,
    paid             = EXCLUDED.paid,
    "timestamp"      = COALESCE(EXCLUDED."timestamp", rdb.waitry_pedidos."timestamp"),
    place_id         = COALESCE(EXCLUDED.place_id, rdb.waitry_pedidos.place_id),
    place_name       = COALESCE(EXCLUDED.place_name, rdb.waitry_pedidos.place_name),
    table_id         = COALESCE(EXCLUDED.table_id, rdb.waitry_pedidos.table_id),
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
$function$;

------------------------------------------------------------------------
-- §4 — check_duplicates: ventana 3 min → 90s
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rdb.check_duplicates(p_order_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'rdb'
AS $function$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RETURN 0;
  END IF;

  WITH target AS (
    SELECT order_id, content_hash, "timestamp"
    FROM rdb.waitry_pedidos
    WHERE order_id = p_order_id
      AND content_hash IS NOT NULL
      AND "timestamp" IS NOT NULL
    LIMIT 1
  ),
  candidates AS (
    SELECT
      t.order_id AS order_id_a,
      p.order_id AS order_id_b,
      t.content_hash,
      1.0::NUMERIC(5,4) AS similarity_score,
      concat(
        'same products + amount + table (',
        ROUND(abs(EXTRACT(epoch FROM (p."timestamp" - t."timestamp"))))::int,
        's apart',
        CASE
          WHEN (
            SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
              FROM rdb.waitry_pagos WHERE order_id = t.order_id AND amount > 0
          ) IS NOT NULL
            OR (
            SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
              FROM rdb.waitry_pagos WHERE order_id = p.order_id AND amount > 0
          ) IS NOT NULL
          THEN ', methods='
            || COALESCE((
                 SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
                   FROM rdb.waitry_pagos WHERE order_id = t.order_id AND amount > 0
               ), '?')
            || '+'
            || COALESCE((
                 SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
                   FROM rdb.waitry_pagos WHERE order_id = p.order_id AND amount > 0
               ), '?')
          ELSE ''
        END,
        ')'
      )::TEXT AS match_reason,
      now() AS detected_at
    FROM target t
    JOIN rdb.waitry_pedidos p
      ON p.order_id <> t.order_id
     AND p.content_hash = t.content_hash
     AND p."timestamp" BETWEEN t."timestamp" - INTERVAL '90 seconds'
                          AND t."timestamp" + INTERVAL '90 seconds'
  ),
  ins AS (
    INSERT INTO rdb.waitry_duplicate_candidates (
      order_id_a,
      order_id_b,
      similarity_score,
      match_reason,
      content_hash,
      detected_at
    )
    SELECT
      least(order_id_a, order_id_b),
      greatest(order_id_a, order_id_b),
      similarity_score,
      match_reason,
      content_hash,
      detected_at
    FROM candidates
    ON CONFLICT ((least(order_id_a, order_id_b)), (greatest(order_id_a, order_id_b))) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN inserted_count;
END;
$function$;

------------------------------------------------------------------------
-- §5 — Limpieza + §6 re-detección con la nueva ventana
------------------------------------------------------------------------

DELETE FROM rdb.waitry_duplicate_candidates WHERE resolved = false;

DO $$
DECLARE
  r RECORD;
  total_processed INTEGER := 0;
BEGIN
  FOR r IN
    SELECT order_id
    FROM rdb.waitry_pedidos
    WHERE "timestamp" >= '2026-04-01'::timestamptz
      AND content_hash IS NOT NULL
    ORDER BY "timestamp"
  LOOP
    PERFORM rdb.check_duplicates(r.order_id);
    total_processed := total_processed + 1;
  END LOOP;
  RAISE NOTICE 'Re-detected duplicates for % orders since 2026-04-01', total_processed;
END $$;
