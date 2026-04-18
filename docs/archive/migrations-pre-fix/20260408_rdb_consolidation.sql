-- ============================================================
-- MIGRATION: Schema Consolidation into rdb
-- Project: BSOP Supabase (ybklderteyhuugzfmxbi)
-- Date: 2026-04-08
-- Purpose: Mirror waitry, caja, inventario tables into rdb schema
--          for a single-schema read layer and future self-contained
--          reporting without cross-schema dependencies.
-- IDEMPOTENT: Safe to run multiple times (CREATE IF NOT EXISTS,
--             CREATE OR REPLACE, DROP TRIGGER IF EXISTS + CREATE)
-- ============================================================

-- ============================================================
-- SECTION 0: PREREQUISITES AND ENSURE rdb SCHEMA EXISTS
-- ============================================================

-- pgcrypto is required for digest() used in compute_content_hash
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS rdb;

-- ============================================================
-- SECTION 1: NEW TABLES IN rdb (DDL)
-- ============================================================

-- ----------------------------------------------------------
-- 1.1 rdb.waitry_inbound  (mirrors waitry.inbound)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.waitry_inbound (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       TEXT NOT NULL,
  event          TEXT,
  payload_json   JSONB NOT NULL,
  payload_hash   TEXT NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed      BOOLEAN NOT NULL DEFAULT false,
  attempts       INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitry_inbound_order_id_unique UNIQUE (order_id),
  CONSTRAINT waitry_inbound_payload_hash_len_chk CHECK (char_length(payload_hash) = 64)
);

CREATE INDEX IF NOT EXISTS waitry_inbound_order_id_idx       ON rdb.waitry_inbound(order_id);
CREATE INDEX IF NOT EXISTS waitry_inbound_received_at_idx    ON rdb.waitry_inbound(received_at DESC);
CREATE INDEX IF NOT EXISTS waitry_inbound_processed_idx      ON rdb.waitry_inbound(processed, received_at DESC);
CREATE INDEX IF NOT EXISTS waitry_inbound_payload_json_gin_idx ON rdb.waitry_inbound USING gin(payload_json);

