-- Iniciativa rdb-pagos-cancha-conciliacion — Refactor del modelo de cobertura
--
-- Problema: la vista v_bookings_total_coverage (S2-CSV-B) mezclaba TODOS los
-- pagos del CSV en `csv_total` sin distinguir el canal. Eso ocultaba el bug
-- operativo central de la iniciativa: cuando un manager marca "Paid Onsite"
-- en el panel web de Playtomic, ese pago aparece en payments_import con
-- origin='Playtomic Manager' (cobro físico marcado a mano), pero NO necesa-
-- riamente entró por la caja física via Waitry. El club perdía la
-- trazabilidad del cobro.
--
-- Además: el filtro del dashboard (`/rdb/playtomic/conciliacion`) estaba
-- atado a `payment_status='PENDING'` en bookings. Eso excluía los
-- 'PARTIAL_PAID' (~112 reservas / $86K en 90d) que SÍ requieren
-- conciliación parcial, y los 'PAID' donde el agregado es paid pero la
-- cobertura trazable es < total (~? reservas, los más sospechosos).
--
-- Solución: separar `csv_total` en dos:
--   - online_csv_total  (origin LIKE 'App%' OR origin = 'Web (desktop)'):
--     pagos online procesados por la app del cliente. Trazables — ya están
--     en cuenta del club.
--   - manager_csv_total (origin = 'Playtomic Manager'):
--     pagos marcados manualmente por un manager. NO necesariamente entraron
--     a Waitry. Pueden ser cash en cancha que el manager registró pero no
--     creó pedido en Waitry, o cortesía no formal.
--
-- Y agregar:
--   - effective_total  = waitry_total + online_csv_total
--     Esta es la cobertura realmente verificable.
--   - effective_status = 'none' / 'partial' / 'full' (basado en effective_total).
--   - has_unverified_manager = (manager_csv_total > waitry_total)
--     Flag para destacar bookings con riesgo operativo: "manager marcó paid
--     en panel pero no hay equivalente en Waitry".
--
-- Compatibilidad: todos los campos viejos (csv_total, combined_total,
-- coverage_status, coverage_pct, csv_payment_ids, csv_payments_count,
-- waitry_order_ids) siguen presentes con la misma semántica para no romper
-- consumers que aún los usan. Una iteración futura puede deprecarlos.

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
   AND p.service_date BETWEEN b.booking_start - INTERVAL '90 minutes'
                          AND b.booking_start + INTERVAL '90 minutes'
   AND p.payment_status = 'Paid'
   -- Ventana ±90min absorbe un drift histórico de 1h entre `bookings.booking_start`
   -- (el API third-party manda el campo sin offset y el sync lo guarda como UTC,
   -- pero parece estar en zona local del club) y `payments_import.service_date`
   -- (parseado por el CSV importer con offset -06:00 explícito → UTC correcto).
   -- TODO: arreglar el sync para que normalice booking_start a UTC verdadero;
   -- después podríamos volver a ±15min para más precisión.
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

COMMENT ON VIEW playtomic.v_bookings_total_coverage IS
  'Cobertura combinada con breakdown por canal: waitry + online_csv (App/Web, trazable) + manager_csv (Playtomic Manager onsite, NO trazable hasta conciliar contra Waitry). effective_total = waitry + online_csv. has_unverified_manager flagea bookings con riesgo operativo. Iniciativa rdb-pagos-cancha-conciliacion.';

NOTIFY pgrst, 'reload schema';

COMMIT;
