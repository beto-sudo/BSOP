-- Iniciativa rdb-pagos-cancha-conciliacion — Permitir split-payment
--
-- Caso operativo: un coach (ej. Omar Palacios) cobra 3 clases del mismo
-- cliente con UNA sola orden Waitry. La operación tiene que asignar ese
-- order a 3 reservas Playtomic distintas, cubriendo cada una con la
-- fracción correspondiente del pago.
--
-- El schema original (20260504000000_playtomic_payment_assignments.sql)
-- tenía `UNIQUE(waitry_order_id)`, prohibiendo el caso. Ya tenía
-- `assigned_amount numeric NOT NULL CHECK (assigned_amount > 0)`, así
-- que el creador previó splits — solo se equivocó en el constraint.
--
-- Cambios:
-- 1. Drop UNIQUE(waitry_order_id) → permite N assignments del mismo order
-- 2. Add UNIQUE(booking_id, waitry_order_id) → impide duplicar el mismo
--    par (no tiene sentido la misma reserva pagada 2× con la misma orden)
-- 3. Trigger BEFORE INSERT/UPDATE que valida:
--      SUM(assigned_amount FOR waitry_order_id) <= waitry_pedidos.total_amount
--    + advisory lock por order_id para evitar race entre inserts paralelos
--    que individualmente caben pero juntos exceden.
--
-- Compatibilidad: los assignments existentes (1:1) siguen siendo válidos
-- como N=1 del nuevo modelo. No se borra ni modifica data.
BEGIN;

ALTER TABLE playtomic.payment_assignments
  DROP CONSTRAINT IF EXISTS payment_assignments_waitry_order_id_key;

ALTER TABLE playtomic.payment_assignments
  ADD CONSTRAINT payment_assignments_booking_order_unique
  UNIQUE (booking_id, waitry_order_id);

CREATE OR REPLACE FUNCTION playtomic.fn_validate_assignment_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = playtomic, rdb, pg_temp
AS $$
DECLARE
  v_order_total numeric;
  v_sum_assigned numeric;
  v_lock_key bigint;
BEGIN
  -- Lock por order_id para serializar inserts paralelos del mismo order.
  -- hashtextextended produce un bigint estable; el _xact lock se libera al
  -- terminar la transacción.
  v_lock_key := hashtextextended(NEW.waitry_order_id, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT total_amount INTO v_order_total
  FROM rdb.waitry_pedidos
  WHERE order_id = NEW.waitry_order_id;

  IF v_order_total IS NULL THEN
    RAISE EXCEPTION 'Pedido Waitry % no existe o no tiene total_amount', NEW.waitry_order_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT COALESCE(SUM(assigned_amount), 0) INTO v_sum_assigned
  FROM playtomic.payment_assignments
  WHERE waitry_order_id = NEW.waitry_order_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_sum_assigned + NEW.assigned_amount > v_order_total + 0.01 THEN
    RAISE EXCEPTION
      'El monto asignado (%) excede el saldo disponible (% de %) del pedido Waitry %',
      NEW.assigned_amount,
      v_order_total - v_sum_assigned,
      v_order_total,
      NEW.waitry_order_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_assignment_total ON playtomic.payment_assignments;
CREATE TRIGGER trg_validate_assignment_total
  BEFORE INSERT OR UPDATE OF assigned_amount, waitry_order_id
  ON playtomic.payment_assignments
  FOR EACH ROW
  EXECUTE FUNCTION playtomic.fn_validate_assignment_total();

COMMENT ON CONSTRAINT payment_assignments_booking_order_unique
  ON playtomic.payment_assignments IS
  'Un mismo (booking, order) no puede duplicarse, pero un order SÍ puede asignarse a múltiples bookings (split-payment de coaches).';

COMMENT ON TRIGGER trg_validate_assignment_total
  ON playtomic.payment_assignments IS
  'Valida que SUM(assigned_amount) por order no exceda waitry_pedidos.total_amount. Usa advisory lock para evitar race entre inserts paralelos. Tolerancia 0.01 para redondeos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
