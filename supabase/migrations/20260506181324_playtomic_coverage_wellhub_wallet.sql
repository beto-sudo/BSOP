-- Iniciativa rdb-pagos-cancha-conciliacion — Soporte de Wellhub + Club wallet
--
-- Caso operativo (reportado por Pablo): cancha "Autos del Norte" 5-may
-- 20:30, $800 total, 4 jugadores. El owner pagó Apple Pay; otro jugador
-- también Apple Pay; un tercero usó WELLHUB; el cuarto pagó con saldo
-- previo en su CLUB WALLET (Bono monedero). Los 4 pagos están en el CSV
-- de Playtomic Manager. Pero el modelo de cobertura efectiva los
-- modelaba mal:
--   - Wellhub aparece con origin='Playtomic Manager' aunque sí está
--     cobrado vía la integración. Antes lo flageaba como manager_csv
--     "no verificado" (falso positivo).
--   - Club wallet aparece con total=0 (descuento de saldo previamente
--     cargado). Antes no contribuía a la cobertura aunque sí cubre la
--     parte proporcional del jugador.
--
-- Cambios:
-- 1. Agregar `payment_method` al match contra payments_import.
-- 2. Reclasificar canal:
--      Wellhub      → 'online'  (trazable, ya en cuenta del club)
--      Club wallet  → 'wallet'  (cubre la parte proporcional del jugador)
-- 3. Calcular `wallet_coverage`:
--      LEAST(
--        wallet_payments_count * (price_amount / participant_count),
--        price_amount - online_csv - waitry  -- cap, evita double-count
--      )
-- 4. effective_total = waitry + online_csv + wallet_coverage.
--
-- Volumen estimado en 90d (2026-02-06 a 2026-05-06):
--   - 10 pagos Wellhub ($2,100)
--   - 133 pagos Club wallet (todos total=0; 87 son origin Manager,
--     46 origin App, ambos en realidad son el mismo flujo)
-- Total: 143 pagos antes mal modelados, ~1.6 / día.
--
-- Compatibilidad: el shape de la vista no cambia (solo se agregan campos
-- nuevos `wallet_total`, `wallet_payments_count`); los campos existentes
-- mantienen su semántica con cobertura ahora más precisa.
BEGIN;

