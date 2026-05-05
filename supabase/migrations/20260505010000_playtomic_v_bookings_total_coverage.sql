-- Iniciativa rdb-pagos-cancha-conciliacion — Sprint 2 (CSV import, parte B)
--
-- Vista combinada que para cada booking suma cobertura de AMBAS fuentes:
--   1. payment_assignments (Waitry manual, S1 + S2-Waitry futuro)
--   2. payments_import (CSV de Playtomic Manager, S2-CSV-A)
--
-- Esta vista reemplaza conceptualmente a v_bookings_payment_coverage para
-- determinar el estado real de un booking. La vista anterior (S1) sigue
-- existiendo y solo refleja Waitry.
--
-- Match key con CSV: (cualquier participante.player_id == payments_import.user_id)
-- AND service_date dentro de ±15 min del booking_start AND payment_status='Paid'.
-- El match por participante (no solo owner) cubre los splits donde cada
-- jugador paga su parte por separado.

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
csv_agg AS (
  SELECT
    b.booking_id,
    SUM(p.total) AS csv_total,
    COUNT(DISTINCT p.payment_id) AS csv_payments_count,
    ARRAY_AGG(DISTINCT p.payment_id) AS csv_payment_ids
  FROM playtomic.bookings b
  JOIN playtomic.booking_participants bp ON bp.booking_id = b.booking_id
  JOIN playtomic.payments_import p
    ON p.user_id = bp.player_id
   AND p.service_date BETWEEN b.booking_start - INTERVAL '15 minutes'
                          AND b.booking_start + INTERVAL '15 minutes'
   AND p.payment_status = 'Paid'
  GROUP BY b.booking_id
)
SELECT
  b.booking_id,
  b.price_amount AS booking_total,
  COALESCE(w.waitry_total, 0) AS waitry_total,
  COALESCE(c.csv_total, 0)    AS csv_total,
  COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0) AS combined_total,
  CASE
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0) = 0 THEN 'none'
    WHEN COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0) >= COALESCE(b.price_amount, 0) THEN 'full'
    ELSE 'partial'
  END AS coverage_status,
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    ELSE LEAST(
      100,
      ROUND(
        (COALESCE(w.waitry_total, 0) + COALESCE(c.csv_total, 0)) / b.price_amount * 100,
        2
      )
    )
  END AS coverage_pct,
  COALESCE(w.waitry_order_ids,  ARRAY[]::text[]) AS waitry_order_ids,
  COALESCE(c.csv_payments_count, 0)              AS csv_payments_count,
  COALESCE(c.csv_payment_ids,    ARRAY[]::text[]) AS csv_payment_ids
FROM playtomic.bookings b
LEFT JOIN waitry_agg w ON w.booking_id = b.booking_id
LEFT JOIN csv_agg    c ON c.booking_id = b.booking_id;

GRANT SELECT ON playtomic.v_bookings_total_coverage TO authenticated;

COMMENT ON VIEW playtomic.v_bookings_total_coverage IS
  'Cobertura combinada de un booking: payment_assignments (Waitry) + payments_import (CSV). Match con CSV por participante + service_date ±15min + Paid. Iniciativa rdb-pagos-cancha-conciliacion.';

NOTIFY pgrst, 'reload schema';

COMMIT;
