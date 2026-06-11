-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260611003056_cxp_fix_saldo_solo_pagos_ejecutados               │
-- │                                                                    │
-- │  Hotfix CxP (bug reportado por Beto 2026-06-10): al PROGRAMAR un   │
-- │  pago, las facturas se marcaban "pagada" — el trigger de saldo     │
-- │  sumaba TODAS las aplicaciones sin distinguir el estado del pago.  │
-- │  Caso real: 2 facturas (proveedor A.S. Morado, $220k + $86k) en    │
-- │  estado_cxp='pagada' con $0 ejecutado (pago en `programado`).      │
-- │                                                                    │
-- │  1. erp.fn_cxp_recalc_factura(uuid) — recálculo compartido:        │
-- │     monto_pagado = Σ aplicaciones de pagos `estado='pagado'`       │
-- │     vivos. "Pagada" vuelve a significar dinero ejecutado.          │
-- │  2. fn_cxp_recalc_factura_saldo (trigger de aplicaciones) delega   │
-- │     en (1); trigger NUEVO en cxp_pagos: cambiar estado/deleted_at  │
-- │     recalcula sus facturas (marcar pagado ahora sí las actualiza). │
-- │  3. cxp_pago_programar: la validación anti-sobre-programación      │
-- │     compara contra lo COMPROMETIDO vivo (programado/aprobado/      │
-- │     pagado), no contra el saldo (que ahora es solo ejecutado).     │
-- │  4. cxp_pago_aprobar: override de admin global — política de Beto  │
-- │     2026-06-10: "Admin siempre tiene acceso a todo, nunca debe     │
-- │     bloquearse" (corrige el gate solo-Dirección de 20260601214500).│
-- │  5. Backfill: recalcula toda factura con aplicaciones (las 2 del   │
-- │     caso vuelven a `por_pagar`).                                   │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Recálculo compartido por factura ──────────────────────────────

