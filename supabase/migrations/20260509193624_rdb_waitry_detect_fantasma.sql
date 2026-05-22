-- MIGRATION: rdb-waitry-deduplicacion Sprint 2 — detección automática + backfill
--
-- CONTEXTO (continuación de Sprint 1, mergeado en PR #464):
--   El bug de Waitry ya tiene la columna `superseded_by_order_id` y los 2
--   fantasmas detectados el 2026-05-09 están marcados manualmente. Esta
--   migración instala detección automática para futuros eventos del webhook
--   y hace backfill de los 37 fantasmas históricos restantes (39 totales
--   esperados; 2 ya marcados).
--
-- ALCANCE:
--   1. Index en `external_delivery_id` (acelera lookups de candidatos).
--   2. `rdb.waitry_items_signature(text)` — md5 del basket por order_id.
--   3. `rdb.detect_waitry_fantasma(text)` — devuelve order_id canónico | NULL.
--   4. `rdb.refresh_waitry_superseded(text)` — actualiza la columna,
--      idempotente.
--   5. Backfill one-shot vía SQL nativo (NO loops de plpgsql) — pre-computa
--      firmas una vez y hace self-join. Corre ANTES de crear triggers para
--      no disparar la cascada por cada UPDATE.
--   6. Triggers AFTER sobre rdb.waitry_pedidos (cols clave) y
--      rdb.waitry_productos. Recursión guarded con pg_trigger_depth.
--   7. Verificaciones inline con ASSERT.
--
-- HEURÍSTICA (ver docs/planning/rdb-waitry-deduplicacion.md):
--   B es fantasma de A si TODAS:
--     1. external_delivery_id NOT NULL e igual entre A y B
--     2. total_amount igual
--     3. firma de items igual (md5 de product_id+quantity ordenado)
--     4. paid = TRUE en ambos
--     5. timestamp(B) - timestamp(A) <= 15 min,
--        A.timestamp < B.timestamp (o, si timestamps idénticos,
--        A.order_id < B.order_id como tiebreaker — Waitry numera
--        los orderId secuencialmente, así que el menor es el original).
--     6. ninguno con status cancel-like
--
-- WEBHOOK SAFETY:
--   El upsert del webhook construye pedidoRow sin superseded_by_order_id;
--   los re-emisiones no pisan el marker (mismo razonamiento que Sprint 1).

-- Statement timeout amplio para el backfill (Supabase MCP corta en ~30s
-- por default; este DDL puede tomar más). Solo afecta la transacción.
SET LOCAL statement_timeout = '300s';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Index en external_delivery_id (acelera lookups del trigger live)
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS waitry_pedidos_external_delivery_id_idx
  ON rdb.waitry_pedidos (external_delivery_id, total_amount)
  WHERE external_delivery_id IS NOT NULL AND paid = TRUE;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Helper: firma de items por order_id
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rdb.waitry_items_signature(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT md5(COALESCE(
    string_agg(
      pr.product_id::text || ':' || pr.quantity::text,
      '|' ORDER BY pr.product_id::text, pr.quantity::text
    ),
    ''
  ))
  FROM rdb.waitry_productos pr
  WHERE pr.order_id = p_order_id;
$$;

COMMENT ON FUNCTION rdb.waitry_items_signature(text) IS
  'Firma estable (md5) del basket de productos de un pedido Waitry. Heurística de detección de fantasmas (rdb-waitry-deduplicacion).';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Función pública: detect_waitry_fantasma(order_id) → canonical | NULL
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rdb.detect_waitry_fantasma(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH target AS (
    SELECT
      p.order_id,
      p.external_delivery_id,
      p.total_amount,
      p."timestamp" AS ts,
      p.paid,
      p.status,
      rdb.waitry_items_signature(p.order_id) AS items_sig
    FROM rdb.waitry_pedidos p
    WHERE p.order_id = p_order_id
  )
  SELECT p2.order_id
  FROM target t
  JOIN rdb.waitry_pedidos p2
    ON p2.order_id <> t.order_id
   AND p2.external_delivery_id = t.external_delivery_id
   AND p2.total_amount = t.total_amount
   AND p2.paid = TRUE
   AND (
     p2."timestamp" < t.ts
     OR (p2."timestamp" = t.ts AND p2.order_id < t.order_id)
   )
   AND (t.ts - p2."timestamp") <= INTERVAL '15 minutes'
  WHERE t.paid = TRUE
    AND t.external_delivery_id IS NOT NULL
    AND COALESCE(t.status, '') NOT ILIKE '%cancel%'
    AND COALESCE(p2.status, '') NOT ILIKE '%cancel%'
    AND rdb.waitry_items_signature(p2.order_id) = t.items_sig
  ORDER BY p2."timestamp" DESC, p2.order_id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION rdb.detect_waitry_fantasma(text) IS
  'Devuelve el order_id del pedido canónico si p_order_id es un fantasma generado por el bug de Waitry; NULL si no aplica. Heurística cerrada en docs/planning/rdb-waitry-deduplicacion.md (external_delivery_id + total + items signature + span <=15min, ambos no-cancelados).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Helper de refresh: aplica el resultado de detect a la columna
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rdb.refresh_waitry_superseded(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_canonical text;
  v_current text;
BEGIN
  v_canonical := rdb.detect_waitry_fantasma(p_order_id);

  SELECT superseded_by_order_id INTO v_current
  FROM rdb.waitry_pedidos
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_current IS DISTINCT FROM v_canonical THEN
    UPDATE rdb.waitry_pedidos
       SET superseded_by_order_id = v_canonical
     WHERE order_id = p_order_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION rdb.refresh_waitry_superseded(text) IS
  'Re-evalúa el pedido y actualiza superseded_by_order_id si cambió. Idempotente. Devuelve TRUE si la columna cambió.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Backfill one-shot vía SQL nativo (BEFORE triggers — no recursión)
--    Pre-computa firmas una vez en una CTE y hace self-join.
-- ─────────────────────────────────────────────────────────────────────────

WITH item_sig AS (
  SELECT
    pr.order_id,
    md5(string_agg(
      pr.product_id::text || ':' || pr.quantity::text,
      '|' ORDER BY pr.product_id::text, pr.quantity::text
    )) AS sig
  FROM rdb.waitry_productos pr
  GROUP BY pr.order_id
),
qualifying AS (
  SELECT
    p.order_id,
    p.external_delivery_id,
    p.total_amount,
    p."timestamp" AS ts,
    COALESCE(s.sig, md5('')) AS items_sig
  FROM rdb.waitry_pedidos p
  LEFT JOIN item_sig s ON s.order_id = p.order_id
  WHERE p.paid = TRUE
    AND p.external_delivery_id IS NOT NULL
    AND COALESCE(p.status, '') NOT ILIKE '%cancel%'
),
canonical_match AS (
  SELECT DISTINCT ON (t.order_id)
    t.order_id AS fantasma_id,
    p2.order_id AS canonical_id
  FROM qualifying t
  JOIN qualifying p2
    ON p2.order_id <> t.order_id
   AND p2.external_delivery_id = t.external_delivery_id
   AND p2.total_amount = t.total_amount
   AND p2.items_sig = t.items_sig
   AND (
     p2.ts < t.ts
     OR (p2.ts = t.ts AND p2.order_id < t.order_id)
   )
   AND (t.ts - p2.ts) <= INTERVAL '15 minutes'
  ORDER BY t.order_id, p2.ts DESC, p2.order_id DESC
)
UPDATE rdb.waitry_pedidos w
   SET superseded_by_order_id = m.canonical_id
  FROM canonical_match m
 WHERE w.order_id = m.fantasma_id
   AND w.superseded_by_order_id IS DISTINCT FROM m.canonical_id;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Triggers AFTER (recursión guarded)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rdb.tg_waitry_pedidos_resolve_superseded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dependent record;
BEGIN
  -- Recursion guard: el UPDATE dentro de refresh re-dispara este trigger.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Re-evaluar el pedido recién insertado/actualizado
  PERFORM rdb.refresh_waitry_superseded(NEW.order_id);

  -- Cascada: si este pedido cambió a status tipo "cancel", los pedidos que
  -- apuntan a él como canónico deben re-evaluarse (uno se promueve a canónico).
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(NEW.status, '') ILIKE '%cancel%'
  THEN
    FOR v_dependent IN
      SELECT order_id
      FROM rdb.waitry_pedidos
      WHERE superseded_by_order_id = NEW.order_id
    LOOP
      PERFORM rdb.refresh_waitry_superseded(v_dependent.order_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitry_pedidos_resolve_superseded ON rdb.waitry_pedidos;
CREATE TRIGGER waitry_pedidos_resolve_superseded
AFTER INSERT OR UPDATE OF status, total_amount, external_delivery_id, paid, "timestamp"
ON rdb.waitry_pedidos
FOR EACH ROW
EXECUTE FUNCTION rdb.tg_waitry_pedidos_resolve_superseded();

CREATE OR REPLACE FUNCTION rdb.tg_waitry_productos_invalidate_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM rdb.refresh_waitry_superseded(v_order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS waitry_productos_invalidate_pedido ON rdb.waitry_productos;
CREATE TRIGGER waitry_productos_invalidate_pedido
AFTER INSERT OR UPDATE OR DELETE
ON rdb.waitry_productos
FOR EACH ROW
EXECUTE FUNCTION rdb.tg_waitry_productos_invalidate_pedido();

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Verificaciones inline (ASSERT vía DO + RAISE EXCEPTION)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total_marcados integer;
  v_total_esperados integer;
  v_los_2_de_hoy_intactos boolean;
BEGIN
  SELECT COUNT(*) INTO v_total_marcados
  FROM rdb.waitry_pedidos
  WHERE superseded_by_order_id IS NOT NULL;

  WITH item_sig AS (
    SELECT order_id, rdb.waitry_items_signature(order_id) AS sig
    FROM rdb.waitry_pedidos
  ),
  pairs AS (
    SELECT
      p.external_delivery_id, p.total_amount, s.sig,
      COUNT(*) AS n,
      EXTRACT(EPOCH FROM (MAX(p."timestamp") - MIN(p."timestamp")))/60 AS span_min
    FROM rdb.waitry_pedidos p
    JOIN item_sig s ON s.order_id = p.order_id
    WHERE p.paid = TRUE
      AND p.external_delivery_id IS NOT NULL
      AND COALESCE(p.status, '') NOT ILIKE '%cancel%'
    GROUP BY p.external_delivery_id, p.total_amount, s.sig
    HAVING COUNT(*) > 1
      AND EXTRACT(EPOCH FROM (MAX(p."timestamp") - MIN(p."timestamp")))/60 <= 15
  )
  SELECT COALESCE(SUM(n - 1), 0) INTO v_total_esperados FROM pairs;

  IF v_total_marcados <> v_total_esperados THEN
    RAISE EXCEPTION
      'Backfill rdb-waitry-deduplicacion: marcados=% pero heurística esperaba=%',
      v_total_marcados, v_total_esperados;
  END IF;

  -- Los 2 de hoy siguen apuntando a sus canónicos correctos
  SELECT
    (SELECT superseded_by_order_id FROM rdb.waitry_pedidos WHERE order_id = '17251086') = '17250975'
    AND (SELECT superseded_by_order_id FROM rdb.waitry_pedidos WHERE order_id = '17251090') = '17250984'
  INTO v_los_2_de_hoy_intactos;

  IF NOT v_los_2_de_hoy_intactos THEN
    RAISE EXCEPTION 'Backfill rdb-waitry-deduplicacion: los 2 fantasmas de hoy NO siguen marcados como esperaba';
  END IF;

  RAISE NOTICE 'Verificación rdb-waitry-deduplicacion OK: % fantasmas marcados (esperados=%)',
    v_total_marcados, v_total_esperados;
END;
$$;

NOTIFY pgrst, 'reload schema';
