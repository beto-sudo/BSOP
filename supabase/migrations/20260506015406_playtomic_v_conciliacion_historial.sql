-- Iniciativa rdb-pagos-cancha-conciliacion — Tab Historial
--
-- Vista unificada de TODOS los eventos de cobertura de un booking: una fila
-- por cada pago/asignación que contribuye a la cobertura efectiva.
--
-- Tres fuentes:
--   1. waitry  — assignment manual desde `/rdb/playtomic/conciliacion`.
--   2. online  — pago en CSV con origin LIKE 'App%' OR origin = 'Web (desktop)'.
--   3. manager — pago en CSV con origin = 'Playtomic Manager' (onsite que el
--                manager marcó en el panel; es candidato a conciliar contra
--                Waitry si no hay equivalente).
--
-- Columnas comunes para que el cliente pinte una sola tabla:
--   - row_id           — identificador único (uuid de assignment o payment_id)
--   - source           — 'waitry' / 'online' / 'manager' / 'other'
--   - booking_*        — metadata de la reserva (start, cancha, total, owner)
--   - reference_id     — order_id Waitry o payment_id CSV
--   - amount           — monto del pago/asignación
--   - payment_method   — Cash / Credit card / Apple Pay / etc (CSV); null en Waitry
--   - payment_origin   — origin crudo del CSV (App iOS / Manager / Web); null en Waitry
--   - event_at         — assigned_at (Waitry) o payment_date (CSV)
--   - assigned_by      — uuid del usuario que asignó (Waitry); null en CSV
--   - subject          — nombre del jugador que pagó (CSV) o note interna (Waitry)
--
-- security_invoker = true: respeta las RLS de las tablas subyacentes
-- (mismo patrón que v_bookings_total_coverage).

BEGIN;

CREATE OR REPLACE VIEW playtomic.v_conciliacion_historial
WITH (security_invoker = true)
AS
-- ──────────────────────────────────────────────────────────────────
-- Fuente 1: Asignaciones Waitry (manual, payment_assignments)
-- ──────────────────────────────────────────────────────────────────
SELECT
  pa.id::text                              AS row_id,
  'waitry'::text                           AS source,
  pa.booking_id,
  b.booking_start,
  b.resource_name,
  b.price_amount                           AS booking_total,
  b.owner_id,
  pa.waitry_order_id                       AS reference_id,
  pa.assigned_amount                       AS amount,
  null::text                               AS payment_method,
  null::text                               AS payment_origin,
  pa.assigned_at                           AS event_at,
  pa.assigned_by,
  pa.note                                  AS subject
FROM playtomic.payment_assignments pa
JOIN playtomic.bookings b USING (booking_id)

UNION ALL

-- ──────────────────────────────────────────────────────────────────
-- Fuente 2 + 3: Pagos del CSV matched al booking (Online + Manager + Other)
-- Mismo match key que v_bookings_total_coverage (ventana ±90min, paid).
-- ──────────────────────────────────────────────────────────────────
SELECT
  p.payment_id                             AS row_id,
  CASE
    WHEN p.origin LIKE 'App%' OR p.origin = 'Web (desktop)' THEN 'online'
    WHEN p.origin = 'Playtomic Manager'                     THEN 'manager'
    ELSE 'other'
  END                                      AS source,
  b.booking_id,
  b.booking_start,
  b.resource_name,
  b.price_amount                           AS booking_total,
  b.owner_id,
  p.payment_id                             AS reference_id,
  p.total                                  AS amount,
  p.payment_method,
  p.origin                                 AS payment_origin,
  p.payment_date                           AS event_at,
  null::uuid                               AS assigned_by,
  p.user_name                              AS subject
FROM playtomic.payments_import p
JOIN playtomic.booking_participants bp ON bp.player_id = p.user_id
JOIN playtomic.bookings b              ON b.booking_id = bp.booking_id
WHERE p.payment_status = 'Paid'
  AND p.service_date BETWEEN b.booking_start - INTERVAL '90 minutes'
                         AND b.booking_start + INTERVAL '90 minutes';

GRANT SELECT ON playtomic.v_conciliacion_historial TO authenticated;

COMMENT ON VIEW playtomic.v_conciliacion_historial IS
  'Eventos de cobertura unificados por booking: 1 fila por cada pago/asignación. Fuentes: waitry (manual), online (CSV App/Web), manager (CSV Playtomic Manager onsite). Iniciativa rdb-pagos-cancha-conciliacion (tab Historial).';

NOTIFY pgrst, 'reload schema';

COMMIT;
