-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601201000_fix_cxc_pago_movimiento_tipo                       │
-- │                                                                    │
-- │  Fix de bug latente en erp.cxc_pago_registrar.                     │
-- │                                                                    │
-- │  El INSERT a erp.movimientos_bancarios usaba tipo='ingreso', pero  │
-- │  la columna `tipo` tiene un CHECK que SOLO permite ('cargo',       │
-- │  'abono'). Un abono de CxC es dinero que ENTRA a la cuenta, así    │
-- │  que el valor correcto es 'abono'.                                 │
-- │                                                                    │
-- │  Latente hoy porque la UI de captura (abono-capture-drawer.tsx) no │
-- │  pasa cuenta_bancaria_id, así que ese INSERT no corre; pero        │
-- │  tronaría con violación del CHECK en cuanto se capture un abono    │
-- │  con cuenta bancaria.                                              │
-- │                                                                    │
-- │  CREATE OR REPLACE de la función — no toca tablas ni datos.        │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION erp.cxc_pago_registrar(
  p_empresa_id uuid,
  p_persona_id uuid,
  p_origen_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_fuente text DEFAULT 'cliente',
  p_forma_pago text DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_uuid_sat text DEFAULT NULL,
  p_comprobante_adjunto_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_auto_aplicar boolean DEFAULT true
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pago_id uuid;
  v_restante numeric(14, 2);
  v_aplicar numeric(14, 2);
  c record;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser > 0';
  END IF;

  INSERT INTO erp.cxc_pagos (
    empresa_id, persona_id, origen_tipo, origen_id, fecha, monto_total,
    fuente, forma_pago, referencia, cuenta_bancaria_id, uuid_sat,
    comprobante_adjunto_id, notas
  ) VALUES (
    p_empresa_id, p_persona_id, 'venta_dilesa', p_origen_id, p_fecha, p_monto,
    p_fuente, p_forma_pago, p_referencia, p_cuenta_bancaria_id, p_uuid_sat,
    p_comprobante_adjunto_id, p_notas
  ) RETURNING id INTO v_pago_id;

  -- Auto-aplicación FIFO a los cargos abiertos de ESA venta, por fuente,
  -- del más viejo al más nuevo. Lo que sobra queda como saldo a favor.
  IF p_auto_aplicar THEN
    v_restante := p_monto;
    FOR c IN
      SELECT id, saldo
        FROM erp.cxc_cargos
       WHERE origen_tipo = 'venta_dilesa'
         AND origen_id = p_origen_id
         AND fuente_esperada = p_fuente
         AND estado <> 'cancelado'
         AND deleted_at IS NULL
         AND saldo > 0
       ORDER BY fecha_vencimiento ASC NULLS LAST, numero ASC
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, c.saldo);
      INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
      VALUES (p_empresa_id, v_pago_id, c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
    END LOOP;
  END IF;

  -- Movimiento bancario (gancho de tesorería, ADR-037 D4). Solo si se
  -- conoce la cuenta donde cayó el abono. tipo='abono' = dinero que entra
  -- (el CHECK de la columna solo permite 'cargo'/'abono').
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      p_empresa_id, p_cuenta_bancaria_id, 'abono', p_monto, p_fecha,
      'Abono CxC', p_referencia, 'cxc_pago', v_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'cxc_pago_registrado', 'erp.cxc_pagos', v_pago_id,
    jsonb_build_object('monto', p_monto, 'fuente', p_fuente, 'origen_id', p_origen_id,
      'auto_aplicar', p_auto_aplicar));

  RETURN v_pago_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
