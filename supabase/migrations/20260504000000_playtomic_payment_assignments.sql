-- Iniciativa rdb-pagos-cancha-conciliacion — Sprint 1
--
-- Crea el modelo de datos para conciliar reservas Playtomic con pagos
-- "en club" registrados como pedidos en Waitry. El third-party API de
-- Playtomic no expone los pagos en cancha (efectivo/tarjeta cobrados
-- en recepción), pero esos cobros sí están en `rdb.waitry_pedidos` con
-- producto "Renta Cancha Padel". Esta migración define la tabla de
-- asignaciones (1 reserva ↔ N pedidos Waitry) y la vista derivada de
-- cobertura.
--
-- S1 sólo crea estructura: la UI lee. Las server actions de write
-- (assign / unassign) llegan en S2.

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- Tabla de asignaciones
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS playtomic.payment_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      text        NOT NULL REFERENCES playtomic.bookings(booking_id)   ON DELETE CASCADE,
  waitry_order_id text        NOT NULL UNIQUE REFERENCES rdb.waitry_pedidos(order_id) ON DELETE RESTRICT,
  assigned_amount numeric     NOT NULL CHECK (assigned_amount > 0),
  assigned_by     uuid        NOT NULL REFERENCES auth.users(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  note            text        NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_assignments_booking_id
  ON playtomic.payment_assignments(booking_id);

COMMENT ON TABLE playtomic.payment_assignments IS
  'Asignación manual: 1 reserva Playtomic ↔ N pedidos de Waitry "Renta Cancha Padel" que la cubren. Audit trail nativo via assigned_by + assigned_at. UNIQUE(waitry_order_id) impide doble asignación. Iniciativa rdb-pagos-cancha-conciliacion.';

-- ══════════════════════════════════════════════════════════════════
-- RLS — mismo scoping que el resto del schema playtomic (RDB only)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE playtomic.payment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_assignments_select
  ON playtomic.payment_assignments
  FOR SELECT TO authenticated
  USING (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

CREATE POLICY payment_assignments_write
  ON playtomic.payment_assignments
  FOR ALL TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

CREATE POLICY payment_assignments_service_role
  ON playtomic.payment_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════
-- Vista de cobertura: por cada booking, cuánto está asignado
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW playtomic.v_bookings_payment_coverage
WITH (security_invoker = true)
AS
SELECT
  b.booking_id,
  b.price_amount AS booking_total,
  COALESCE(SUM(pa.assigned_amount), 0) AS assigned_total,
  CASE
    WHEN COALESCE(SUM(pa.assigned_amount), 0) = 0                        THEN 'none'
    WHEN COALESCE(SUM(pa.assigned_amount), 0) >= COALESCE(b.price_amount, 0) THEN 'full'
    ELSE 'partial'
  END AS coverage_status,
  CASE
    WHEN COALESCE(b.price_amount, 0) = 0 THEN 0
    ELSE LEAST(100, ROUND(COALESCE(SUM(pa.assigned_amount), 0) / b.price_amount * 100, 2))
  END AS coverage_pct,
  COALESCE(
    ARRAY_AGG(pa.waitry_order_id ORDER BY pa.assigned_at) FILTER (WHERE pa.id IS NOT NULL),
    ARRAY[]::text[]
  ) AS assigned_waitry_orders
FROM playtomic.bookings b
LEFT JOIN playtomic.payment_assignments pa ON pa.booking_id = b.booking_id
GROUP BY b.booking_id, b.price_amount;

GRANT SELECT ON playtomic.v_bookings_payment_coverage TO authenticated;

COMMENT ON VIEW playtomic.v_bookings_payment_coverage IS
  'Cobertura derivada por reserva: total reserva, suma de pagos asignados, estado (none/partial/full), %. Vista security_invoker — la RLS de la tabla subyacente aplica. Iniciativa rdb-pagos-cancha-conciliacion.';

-- ══════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ══════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;