-- Postgres no permite reordenar columnas con CREATE OR REPLACE VIEW (la
-- columna nueva `wallet_payments_count` queda entre los campos viejos).
-- Drop + recreate; sin dependencias externas verificadas.
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
participants_agg AS (
  SELECT booking_id, COUNT(*)::int AS participant_count
  FROM playtomic.booking_participants
  GROUP BY booking_id
),
csv_matched AS (
  -- Match con CSV por (cualquier participante.player_id == payments_import.user_id)
  -- AND service_date dentro de ±15 min del booking_start AND payment_status='Paid'.
  -- El match por participante (no solo owner) cubre splits donde cada jugador
  -- paga su parte por separado.
  --
  -- Canal definido por payment_method PRIMERO (Wellhub/Club wallet), luego
  -- origin (App/Web/Manager). Esto captura los casos donde Manager se usa
  -- para asentar pagos digitales que sí están cobrados vía integración.
  SELECT
    b.booking_id,
    p.payment_id,
    p.total                                                                   AS amount,
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
    -- wallet_payments_count: cuenta de jugadores que pagaron con Club
    -- wallet. Cada uno cubre su parte proporcional del booking.
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

  -- ─── Campos por canal ──────────────────────────────────────────────
  COALESCE(c.online_csv_total, 0)                                         AS online_csv_total,
  COALESCE(c.manager_csv_total, 0)                                        AS manager_csv_total,
  COALESCE(c.other_csv_total, 0)                                          AS other_csv_total,

  -- ─── Wallet coverage (nuevo) ───────────────────────────────────────
  -- Cada wallet payment cubre price_amount/participant_count, capeado al
  -- saldo restante para evitar double-counting con online+waitry.
  COALESCE(c.wallet_payments_count, 0)                                    AS wallet_payments_count,
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    WHEN COALESCE(pa.participant_count, 0) = 0 THEN 0
    WHEN COALESCE(c.wallet_payments_count, 0) = 0 THEN 0
    ELSE GREATEST(
      0,
      LEAST(
        c.wallet_payments_count::numeric * (b.price_amount / pa.participant_count::numeric),
        b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
      )
    )
  END                                                                     AS wallet_coverage,

  -- ─── Cobertura efectiva ────────────────────────────────────────────
  -- effective_total = waitry + online_csv + wallet_coverage.
  -- (Manager queda fuera por design — sigue siendo el "no verificado".)
  COALESCE(w.waitry_total, 0)
    + COALESCE(c.online_csv_total, 0)
    + CASE
        WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
        WHEN COALESCE(pa.participant_count, 0) = 0 THEN 0
        WHEN COALESCE(c.wallet_payments_count, 0) = 0 THEN 0
        ELSE GREATEST(
          0,
          LEAST(
            c.wallet_payments_count::numeric * (b.price_amount / pa.participant_count::numeric),
            b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
          )
        )
      END                                                                 AS effective_total,

  CASE
    WHEN COALESCE(w.waitry_total, 0)
       + COALESCE(c.online_csv_total, 0)
       + CASE
           WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
           WHEN COALESCE(pa.participant_count, 0) = 0 THEN 0
           WHEN COALESCE(c.wallet_payments_count, 0) = 0 THEN 0
           ELSE GREATEST(
             0,
             LEAST(
               c.wallet_payments_count::numeric * (b.price_amount / pa.participant_count::numeric),
               b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
             )
           )
         END = 0 THEN 'none'
    WHEN COALESCE(w.waitry_total, 0)
       + COALESCE(c.online_csv_total, 0)
       + CASE
           WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
           WHEN COALESCE(pa.participant_count, 0) = 0 THEN 0
           WHEN COALESCE(c.wallet_payments_count, 0) = 0 THEN 0
           ELSE GREATEST(
             0,
             LEAST(
               c.wallet_payments_count::numeric * (b.price_amount / pa.participant_count::numeric),
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
              WHEN COALESCE(pa.participant_count, 0) = 0 THEN 0
              WHEN COALESCE(c.wallet_payments_count, 0) = 0 THEN 0
              ELSE GREATEST(
                0,
                LEAST(
                  c.wallet_payments_count::numeric * (b.price_amount / pa.participant_count::numeric),
                  b.price_amount - COALESCE(w.waitry_total, 0) - COALESCE(c.online_csv_total, 0)
                )
              )
            END
        ) / b.price_amount * 100,
        2
      )
    )
  END                                                                     AS effective_pct,

  -- Flag operativo: el manager marcó pagos onsite en el panel pero no
  -- hay equivalente trazable en Waitry. Wellhub ya NO entra aquí
  -- (ahora cuenta como online), Club wallet tampoco (cuenta como
  -- wallet con cobertura proporcional).
  (COALESCE(c.manager_csv_total, 0) > COALESCE(w.waitry_total, 0))        AS has_unverified_manager,
  COALESCE(c.online_csv_payment_ids,  ARRAY[]::text[])                    AS online_csv_payment_ids,
  COALESCE(c.manager_csv_payment_ids, ARRAY[]::text[])                    AS manager_csv_payment_ids,
  COALESCE(c.wallet_csv_payment_ids,  ARRAY[]::text[])                    AS wallet_csv_payment_ids
FROM playtomic.bookings b
LEFT JOIN waitry_agg w        ON w.booking_id  = b.booking_id
LEFT JOIN csv_agg    c        ON c.booking_id  = b.booking_id
LEFT JOIN participants_agg pa ON pa.booking_id = b.booking_id;

GRANT SELECT ON playtomic.v_bookings_total_coverage TO authenticated;

COMMENT ON VIEW playtomic.v_bookings_total_coverage IS
  'Cobertura combinada con breakdown por canal. Online = App/Web + Wellhub (trazables). Wallet = Club wallet (cubre parte proporcional con cap). Manager = onsite no verificado. effective_total = waitry + online + wallet. Iniciativa rdb-pagos-cancha-conciliacion.';

NOTIFY pgrst, 'reload schema';

COMMIT;