-- ----------------------------------------------------------
-- 1.2 rdb.waitry_pedidos  (mirrors waitry.pedidos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.waitry_pedidos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              TEXT NOT NULL,
  status                TEXT,
  paid                  BOOLEAN,
  "timestamp"           TIMESTAMPTZ,
  place_id              TEXT,
  place_name            TEXT,
  table_name            TEXT,
  layout_name           TEXT,
  total_amount          NUMERIC(14,2),
  total_discount        NUMERIC(14,2),
  service_charge        NUMERIC(14,2),
  tax                   NUMERIC(14,2),
  external_delivery_id  TEXT,
  notes                 TEXT,
  last_action_at        TIMESTAMPTZ,
  content_hash          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitry_pedidos_order_id_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS waitry_pedidos_order_id_idx         ON rdb.waitry_pedidos(order_id);
CREATE INDEX IF NOT EXISTS waitry_pedidos_timestamp_idx        ON rdb.waitry_pedidos("timestamp" DESC);
CREATE INDEX IF NOT EXISTS waitry_pedidos_last_action_at_idx   ON rdb.waitry_pedidos(last_action_at DESC);
CREATE INDEX IF NOT EXISTS waitry_pedidos_content_hash_idx     ON rdb.waitry_pedidos(content_hash);
CREATE INDEX IF NOT EXISTS waitry_pedidos_duplicate_lookup_idx ON rdb.waitry_pedidos(content_hash, "timestamp");
CREATE INDEX IF NOT EXISTS waitry_pedidos_place_timestamp_idx  ON rdb.waitry_pedidos(place_id, "timestamp" DESC);

-- ----------------------------------------------------------
-- 1.3 rdb.waitry_productos  (mirrors waitry.productos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.waitry_productos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL,
  product_id    TEXT,
  product_name  TEXT NOT NULL,
  quantity      NUMERIC(14,3),
  unit_price    NUMERIC(14,2),
  total_price   NUMERIC(14,2),
  modifiers     JSONB,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitry_productos_order_fk FOREIGN KEY (order_id)
    REFERENCES rdb.waitry_pedidos(order_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT waitry_productos_unique_line UNIQUE (order_id, product_id, product_name)
);

CREATE INDEX IF NOT EXISTS waitry_productos_order_id_idx     ON rdb.waitry_productos(order_id);
CREATE INDEX IF NOT EXISTS waitry_productos_product_id_idx   ON rdb.waitry_productos(product_id);
CREATE INDEX IF NOT EXISTS waitry_productos_modifiers_gin_idx ON rdb.waitry_productos USING gin(modifiers);

-- ----------------------------------------------------------
-- 1.4 rdb.waitry_pagos  (mirrors waitry.pagos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.waitry_pagos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        TEXT NOT NULL,
  payment_id      TEXT NOT NULL,
  payment_method  TEXT,
  amount          NUMERIC(14,2),
  tip             NUMERIC(14,2),
  currency        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitry_pagos_order_fk FOREIGN KEY (order_id)
    REFERENCES rdb.waitry_pedidos(order_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT waitry_pagos_unique_payment UNIQUE (order_id, payment_id)
);

CREATE INDEX IF NOT EXISTS waitry_pagos_order_id_idx       ON rdb.waitry_pagos(order_id);
CREATE INDEX IF NOT EXISTS waitry_pagos_payment_method_idx ON rdb.waitry_pagos(payment_method);
CREATE INDEX IF NOT EXISTS waitry_pagos_created_at_idx     ON rdb.waitry_pagos(created_at DESC);

-- ----------------------------------------------------------
-- 1.5 rdb.waitry_duplicate_candidates  (mirrors waitry.duplicate_candidates)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.waitry_duplicate_candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id_a        TEXT NOT NULL,
  order_id_b        TEXT NOT NULL,
  similarity_score  NUMERIC(5,4) NOT NULL,
  match_reason      TEXT,
  content_hash      TEXT NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolution        TEXT,
  CONSTRAINT waitry_dup_candidates_pair_chk CHECK (order_id_a <> order_id_b),
  CONSTRAINT waitry_dup_candidates_similarity_chk CHECK (similarity_score >= 0 AND similarity_score <= 1),
  CONSTRAINT waitry_dup_candidates_resolution_chk CHECK (
    resolution IS NULL OR resolution IN ('confirmed_duplicate', 'not_duplicate')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS waitry_dup_candidates_pair_unique_idx
  ON rdb.waitry_duplicate_candidates (
    least(order_id_a, order_id_b),
    greatest(order_id_a, order_id_b)
  );

CREATE INDEX IF NOT EXISTS waitry_dup_candidates_resolved_detected_idx
  ON rdb.waitry_duplicate_candidates(resolved, detected_at DESC);
CREATE INDEX IF NOT EXISTS waitry_dup_candidates_content_hash_idx
  ON rdb.waitry_duplicate_candidates(content_hash);
CREATE INDEX IF NOT EXISTS waitry_dup_candidates_order_a_idx
  ON rdb.waitry_duplicate_candidates(order_id_a);
CREATE INDEX IF NOT EXISTS waitry_dup_candidates_order_b_idx
  ON rdb.waitry_duplicate_candidates(order_id_b);

-- ----------------------------------------------------------
-- 1.6 rdb.cajas  (mirrors caja.cajas)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.cajas (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  TEXT UNIQUE NOT NULL
);

-- ----------------------------------------------------------
-- 1.7 rdb.cortes  (mirrors caja.cortes + caja_id from 02_autocierre)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.cortes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_operativa       DATE NOT NULL,
  caja_nombre           TEXT DEFAULT 'Caja Principal',
  caja_id               UUID REFERENCES rdb.cajas(id),
  hora_inicio           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  hora_fin              TIMESTAMP WITH TIME ZONE,
  responsable_apertura  TEXT,
  responsable_cierre    TEXT,
  efectivo_inicial      NUMERIC(10,2) DEFAULT 0,
  efectivo_contado      NUMERIC(10,2),
  estado                TEXT DEFAULT 'Abierto'
  -- CHECK: Abierto, Cerrado, Validado
);

CREATE INDEX IF NOT EXISTS rdb_cortes_fecha_idx   ON rdb.cortes(fecha_operativa DESC);
CREATE INDEX IF NOT EXISTS rdb_cortes_estado_idx  ON rdb.cortes(estado);
CREATE INDEX IF NOT EXISTS rdb_cortes_caja_id_idx ON rdb.cortes(caja_id);

-- ----------------------------------------------------------
-- 1.8 rdb.movimientos  (mirrors caja.movimientos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.movimientos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corte_id      UUID REFERENCES rdb.cortes(id) ON DELETE CASCADE,
  fecha_hora    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tipo          TEXT NOT NULL,  -- 'Depósito' o 'Retiro'
  monto         NUMERIC(10,2) NOT NULL,
  nota          TEXT,
  registrado_por TEXT
);

CREATE INDEX IF NOT EXISTS rdb_movimientos_corte_id_idx ON rdb.movimientos(corte_id);

-- ----------------------------------------------------------
-- 1.9 rdb.inv_productos  (mirrors inventario.productos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.inv_productos (
  id            TEXT PRIMARY KEY,   -- ID de Waitry o SKU
  nombre        TEXT NOT NULL,
  categoria     TEXT,
  stock_inicial NUMERIC(10,2) DEFAULT 0
);

-- ----------------------------------------------------------
-- 1.10 rdb.inv_entradas  (mirrors inventario.entradas)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.inv_entradas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id     TEXT REFERENCES rdb.inv_productos(id),
  fecha_entrada   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cantidad        NUMERIC(10,2) NOT NULL,
  costo_unitario  NUMERIC(10,2),
  proveedor       TEXT
);

CREATE INDEX IF NOT EXISTS rdb_inv_entradas_producto_id_idx ON rdb.inv_entradas(producto_id);

-- ----------------------------------------------------------
-- 1.11 rdb.inv_ajustes  (mirrors inventario.ajustes)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdb.inv_ajustes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id   TEXT REFERENCES rdb.inv_productos(id),
  fecha_ajuste  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cantidad      NUMERIC(10,2) NOT NULL,   -- puede ser negativo
  motivo        TEXT,
  estado        TEXT DEFAULT 'Aplicado'
);

CREATE INDEX IF NOT EXISTS rdb_inv_ajustes_producto_id_idx ON rdb.inv_ajustes(producto_id);
CREATE INDEX IF NOT EXISTS rdb_inv_ajustes_estado_idx      ON rdb.inv_ajustes(estado);


-- ============================================================
-- SECTION 2: FUNCTIONS AND TRIGGERS IN rdb
-- ============================================================

-- ----------------------------------------------------------
-- 2.1 rdb.set_updated_at()  (≡ waitry.set_updated_at)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 2.2 rdb.compute_content_hash(...)  (≡ waitry.compute_content_hash)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.compute_content_hash(
  p_products      JSONB,
  p_total_amount  NUMERIC,
  p_table_name    TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = extensions, public, rdb
AS $$
  WITH normalized AS (
    SELECT COALESCE(
      string_agg(
        concat_ws(':',
          COALESCE(trim(item->>'product_name'), trim(item->>'productName'), ''),
          COALESCE(item->>'quantity', '0')
        ),
        '|' ORDER BY COALESCE(trim(item->>'product_name'), trim(item->>'productName'), ''),
                     COALESCE(item->>'quantity', '0')
      ),
      ''
    ) AS product_signature
    FROM jsonb_array_elements(COALESCE(p_products, '[]'::jsonb)) item
  )
  SELECT encode(
    digest(
      concat_ws('|',
        (SELECT product_signature FROM normalized),
        COALESCE(p_total_amount::text, ''),
        COALESCE(trim(p_table_name), '')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- ----------------------------------------------------------
-- 2.3 rdb.check_duplicates(...)
--     (≡ waitry.check_duplicates, uses rdb.waitry_* tables)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.check_duplicates(p_order_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rdb
AS $$
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
      'same products + amount + table within 3 minutes'::TEXT AS match_reason,
      now() AS detected_at
    FROM target t
    JOIN rdb.waitry_pedidos p
      ON p.order_id <> t.order_id
     AND p.content_hash = t.content_hash
     AND p."timestamp" BETWEEN t."timestamp" - INTERVAL '3 minutes'
                           AND t."timestamp" + INTERVAL '3 minutes'
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
$$;

-- ----------------------------------------------------------
-- 2.4 rdb.pedidos_after_insert_check_duplicates()
--     (trigger function, calls rdb.check_duplicates)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.pedidos_after_insert_check_duplicates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rdb
AS $$
BEGIN
  PERFORM rdb.check_duplicates(NEW.order_id);
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 2.5 rdb.trg_autocierre_corte()
--     (≡ caja.trg_autocierre_corte, uses rdb.cortes/rdb.cajas)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.trg_autocierre_corte()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si se inserta un corte nuevo y está "Abierto"
  IF NEW.estado = 'Abierto' THEN
    -- Buscar si hay otro corte Abierto para LA MISMA CAJA
    UPDATE rdb.cortes
    SET
      estado    = 'Cerrado',
      hora_fin  = NEW.hora_inicio
    WHERE
      caja_id = NEW.caja_id
      AND estado = 'Abierto'
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 2.6 Triggers on rdb tables
-- ----------------------------------------------------------

-- set_updated_at on waitry_pedidos
DROP TRIGGER IF EXISTS waitry_pedidos_set_updated_at ON rdb.waitry_pedidos;
CREATE TRIGGER waitry_pedidos_set_updated_at
BEFORE UPDATE ON rdb.waitry_pedidos
FOR EACH ROW
EXECUTE FUNCTION rdb.set_updated_at();

-- duplicate check after insert on waitry_pedidos
DROP TRIGGER IF EXISTS waitry_pedidos_after_insert_check_duplicates ON rdb.waitry_pedidos;
CREATE TRIGGER waitry_pedidos_after_insert_check_duplicates
AFTER INSERT ON rdb.waitry_pedidos
FOR EACH ROW
EXECUTE FUNCTION rdb.pedidos_after_insert_check_duplicates();

-- autocierre on cortes
DROP TRIGGER IF EXISTS trg_autocierre_corte ON rdb.cortes;
CREATE TRIGGER trg_autocierre_corte
BEFORE INSERT ON rdb.cortes
FOR EACH ROW
EXECUTE FUNCTION rdb.trg_autocierre_corte();


-- ============================================================
-- SECTION 3: VIEWS IN rdb
-- (No cross-schema references — all rdb.* only)
-- ============================================================

-- ----------------------------------------------------------
-- 3.1 rdb.v_cortes_totales
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_cortes_totales AS
WITH pagos_por_corte AS (
    SELECT
        c.id AS corte_id,
        p.payment_method AS method,
        p.amount
    FROM rdb.cortes c
    JOIN rdb.waitry_pedidos ped
        ON ped."timestamp" AT TIME ZONE 'America/Matamoros' >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
        AND ped."timestamp" AT TIME ZONE 'America/Matamoros' <= COALESCE(
              c.hora_fin AT TIME ZONE 'America/Matamoros',
              c.hora_inicio AT TIME ZONE 'America/Matamoros' + INTERVAL '12 hours'
            )
        AND ped.status != 'order_canceled'
    JOIN rdb.waitry_pagos p ON p.order_id = ped.order_id
),
movimientos_por_corte AS (
    SELECT
        corte_id,
        SUM(CASE WHEN tipo = 'Depósito' THEN monto ELSE 0 END) AS total_depositos,
        SUM(CASE WHEN tipo = 'Retiro'   THEN monto ELSE 0 END) AS total_retiros
    FROM rdb.movimientos
    GROUP BY corte_id
)
SELECT
    c.id AS corte_id,
    c.caja_id,
    c.caja_nombre,
    c.estado,
    c.hora_inicio,
    c.hora_fin,
    c.efectivo_inicial,
    COALESCE(SUM(CASE WHEN pp.method = 'cash'         THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
    COALESCE(SUM(CASE WHEN pp.method ILIKE 'credit%'  THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
    0 AS ingresos_stripe,
    COALESCE(SUM(CASE WHEN pp.method = 'other'        THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
    COALESCE(SUM(pp.amount), 0) AS total_ingresos,
    COALESCE(m.total_depositos, 0) AS depositos,
    COALESCE(m.total_retiros,   0) AS retiros,
    (
      c.efectivo_inicial
      + COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0)
      + COALESCE(m.total_depositos, 0)
      - COALESCE(m.total_retiros, 0)
    ) AS efectivo_esperado
FROM rdb.cortes c
LEFT JOIN pagos_por_corte pp      ON pp.corte_id = c.id
LEFT JOIN movimientos_por_corte m ON m.corte_id  = c.id
GROUP BY c.id, c.caja_id, c.caja_nombre, c.estado, c.hora_inicio, c.hora_fin,
         c.efectivo_inicial, m.total_depositos, m.total_retiros;

-- ----------------------------------------------------------
-- 3.2 rdb.v_cortes_totales_30d
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_cortes_totales_30d AS
SELECT * FROM rdb.v_cortes_totales
WHERE hora_inicio >= (CURRENT_DATE - INTERVAL '35 days');

-- ----------------------------------------------------------
-- 3.3 rdb.v_cortes_productos
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_cortes_productos AS
SELECT
    c.id AS corte_id,
    wp.product_id,
    wp.product_name AS producto_nombre,
    SUM(wp.quantity) AS cantidad_vendida,
    SUM(wp.unit_price * wp.quantity) AS importe_total
FROM rdb.cortes c
JOIN rdb.waitry_pedidos ped
    ON ped."timestamp" AT TIME ZONE 'America/Matamoros' >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
    AND ped."timestamp" AT TIME ZONE 'America/Matamoros' <= COALESCE(
          c.hora_fin AT TIME ZONE 'America/Matamoros',
          c.hora_inicio AT TIME ZONE 'America/Matamoros' + INTERVAL '12 hours'
        )
    AND ped.status != 'order_canceled'
JOIN rdb.waitry_productos wp ON wp.order_id = ped.order_id
GROUP BY c.id, wp.product_id, wp.product_name;

-- ----------------------------------------------------------
-- 3.4 rdb.v_cortes_productos_30d
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_cortes_productos_30d AS
SELECT rdb.v_cortes_productos.*
FROM rdb.v_cortes_productos
JOIN rdb.cortes c ON c.id = rdb.v_cortes_productos.corte_id
WHERE c.hora_inicio >= (CURRENT_DATE - INTERVAL '35 days');

-- ----------------------------------------------------------
-- 3.5 rdb.v_inv_stock_actual
-- (uses rdb.inv_* + rdb.waitry_productos)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_inv_stock_actual AS
WITH salidas_waitry AS (
    SELECT
        wp.product_id,
        SUM(wp.quantity) AS total_vendido
    FROM rdb.waitry_productos wp
    JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
    WHERE ped.status != 'order_canceled'
    GROUP BY wp.product_id
),
entradas_manuales AS (
    SELECT producto_id, SUM(cantidad) AS total_entrado
    FROM rdb.inv_entradas
    GROUP BY producto_id
),
ajustes_manuales AS (
    SELECT producto_id, SUM(cantidad) AS total_ajustado
    FROM rdb.inv_ajustes
    WHERE estado = 'Aplicado'
    GROUP BY producto_id
)
SELECT
    p.id AS producto_id,
    p.nombre,
    p.categoria,
    p.stock_inicial,
    COALESCE(e.total_entrado,  0) AS entradas,
    COALESCE(s.total_vendido,  0) AS salidas_ventas,
    COALESCE(a.total_ajustado, 0) AS ajustes,
    (
      p.stock_inicial
      + COALESCE(e.total_entrado,  0)
      - COALESCE(s.total_vendido,  0)
      + COALESCE(a.total_ajustado, 0)
    ) AS stock_actual
FROM rdb.inv_productos p
LEFT JOIN salidas_waitry    s ON s.product_id  = p.id
LEFT JOIN entradas_manuales e ON e.producto_id = p.id
LEFT JOIN ajustes_manuales  a ON a.producto_id = p.id;

-- ----------------------------------------------------------
-- 3.6 rdb.v_waitry_pedidos_30d
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_waitry_pedidos_30d AS
SELECT * FROM rdb.waitry_pedidos
WHERE "timestamp" >= (CURRENT_DATE - INTERVAL '35 days');

-- ----------------------------------------------------------
-- 3.7 rdb.v_waitry_pagos_30d
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_waitry_pagos_30d AS
SELECT p.* FROM rdb.waitry_pagos p
JOIN rdb.waitry_pedidos ped ON ped.order_id = p.order_id
WHERE ped."timestamp" >= (CURRENT_DATE - INTERVAL '35 days');

-- ----------------------------------------------------------
-- 3.8 rdb.v_waitry_productos_30d
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_waitry_productos_30d AS
SELECT wp.* FROM rdb.waitry_productos wp
JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
WHERE ped."timestamp" >= (CURRENT_DATE - INTERVAL '35 days');

-- ----------------------------------------------------------
-- 3.9 rdb.v_waitry_pending_duplicates
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_waitry_pending_duplicates AS
SELECT
    dc.id,
    dc.detected_at,
    dc.similarity_score,
    dc.match_reason,
    dc.content_hash,
    dc.order_id_a,
    a."timestamp"    AS order_a_timestamp,
    a.place_name     AS order_a_place_name,
    a.table_name     AS order_a_table_name,
    a.total_amount   AS order_a_total_amount,
    a.status         AS order_a_status,
    a.notes          AS order_a_notes,
    dc.order_id_b,
    b."timestamp"    AS order_b_timestamp,
    b.place_name     AS order_b_place_name,
    b.table_name     AS order_b_table_name,
    b.total_amount   AS order_b_total_amount,
    b.status         AS order_b_status,
    b.notes          AS order_b_notes,
    abs(extract(epoch FROM (a."timestamp" - b."timestamp"))) AS seconds_apart
FROM rdb.waitry_duplicate_candidates dc
JOIN rdb.waitry_pedidos a ON dc.order_id_a = a.order_id
JOIN rdb.waitry_pedidos b ON dc.order_id_b = b.order_id
WHERE dc.resolved = false
ORDER BY dc.detected_at DESC;


-- ============================================================
-- SECTION 4: COMPATIBILITY VIEWS
-- Read-only aliases in original schemas pointing to rdb.*
-- Existing code can keep working without modification.
-- DO NOT REPLACE ORIGINAL TABLES — only additional read aliases.
-- ============================================================

-- waitry schema aliases
CREATE OR REPLACE VIEW waitry.waitry_inbound_rdb AS
  SELECT * FROM rdb.waitry_inbound;

CREATE OR REPLACE VIEW waitry.waitry_pedidos_rdb AS
  SELECT * FROM rdb.waitry_pedidos;

CREATE OR REPLACE VIEW waitry.waitry_productos_rdb AS
  SELECT * FROM rdb.waitry_productos;

CREATE OR REPLACE VIEW waitry.waitry_pagos_rdb AS
  SELECT * FROM rdb.waitry_pagos;

CREATE OR REPLACE VIEW waitry.waitry_duplicate_candidates_rdb AS
  SELECT * FROM rdb.waitry_duplicate_candidates;

-- caja schema aliases
CREATE OR REPLACE VIEW caja.cajas_rdb AS
  SELECT * FROM rdb.cajas;

CREATE OR REPLACE VIEW caja.cortes_rdb AS
  SELECT * FROM rdb.cortes;

CREATE OR REPLACE VIEW caja.movimientos_rdb AS
  SELECT * FROM rdb.movimientos;

-- inventario schema aliases
CREATE OR REPLACE VIEW inventario.inv_productos_rdb AS
  SELECT * FROM rdb.inv_productos;

CREATE OR REPLACE VIEW inventario.inv_entradas_rdb AS
  SELECT * FROM rdb.inv_entradas;

CREATE OR REPLACE VIEW inventario.inv_ajustes_rdb AS
  SELECT * FROM rdb.inv_ajustes;


-- ============================================================
-- SECTION 5: DATA MIGRATION (COMMENTED OUT — FOR LATER)
-- ============================================================
-- ============================================================
-- FASE 2: MIGRAR DATOS — Ejecutar SOLO en ventana de mantenimiento
-- cuando el código esté listo para escribir en rdb en lugar de
-- los schemas originales. NO ejecutar aún.
-- ============================================================
--
-- INSERT INTO rdb.waitry_inbound
--   SELECT * FROM waitry.inbound
--   ON CONFLICT (order_id) DO NOTHING;
--
-- INSERT INTO rdb.waitry_pedidos
--   SELECT * FROM waitry.pedidos
--   ON CONFLICT (order_id) DO NOTHING;
--
-- INSERT INTO rdb.waitry_productos
--   SELECT id, order_id, product_id, product_name, quantity, unit_price, total_price, modifiers, notes, created_at
--   FROM waitry.productos
--   ON CONFLICT (order_id, product_id, product_name) DO NOTHING;
--
-- INSERT INTO rdb.waitry_pagos
--   SELECT * FROM waitry.pagos
--   ON CONFLICT (order_id, payment_id) DO NOTHING;
--
-- INSERT INTO rdb.waitry_duplicate_candidates
--   SELECT * FROM waitry.duplicate_candidates
--   ON CONFLICT DO NOTHING;
--
-- -- Migrate cajas first (no dependencies)
-- INSERT INTO rdb.cajas (id, nombre)
--   SELECT id, nombre FROM caja.cajas
--   ON CONFLICT (nombre) DO NOTHING;
--
-- INSERT INTO rdb.cortes
--   SELECT id, fecha_operativa, caja_nombre, caja_id, hora_inicio, hora_fin,
--          responsable_apertura, responsable_cierre, efectivo_inicial, efectivo_contado, estado
--   FROM caja.cortes
--   ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO rdb.movimientos
--   SELECT * FROM caja.movimientos
--   ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO rdb.inv_productos
--   SELECT * FROM inventario.productos
--   ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO rdb.inv_entradas
--   SELECT * FROM inventario.entradas
--   ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO rdb.inv_ajustes
--   SELECT * FROM inventario.ajustes
--   ON CONFLICT (id) DO NOTHING;
--
-- ============================================================
-- END OF FASE 2 DATA MIGRATION
-- ============================================================