CREATE OR REPLACE FUNCTION erp.fn_cxp_recalc_factura(p_factura_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pagado numeric(14, 2);
BEGIN
  -- Solo dinero EJECUTADO: aplicaciones de pagos en estado 'pagado' y
  -- vivos. Un pago programado/aprobado es compromiso, no pago.
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
    INTO v_pagado
    FROM erp.cxp_pago_aplicaciones a
    JOIN erp.cxp_pagos p ON p.id = a.pago_id
   WHERE a.factura_id = p_factura_id
     AND p.estado = 'pagado'
     AND p.deleted_at IS NULL;

  UPDATE erp.facturas f
     SET monto_pagado = v_pagado,
         estado_cxp = CASE
           WHEN f.estado_cxp = 'cancelada' THEN 'cancelada'
           WHEN f.total > 0 AND v_pagado >= f.total THEN 'pagada'
           WHEN v_pagado > 0 THEN 'parcial'
           WHEN f.estado_cxp = 'borrador' THEN 'borrador'
           ELSE 'por_pagar'
         END,
         updated_at = now()
   WHERE f.id = p_factura_id;
END;
$$;

COMMENT ON FUNCTION erp.fn_cxp_recalc_factura(uuid) IS
  'Recalcula monto_pagado/estado_cxp de UNA factura contando solo aplicaciones de pagos ejecutados (estado=pagado, vivos). saldo es columna generada (total - monto_pagado). Hotfix 2026-06-11.';

-- ─── 2a. Trigger de aplicaciones delega en el recálculo compartido ────

CREATE OR REPLACE FUNCTION erp.fn_cxp_recalc_factura_saldo()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM erp.fn_cxp_recalc_factura(NEW.factura_id);
  END IF;
  IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.factura_id IS DISTINCT FROM NEW.factura_id)) THEN
    PERFORM erp.fn_cxp_recalc_factura(OLD.factura_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION erp.fn_cxp_recalc_factura_saldo() IS
  'Trigger AFTER en cxp_pago_aplicaciones → recalcula la(s) factura(s) via fn_cxp_recalc_factura (solo pagos ejecutados cuentan). ADR-037 D3 + hotfix 2026-06-11.';

-- ─── 2b. Trigger NUEVO: cambio de estado del pago recalcula facturas ──
-- marcar_pagado / transiciones solo tocan cxp_pagos.estado — sin esto,
-- ejecutar un pago no actualizaría el estado de sus facturas.

CREATE OR REPLACE FUNCTION erp.fn_cxp_pagos_recalc_facturas()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_factura_id uuid;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    FOR v_factura_id IN
      SELECT DISTINCT a.factura_id
        FROM erp.cxp_pago_aplicaciones a
       WHERE a.pago_id = NEW.id
    LOOP
      PERFORM erp.fn_cxp_recalc_factura(v_factura_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cxp_pagos_recalc_facturas ON erp.cxp_pagos;
CREATE TRIGGER trg_cxp_pagos_recalc_facturas
  AFTER UPDATE ON erp.cxp_pagos
  FOR EACH ROW EXECUTE FUNCTION erp.fn_cxp_pagos_recalc_facturas();

-- ─── 3. Programar: validar contra lo comprometido vivo ────────────────
-- f.saldo ya no sirve aquí (refleja solo ejecutado): sin este cambio se
-- podría programar dos veces el mismo monto. Resto del cuerpo idéntico
-- a 20260601200000.

CREATE OR REPLACE FUNCTION erp.cxp_pago_programar(
  p_empresa_id uuid,
  p_proveedor_id uuid,
  p_aplicaciones jsonb,
  p_metodo_pago text DEFAULT NULL,
  p_fecha_programada date DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pago_id uuid;
  v_total numeric(14, 2);
  r record;
  v_factura record;
  v_comprometido numeric(14, 2);
BEGIN
  SELECT COALESCE(SUM((x->>'monto')::numeric), 0) INTO v_total
    FROM jsonb_array_elements(p_aplicaciones) x;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El pago debe aplicar a un monto > 0';
  END IF;

  INSERT INTO erp.cxp_pagos (
    empresa_id, proveedor_id, monto_total, fecha_programada,
    cuenta_bancaria_id, metodo_pago, referencia, estado, notas
  ) VALUES (
    p_empresa_id, p_proveedor_id, v_total, p_fecha_programada,
    p_cuenta_bancaria_id, p_metodo_pago, p_referencia, 'programado', p_notas
  ) RETURNING id INTO v_pago_id;

  FOR r IN SELECT (x->>'factura_id')::uuid AS factura_id, (x->>'monto')::numeric AS monto
             FROM jsonb_array_elements(p_aplicaciones) x
  LOOP
    IF r.monto IS NULL OR r.monto <= 0 THEN
      CONTINUE;
    END IF;
    SELECT empresa_id, estado_cxp, total INTO v_factura
      FROM erp.facturas WHERE id = r.factura_id;
    IF NOT FOUND OR v_factura.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'Factura % no existe o es de otra empresa', r.factura_id;
    END IF;
    IF v_factura.estado_cxp = 'cancelada' THEN
      RAISE EXCEPTION 'Factura % está cancelada', r.factura_id;
    END IF;

    -- Comprometido vivo: aplicaciones de pagos programados, aprobados o
    -- ya pagados (cancelados/rechazados no cuentan).
    SELECT COALESCE(SUM(a.monto_aplicado), 0)
      INTO v_comprometido
      FROM erp.cxp_pago_aplicaciones a
      JOIN erp.cxp_pagos p2 ON p2.id = a.pago_id
     WHERE a.factura_id = r.factura_id
       AND p2.estado IN ('programado', 'aprobado', 'pagado')
       AND p2.deleted_at IS NULL;

    IF r.monto > (COALESCE(v_factura.total, 0) - v_comprometido) THEN
      RAISE EXCEPTION 'El monto (%) excede lo disponible por programar de la factura % (total %, ya comprometido en otros pagos %)',
        r.monto, r.factura_id, v_factura.total, v_comprometido;
    END IF;

    INSERT INTO erp.cxp_pago_aplicaciones (empresa_id, pago_id, factura_id, monto_aplicado)
    VALUES (p_empresa_id, v_pago_id, r.factura_id, r.monto);
  END LOOP;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'cxp_pago_programado', 'erp.cxp_pagos', v_pago_id,
    jsonb_build_object('monto_total', v_total, 'proveedor_id', p_proveedor_id,
      'aplicaciones', p_aplicaciones));

  RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION erp.cxp_pago_programar IS
  'Programa un pago con N aplicaciones a facturas. Valida contra lo comprometido vivo (programado/aprobado/pagado), no contra el saldo ejecutado. Hotfix 2026-06-11.';

-- ─── 4. Aprobar: admin global SIEMPRE puede (política Beto 2026-06-10) ─

CREATE OR REPLACE FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado <> 'programado' THEN
    RAISE EXCEPTION 'El pago no está en estado programado (estado actual: %)', v.estado;
  END IF;
  -- Autoridad de aprobación: admin global O rol "Dirección" de la empresa.
  -- Política 2026-06-10 (Beto): el admin global nunca se bloquea.
  IF NOT (core.fn_is_admin() OR core.fn_user_has_role('Dirección', v.empresa_id)) THEN
    RAISE EXCEPTION 'Solo admin o un usuario con rol Dirección puede aprobar pagos';
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(), updated_at = now()
   WHERE id = p_pago_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_aprobado', 'erp.cxp_pagos', p_pago_id, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION erp.cxp_pago_aprobar IS
  'Aprueba un pago programado. Gate: admin global O rol Dirección de la empresa (política 2026-06-10: admin nunca se bloquea). Audit en core.audit_log.';

-- ─── 5. Backfill: recalcular toda factura con aplicaciones ────────────
-- Corrige el histórico: facturas marcadas pagada/parcial por pagos
-- meramente programados vuelven a por_pagar (o parcial real).

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT factura_id FROM erp.cxp_pago_aplicaciones LOOP
    PERFORM erp.fn_cxp_recalc_factura(v_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
