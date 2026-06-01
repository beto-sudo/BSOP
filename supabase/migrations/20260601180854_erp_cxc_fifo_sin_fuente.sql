-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601180854_erp_cxc_fifo_sin_fuente                            │
-- │                                                                    │
-- │  Fix de cálculo CxC: el FIFO ya NO separa por fuente.             │
-- │                                                                    │
-- │  Antes, un abono de fuente='cliente' solo podía aplicar a cargos   │
-- │  fuente_esperada='cliente' (y análogo institución). Eso producía   │
-- │  el absurdo de saldo pendiente grande + saldo a favor grande       │
-- │  coexistiendo (los depósitos del cliente liquidaban el enganche    │
-- │  chico y el resto quedaba "a favor", mientras la disposición       │
-- │  institucional quedaba pendiente sin que ningún abono la tocara).  │
-- │                                                                    │
-- │  Ahora: un abono baja el SALDO TOTAL de la venta, aplicándose a    │
-- │  los cargos abiertos por orden de vencimiento, sin importar la     │
-- │  fuente. `fuente`/`fuente_esperada` quedan SOLO como etiqueta para │
-- │  cobranza activa y reportería, nunca como barrera del cálculo.     │
-- │                                                                    │
-- │  Redefine erp.cxc_pago_registrar (captura en vivo) y               │
-- │  dilesa.fn_backfill_cxc (re-ejecutable). El re-backfill se corre   │
-- │  como paso operativo tras aplicar. Ver docs/planning/cxc.md.       │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── cxc_pago_registrar — FIFO sin fuente ─────────────────────────────

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

  -- Auto-aplicación FIFO a TODOS los cargos abiertos de la venta, del más
  -- viejo al más nuevo. La fuente NO filtra (es solo etiqueta). Lo que
  -- sobra después de cubrir todos los cargos = saldo a favor real.
  IF p_auto_aplicar THEN
    v_restante := p_monto;
    FOR c IN
      SELECT id, saldo
        FROM erp.cxc_cargos
       WHERE origen_tipo = 'venta_dilesa'
         AND origen_id = p_origen_id
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
  'Registra un abono ligado a una venta y lo auto-aplica FIFO a TODOS los cargos abiertos de esa venta (la fuente no filtra, es solo etiqueta). Emite movimiento bancario si hay cuenta. Lo no aplicado = saldo a favor real.';

-- ─── fn_backfill_cxc — FIFO sin fuente ────────────────────────────────

CREATE OR REPLACE FUNCTION dilesa.fn_backfill_cxc()
  RETURNS TABLE(metrica text, valor bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = dilesa, erp, public
AS $fn$
DECLARE
  v_venta uuid;
  vp record;
  v_pago_id uuid;
  v_fuente text;
  v_restante numeric(14, 2);
  v_aplicar numeric(14, 2);
  c record;
  n_planes bigint := 0;
  n_skip_plan bigint := 0;
  n_pagos bigint := 0;
  n_aplic bigint := 0;
BEGIN
  -- ── 1. Generar planes para ventas relevantes ──────────────────────
  FOR v_venta IN
    SELECT ve.id
      FROM dilesa.ventas ve
     WHERE ve.deleted_at IS NULL
       AND ve.valor_escrituracion IS NOT NULL
       AND (
         ve.estado = 'activa'
         OR EXISTS (SELECT 1 FROM dilesa.venta_pagos pp
                     WHERE pp.venta_id = ve.id AND pp.deleted_at IS NULL)
       )
  LOOP
    BEGIN
      PERFORM dilesa.fn_generar_plan_pagos(v_venta);
      n_planes := n_planes + 1;
    EXCEPTION WHEN OTHERS THEN
      n_skip_plan := n_skip_plan + 1;
    END;
  END LOOP;

  -- ── 2 + 3. Migrar abonos + aplicar FIFO (sin separar por fuente) ───
  FOR vp IN
    SELECT pp.id, pp.venta_id, pp.fecha, pp.monto, pp.tipo, pp.notas, pp.coda_row_id,
           ve.empresa_id, ve.persona_id, ve.valor_escrituracion
      FROM dilesa.venta_pagos pp
      JOIN dilesa.ventas ve ON ve.id = pp.venta_id
     WHERE pp.deleted_at IS NULL
       AND ve.deleted_at IS NULL
       AND ve.valor_escrituracion IS NOT NULL
     ORDER BY pp.venta_id, pp.fecha ASC NULLS LAST, pp.created_at ASC
  LOOP
    IF vp.coda_row_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM erp.cxc_pagos WHERE coda_row_id = vp.coda_row_id) THEN
      CONTINUE;
    END IF;

    IF vp.monto IS NULL OR vp.monto <= 0 THEN
      CONTINUE;
    END IF;

    -- La fuente queda como etiqueta (cobranza/reportería), no filtra.
    v_fuente := CASE
      WHEN vp.tipo IN ('Pago Infonavit', 'Pago Fovissste', 'Pago Banco') THEN 'institucion'
      WHEN vp.tipo IN ('Deposito Directo Cliente', 'Abono a Pagare') THEN 'cliente'
      WHEN vp.tipo IS NULL AND vp.monto >= COALESCE(vp.valor_escrituracion, 1e12) * 0.4 THEN 'institucion'
      ELSE 'cliente'
    END;

    INSERT INTO erp.cxc_pagos (
      empresa_id, persona_id, origen_tipo, origen_id, fecha, monto_total,
      fuente, forma_pago, notas, coda_row_id
    ) VALUES (
      vp.empresa_id, vp.persona_id, 'venta_dilesa', vp.venta_id,
      COALESCE(vp.fecha, CURRENT_DATE), vp.monto, v_fuente, NULL,
      NULLIF(trim(COALESCE(vp.tipo, '') || COALESCE(' — ' || vp.notas, '')), ''), vp.coda_row_id
    ) RETURNING id INTO v_pago_id;
    n_pagos := n_pagos + 1;

    -- FIFO a TODOS los cargos abiertos de la venta, por vencimiento.
    v_restante := vp.monto;
    FOR c IN
      SELECT id, saldo FROM erp.cxc_cargos
       WHERE origen_tipo = 'venta_dilesa' AND origen_id = vp.venta_id
         AND estado <> 'cancelado' AND deleted_at IS NULL AND saldo > 0
       ORDER BY fecha_vencimiento ASC NULLS LAST, numero ASC
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, c.saldo);
      INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
      VALUES (vp.empresa_id, v_pago_id, c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
      n_aplic := n_aplic + 1;
    END LOOP;
  END LOOP;

  metrica := 'planes_generados'; valor := n_planes; RETURN NEXT;
  metrica := 'planes_omitidos'; valor := n_skip_plan; RETURN NEXT;
  metrica := 'pagos_migrados'; valor := n_pagos; RETURN NEXT;
  metrica := 'aplicaciones'; valor := n_aplic; RETURN NEXT;
END;
$fn$;

NOTIFY pgrst, 'reload schema';

COMMIT;
