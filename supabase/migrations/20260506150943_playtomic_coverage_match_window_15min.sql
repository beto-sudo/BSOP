-- Iniciativa rdb-pagos-cancha-conciliacion — Estrechar match window CSV a ±15min
--
-- Contexto: la migración 20260506010513_playtomic_coverage_effective.sql
-- usaba ±90min para absorber un drift histórico de hasta +1h durante el
-- período DST EE.UU. en `bookings.booking_start` (el sync guardaba el campo
-- naive del API third-party como UTC sin convertir desde America/Chicago).
--
-- PR #435 corrigió el sync (helper `naiveChicagoIsoToUtc` con ajuste DST
-- vía `chicagoOffsetMsAt`). Verificación post-deploy (2026-05-06):
--   - 403/419 pagos online (96.2%) caen en ±5min de booking_start
--   - 405/419 (96.6%) caen en ±15min
--   - avg(delta) = -0.86min, sin patrón sistemático por semana
--   - Los 14 outliers en 15-90min son SPURIOUS: pares de bookings adyacen-
--     tes del mismo user (00:00/00:30, 02:30/03:30) que capturan ambos el
--     mismo pago; o bookings de eventos (price=2600) capturando pagos
--     $200 que son de otros bookings.
--
-- Estrechar a ±15min elimina falsos positivos sin sacrificar coverage real.
-- Se elimina el TODO histórico que apuntaba a este momento.
BEGIN;

CREATE OR REPLACE VIEW playtomic.v_bookings_total_coverage
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
  -- El match por participante (no solo owner) cubre los splits donde cada jugador
  -- paga su parte por separado.
  SELECT
    b.booking_id,
    p.payment_id,
    p.total                                                                   AS amount,
    p.origin                                                                  AS origin,
    CASE
      WHEN p.origin LIKE 'App%' OR p.origin = 'Web (desktop)' THEN 'online'
      WHEN p.origin = 'Playtomic Manager'                     THEN 'manager'
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
    COUNT(DISTINCT payment_id)                                           AS csv_payments_count,
    ARRAY_AGG(DISTINCT payment_id)                                       AS csv_payment_ids,
    ARRAY_AGG(DISTINCT payment_id) FILTER (WHERE channel = 'online')     AS online_csv_payment_ids,
    ARRAY_AGG(DISTINCT payment_id) FILTER (WHERE channel = 'manager')    AS manager_csv_payment_ids
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

  -- ─── Campos nuevos (refactor) ───────────────────────────────────────
  COALESCE(c.online_csv_total, 0)                                         AS online_csv_total,
  COALESCE(c.manager_csv_total, 0)                                        AS manager_csv_total,
  COALESCE(c.other_csv_total, 0)                                          AS other_csv_total,
  COALESCE(w.waitry_total, 0) + COALESCE(c.online_csv_total, 0)           AS effective_total,
  CASE
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.online_csv_total, 0) = 0 THEN 'none'
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.online_csv_total, 0)
         >= COALESCE(b.price_amount, 0) THEN 'full'
    ELSE 'partial'
  END                                                                     AS effective_status,
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    ELSE LEAST(
      100,
      ROUND(
        (COALESCE(w.waitry_total, 0) + COALESCE(c.online_csv_total, 0)) / b.price_amount * 100,
        2
      )
    )
  END                                                                     AS effective_pct,
  -- Flag operativo: el manager marcó pagos onsite en el panel pero no
  -- hay equivalente trazable en Waitry. Esto es el "agujero" central de
  -- la iniciativa — el cobro está sin verificar en la caja del club.
  (COALESCE(c.manager_csv_total, 0) > COALESCE(w.waitry_total, 0))        AS has_unverified_manager,
  COALESCE(c.online_csv_payment_ids,  ARRAY[]::text[])                    AS online_csv_payment_ids,
  COALESCE(c.manager_csv_payment_ids, ARRAY[]::text[])                    AS manager_csv_payment_ids
FROM playtomic.bookings b
LEFT JOIN waitry_agg w ON w.booking_id = b.booking_id
LEFT JOIN csv_agg    c ON c.booking_id = b.booking_id;

GRANT SELECT ON playtomic.v_bookings_total_coverage TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
