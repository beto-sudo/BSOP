-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601164158_erp_cxc_rpcs_pago                                  │
-- │                                                                    │
-- │  CxC Sprint 1 — PR A3: RPCs de pago (la maquinaria de abonos).     │
-- │                                                                    │
-- │  1. cxc_pagos gana origen_tipo/origen_id → el abono se liga a la   │
-- │     venta (como en Coda "Depositos Clientes").                     │
-- │  2. erp.cxc_pago_registrar — alta de abono + auto-aplicación FIFO  │
-- │     a los cargos de esa venta por fuente + emite movimiento        │
-- │     bancario (ADR-037 D4). Lo que sobra = saldo a favor.           │
-- │  3. erp.cxc_pago_aplicar — override manual de la aplicación.       │
-- │  4. erp.cxc_pago_cancelar — soft-delete + revierte aplicaciones.   │
-- │  5. erp.cxc_cargo_ajustar — ajuste de cargo (descuento/condonación)│
-- │                                                                    │
-- │  Ver docs/planning/cxc.md y docs/adr/037_subledger_gemelo_cxc_cxp. │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Ligar el abono a la venta ─────────────────────────────────────

ALTER TABLE erp.cxc_pagos
  ADD COLUMN IF NOT EXISTS origen_tipo text NOT NULL DEFAULT 'venta_dilesa',
  ADD COLUMN IF NOT EXISTS origen_id uuid;

CREATE INDEX IF NOT EXISTS cxc_pagos_origen_idx
  ON erp.cxc_pagos (origen_tipo, origen_id);

COMMENT ON COLUMN erp.cxc_pagos.origen_id IS
  'Venta a la que se liga el abono (dilesa.ventas.id cuando origen_tipo=venta_dilesa). El FIFO aplica a los cargos de esta venta.';

-- ─── 2. cxc_pago_registrar (alta + auto-aplicación FIFO + banco) ──────

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
  -- conoce la cuenta donde cayó el abono.
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      p_empresa_id, p_cuenta_bancaria_id, 'ingreso', p_monto, p_fecha,
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

COMMENT ON FUNCTION erp.cxc_pago_registrar IS
  'Registra un abono ligado a una venta, lo auto-aplica FIFO a los cargos de esa venta por fuente, y emite movimiento bancario si hay cuenta. Lo no aplicado = saldo a favor.';

-- ─── 3. cxc_pago_aplicar (override manual) ────────────────────────────

CREATE OR REPLACE FUNCTION erp.cxc_pago_aplicar(
  p_pago_id uuid,
  p_aplicaciones jsonb -- [{ "cargo_id": uuid, "monto": numeric }, ...]
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pago erp.cxc_pagos%ROWTYPE;
  v_suma numeric(14, 2);
  v_count integer := 0;
  r record;
BEGIN
  SELECT * INTO v_pago FROM erp.cxc_pagos WHERE id = p_pago_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono % no existe o está cancelado', p_pago_id;
  END IF;

  SELECT COALESCE(SUM((x->>'monto')::numeric), 0) INTO v_suma
    FROM jsonb_array_elements(p_aplicaciones) x;
  IF v_suma > v_pago.monto_total THEN
    RAISE EXCEPTION 'La suma de aplicaciones (%) excede el monto del abono (%)', v_suma, v_pago.monto_total;
  END IF;

  -- Reemplaza las aplicaciones del pago (el trigger recalcula saldos).
  DELETE FROM erp.cxc_pago_aplicaciones WHERE pago_id = p_pago_id;

  FOR r IN SELECT (x->>'cargo_id')::uuid AS cargo_id, (x->>'monto')::numeric AS monto
             FROM jsonb_array_elements(p_aplicaciones) x
  LOOP
    IF r.monto IS NULL OR r.monto <= 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
    VALUES (v_pago.empresa_id, p_pago_id, r.cargo_id, r.monto);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_pago.empresa_id, auth.uid(), 'cxc_pago_reaplicado', 'erp.cxc_pagos', p_pago_id,
    jsonb_build_object('aplicaciones', p_aplicaciones));

  RETURN v_count;
END;
$$;

-- ─── 4. cxc_pago_cancelar (soft-delete + revierte aplicaciones) ───────

CREATE OR REPLACE FUNCTION erp.cxc_pago_cancelar(
  p_pago_id uuid,
  p_motivo text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM erp.cxc_pagos WHERE id = p_pago_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono % no existe o ya está cancelado', p_pago_id;
  END IF;

  -- Revierte las aplicaciones (el trigger recalcula saldos de los cargos).
  DELETE FROM erp.cxc_pago_aplicaciones WHERE pago_id = p_pago_id;

  UPDATE erp.cxc_pagos
     SET deleted_at = now(),
         notas = COALESCE(notas || ' | ', '') || 'Cancelado: ' || COALESCE(p_motivo, 's/motivo'),
         updated_at = now()
   WHERE id = p_pago_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_empresa_id, auth.uid(), 'cxc_pago_cancelado', 'erp.cxc_pagos', p_pago_id,
    jsonb_build_object('motivo', p_motivo));
END;
$$;

-- ─── 5. cxc_cargo_ajustar (descuento / condonación) ───────────────────

CREATE OR REPLACE FUNCTION erp.cxc_cargo_ajustar(
  p_cargo_id uuid,
  p_nuevo_monto numeric,
  p_motivo text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxc_cargos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxc_cargos WHERE id = p_cargo_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo % no existe o está borrado', p_cargo_id;
  END IF;
  IF p_nuevo_monto IS NULL OR p_nuevo_monto < 0 THEN
    RAISE EXCEPTION 'El nuevo monto debe ser >= 0';
  END IF;
  IF p_nuevo_monto < v.monto_pagado THEN
    RAISE EXCEPTION 'El nuevo monto (%) no puede ser menor a lo ya pagado (%)', p_nuevo_monto, v.monto_pagado;
  END IF;

  UPDATE erp.cxc_cargos
     SET monto = p_nuevo_monto,
         estado = CASE
           WHEN estado = 'cancelado' THEN 'cancelado'
           WHEN monto_pagado <= 0 THEN 'pendiente'
           WHEN monto_pagado >= p_nuevo_monto THEN 'liquidado'
           ELSE 'parcial'
         END,
         notas = COALESCE(notas || ' | ', '') || 'Ajuste: ' || COALESCE(p_motivo, 's/motivo'),
         updated_at = now()
   WHERE id = p_cargo_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxc_cargo_ajustado', 'erp.cxc_cargos', p_cargo_id,
    jsonb_build_object('monto', v.monto), jsonb_build_object('monto', p_nuevo_monto, 'motivo', p_motivo));
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
