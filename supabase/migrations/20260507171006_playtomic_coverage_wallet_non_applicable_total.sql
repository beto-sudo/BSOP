-- Iniciativa rdb-pagos-cancha-conciliacion — Wallet usa non_applicable_total
--
-- Hallazgo (reportado por Beto): la reserva 54a37f4a (Padel 7 "Ashley
-- Furniture", 5-may 20:30, $800, owner Dina Muñoz) aparecía como
-- `partial $266.67` cuando en realidad Dina pagó los $800 completos
-- con su Club wallet. El badge en Playtomic UI dice MX$800.00 + Wallet.
--
-- El bug: PR #438 modelaba wallet con la heurística
--    `wallet_coverage = wallet_payments_count × (price / participant_count)`
-- asumiendo que cada wallet payment cubre la parte del jugador.
-- Pero el CSV trae el monto REAL en `non_applicable_total`:
--    - `total` = 0 (no hay flujo nuevo a la pasarela)
--    - `non_applicable_total` = monto que el wallet cubrió ($800 en este caso)
--    - `payment_type` = 'Single payer' / 'Split payer' lo confirma
--
-- Verificación en BD productiva (90d): 136 pagos Club wallet, TODOS
-- con `total=0` y TODOS con `non_applicable_total > 0`. Suma total
-- $30,550 mal modelados por la heurística proporcional.
--
-- Fix: para `payment_method='Club wallet'`, usar `non_applicable_total`
-- como `amount`. Wellhub sigue usando `total` (sus 10 pagos siempre
-- tienen `total > 0` y no usan non_applicable).
--
-- El concepto "Operadores y Familia" (jugadores que no pagan) puede
-- resolverse separadamente — con este fix, los casos típicos donde el
-- owner cubre todo con wallet se resuelven solos.
BEGIN;

DROP VIEW IF EXISTS playtomic.v_bookings_total_coverage;

CREATE VIEW playtomic.v_bookings_total_coverage
WITH (security_invoker = true)
AS
WITH waitry_agg AS (
  SELECT
    booking_id,
    SUM(assigned_amount) AS waitry_total,
    ARRAY_AGG(waitry_order_id ORDER BY assigned_at) AS waitry_order_ids
  FROM playtomic.payment_assignments
  GROUP BY booking_id
),
csv_matched AS (
  -- Match con CSV por (cualquier participante.player_id == payments_import.user_id)
  -- AND service_date dentro de ±15 min del booking_start AND payment_status='Paid'.
  --
  -- `amount` toma el valor correcto según el método:
  --   - Club wallet: non_applicable_total (total siempre = 0 en CSV)
  --   - Resto: total
  --
  -- Canal por payment_method PRIMERO (Wellhub/Club wallet), luego origin.
  SELECT
    b.booking_id,
    p.payment_id,
    CASE
      WHEN p.payment_method = 'Club wallet' THEN COALESCE(p.non_applicable_total, 0)
      ELSE p.total
    END                                                                       AS amount,
    p.origin                                                                  AS origin,
    p.payment_method                                                          AS payment_method,
    CASE
      WHEN p.payment_method = 'Wellhub'                                       THEN 'online'
      WHEN p.payment_method = 'Club wallet'                                   THEN 'wallet'
      WHEN p.origin LIKE 'App%' OR p.origin = 'Web (desktop)'                 THEN 'online'
      WHEN p.origin = 'Playtomic Manager'                                     THEN 'manager'
      ELSE 'other'
    END                                                                       AS channel
  FROM playtomic.bookings b
  JOIN playtomic.booking_participants bp ON bp.booking_id = b.booking_id
  JOIN playtomic.payments_import p
    ON p.user_id = bp.player_id
   AND p.service_date BETWEEN b.booking_start - INTERVAL '15 minutes'
                          AND b.booking_start + INTERVAL '15 minutes'
   AND p.payment_status = 'Paid'
),
csv_agg AS (
  SELECT
    booking_id,
    SUM(amount)                                                          AS csv_total,
    SUM(amount) FILTER (WHERE channel = 'online')                        AS online_csv_total,
    SUM(amount) FILTER (WHERE channel = 'manager')                       AS manager_csv_total,
    SUM(amount) FILTER (WHERE channel = 'other')                         AS other_csv_total,
    SUM(amount) FILTER (WHERE channel = 'wallet')                        AS wallet_total_raw,
    COUNT(DISTINCT payment_id) FILTER (WHERE channel = 'wallet')         AS wallet_payments_count,
    COUNT(DISTINCT payment_id)                                           AS csv_payments_count,
    ARRAY_AGG(DISTINCT payment_id)                                       AS csv_payment_ids,
    ARRAY_AGG(DISTINCT payment_id) FILTER (WHERE channel = 'online')     AS online_csv_payment_ids,
    ARRAY_AGG(DISTINCT payment_id) FILTER (WHERE channel = 'manager')    AS manager_csv_payment_ids,
    ARRAY_AGG(DISTINCT payment_id) FILTER (WHERE channel = 'wallet')     AS wallet_csv_payment_ids
  FROM csv_matched
  GROUP BY booking_id
)
SELECT
  b.booking_id,
  b.price_amount AS booking_total,

  -- ─── Campos viejos (back-compat) ────────────────────────────────────
  COALESCE(w.waitry_total, 0)                                             AS waitry_total,
  COALESCE(c.csv_total, 0)                                                AS csv_total,
  COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0)                  AS combined_total,
  CASE
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0) = 0 THEN 'none'
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0) >= COALESCE(b.price_amount, 0) THEN 'full'
    ELSE 'partial'
  END                                                                     AS coverage_status,
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    ELSE LEAST(
      100,
      ROUND(
        (COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0)) / b.price_amount * 100,
        2
      )
    )
  END                                                                     AS coverage_pct,
  COALESCE(w.waitry_order_ids,  ARRAY[]::text[])                          AS waitry_order_ids,
  COALESCE(c.csv_payments_count, 0)                                       AS csv_payments_count,
  COALESCE(c.csv_payment_ids,    ARRAY[]::text[])                         AS csv_payment_ids,
  COALESCE(c.online_csv_total, 0)                                         AS online_csv_total,
  COALESCE(c.manager_csv_total, 0)                                        AS manager_csv_total,
  COALESCE(c.other_csv_total, 0)                                          AS other_csv_total,
  COALESCE(c.wallet_payments_count, 0)                                    AS wallet_payments_count,

  -- ─── Wallet coverage (basado en non_applicable_total, capeado) ─────
  -- Cap evita double-counting: si wallet + online + waitry > price,
  -- recortamos al saldo restante. Útil cuando un wallet "Single payer"
  -- ya cubre todo y luego hay otros pagos parciales.
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    WHEN COALESCE(c.wallet_total_raw, 0) <= 0 THEN 0
    ELSE GREATEST(
      0,
      LEAST(
        c.wallet_total_raw,
        b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
      )
    )
  END                                                                     AS wallet_coverage,

  -- ─── Cobertura efectiva ────────────────────────────────────────────
  COALESCE(w.waitry_total, 0)
    + COALESCE(c.online_csv_total, 0)
    + CASE
        WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
        WHEN COALESCE(c.wallet_total_raw, 0) <= 0 THEN 0
        ELSE GREATEST(
          0,
          LEAST(
            c.wallet_total_raw,
            b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
          )
        )
      END                                                                 AS effective_total,

  CASE
    WHEN COALESCE(w.waitry_total, 0)
       + COALESCE(c.online_csv_total, 0)
       + CASE
           WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
           WHEN COALESCE(c.wallet_total_raw, 0) <= 0 THEN 0
           ELSE GREATEST(
             0,
             LEAST(
               c.wallet_total_raw,
               b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
             )
           )
         END = 0 THEN 'none'
    WHEN COALESCE(w.waitry_total, 0)
       + COALESCE(c.online_csv_total, 0)
       + CASE
           WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
           WHEN COALESCE(c.wallet_total_raw, 0) <= 0 THEN 0
           ELSE GREATEST(
             0,
             LEAST(
               c.wallet_total_raw,
               b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
             )
           )
         END >= COALESCE(b.price_amount, 0) THEN 'full'
    ELSE 'partial'
  END                                                                     AS effective_status,

  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    ELSE LEAST(
      100,
      ROUND(
        (
          COALESCE(w.waitry_total, 0)
          + COALESCE(c.online_csv_total, 0)
          + CASE
              WHEN COALESCE(c.wallet_total_raw, 0) <= 0 THEN 0
              ELSE GREATEST(
                0,
                LEAST(
                  c.wallet_total_raw,
                  b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
                )
              )
            END
        ) / b.price_amount * 100,
        2
      )
    )
  END                                                                     AS effective_pct,

  (COALESCE(c.manager_csv_total, 0) > COALESCE(w.waitry_total, 0))        AS has_unverified_manager,
  COALESCE(c.online_csv_payment_ids,  ARRAY[]::text[])                    AS online_csv_payment_ids,
  COALESCE(c.manager_csv_payment_ids, ARRAY[]::text[])                    AS manager_csv_payment_ids,
  COALESCE(c.wallet_csv_payment_ids,  ARRAY[]::text[])                    AS wallet_csv_payment_ids
FROM playtomic.bookings b
LEFT JOIN waitry_agg w ON w.booking_id = b.booking_id
LEFT JOIN csv_agg    c ON c.booking_id = b.booking_id;

GRANT SELECT ON playtomic.v_bookings_total_coverage TO authenticated;

COMMENT ON VIEW playtomic.v_bookings_total_coverage IS
  'Cobertura combinada con breakdown por canal. Online = App/Web + Wellhub. Wallet = Club wallet (usa non_applicable_total del CSV — el monto real cubierto, ya que total=0 siempre para wallet). Manager = onsite no verificado. effective_total = waitry + online + wallet (capeado). Iniciativa rdb-pagos-cancha-conciliacion.';

NOTIFY pgrst, 'reload schema';

COMMIT;
