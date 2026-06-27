-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260627211027_erp_cxc_arrendamiento_origen_y_rpc                  │
-- │                                                                    │
-- │  Iniciativa `arrendamiento` — Sprint 1b (FINANCIERO, gate D5).     │
-- │  Extiende erp.cxc para que la renta sea OTRO originador del         │
-- │  subledger, SIN reabrir la RPC viva de ventas (940+ ventas):       │
-- │    1. CHECK aditivo: origen_tipo += 'arrendamiento';               │
-- │       tipo_cargo += 'renta','deposito','penalizacion'.            │
-- │    2. cxc_cargos.periodo (yyyymm) + UNIQUE parcial → idempotencia   │
-- │       del cron mensual y aplicación DIRIGIDA al periodo.           │
-- │    3. RPC NUEVA erp.arrendamiento_pago_registrar (dirigida al       │
-- │       periodo, no FIFO ciego). cxc_pago_registrar queda intacta.   │
-- │                                                                    │
-- │  Ver docs/planning/arrendamiento.md + ADR-052 + ADR-037.          │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. CHECK aditivos (no quita valores existentes → no rompe ventas)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE erp.cxc_cargos DROP CONSTRAINT IF EXISTS cxc_cargos_origen_tipo_check;
ALTER TABLE erp.cxc_cargos ADD CONSTRAINT cxc_cargos_origen_tipo_check
  CHECK (origen_tipo IN ('venta_dilesa', 'manual', 'otro', 'arrendamiento'));

ALTER TABLE erp.cxc_cargos DROP CONSTRAINT IF EXISTS cxc_cargos_tipo_cargo_check;
ALTER TABLE erp.cxc_cargos ADD CONSTRAINT cxc_cargos_tipo_cargo_check
  CHECK (tipo_cargo IN ('enganche', 'mensualidad', 'credito', 'contado', 'otro', 'renta', 'deposito', 'penalizacion'));

-- ─────────────────────────────────────────────────────────────────────
-- 2. Periodo del cargo de renta (yyyymm). Nullable → no afecta ventas.
--    UNIQUE parcial SOLO para arrendamiento: el cron mensual hace
--    ON CONFLICT DO NOTHING y nunca duplica el cargo de un (contrato, mes),
--    aunque se dispare dos veces (DST Matamoros, reintentos).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE erp.cxc_cargos ADD COLUMN IF NOT EXISTS periodo text;
COMMENT ON COLUMN erp.cxc_cargos.periodo IS
  'Periodo yyyymm del cargo de renta (solo origen_tipo=arrendamiento). Gobierna idempotencia del cron y la aplicación dirigida del pago. NULL para ventas.';

CREATE UNIQUE INDEX IF NOT EXISTS cxc_cargos_arrendamiento_periodo_uk
  ON erp.cxc_cargos (origen_id, periodo)
  WHERE origen_tipo = 'arrendamiento' AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC dedicada de pago de renta. Clona el patrón de
--    erp.cxc_pago_registrar (pago + aplicación + movimiento bancario +
--    audit) pero (a) etiqueta origen_tipo='arrendamiento' — JAMÁS
--    'venta_dilesa', así fn_detonar_venta_desde_cxc no se dispara — y
--    (b) aplica DIRIGIDO al periodo cuando se especifica (no FIFO ciego,
--    que en renta mis-aplica el pago del mes corriente al mes vencido).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION erp.arrendamiento_pago_registrar(
  p_empresa_id uuid,
  p_persona_id uuid,
  p_arrendamiento_id uuid,
  p_monto numeric,
  p_periodo text DEFAULT NULL,
  p_fecha date DEFAULT CURRENT_DATE,
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
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v_pago_id uuid;
  v_restante numeric(14, 2);
  v_aplicar numeric(14, 2);
  c record;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono de renta debe ser > 0';
  END IF;

  INSERT INTO erp.cxc_pagos (
    empresa_id, persona_id, origen_tipo, origen_id, fecha, monto_total,
    fuente, forma_pago, referencia, cuenta_bancaria_id, uuid_sat,
    comprobante_adjunto_id, notas
  ) VALUES (
    p_empresa_id, p_persona_id, 'arrendamiento', p_arrendamiento_id, p_fecha, p_monto,
    'cliente', p_forma_pago, p_referencia, p_cuenta_bancaria_id, p_uuid_sat,
    p_comprobante_adjunto_id, p_notas
  ) RETURNING id INTO v_pago_id;

  -- Aplicación DIRIGIDA: si viene el periodo, salda solo el cargo de ese
  -- mes; si no, FIFO entre los cargos de renta de ESTE contrato (nunca
  -- toca cargos de venta — el filtro es origen_tipo='arrendamiento').
  IF p_auto_aplicar THEN
    v_restante := p_monto;
    FOR c IN
      SELECT id, saldo
        FROM erp.cxc_cargos
       WHERE origen_tipo = 'arrendamiento'
         AND origen_id = p_arrendamiento_id
         AND (p_periodo IS NULL OR periodo = p_periodo)
         AND estado <> 'cancelado'
         AND deleted_at IS NULL
         AND saldo > 0
       ORDER BY fecha_vencimiento ASC NULLS LAST, periodo ASC
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, c.saldo);
      INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
      VALUES (p_empresa_id, v_pago_id, c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
    END LOOP;
  END IF;

  -- Movimiento bancario (gancho de tesorería, ADR-037 D4). tipo='abono'.
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      p_empresa_id, p_cuenta_bancaria_id, 'abono', p_monto, p_fecha,
      'Abono renta', p_referencia, 'cxc_pago', v_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'arrendamiento_pago_registrado', 'erp.cxc_pagos', v_pago_id,
    jsonb_build_object('monto', p_monto, 'periodo', p_periodo, 'arrendamiento_id', p_arrendamiento_id,
      'auto_aplicar', p_auto_aplicar, 'uuid_sat', p_uuid_sat));

  RETURN v_pago_id;
END;
$function$;

-- Control de acceso: solo usuarios autenticados (NUNCA anon — es RPC
-- financiera SECURITY DEFINER; ver project_erp_rls_empresa_isolation).
REVOKE ALL ON FUNCTION erp.arrendamiento_pago_registrar(uuid, uuid, uuid, numeric, text, date, text, text, uuid, text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.arrendamiento_pago_registrar(uuid, uuid, uuid, numeric, text, date, text, text, uuid, text, uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION erp.arrendamiento_pago_registrar(uuid, uuid, uuid, numeric, text, date, text, text, uuid, text, uuid, text, boolean) IS
  'Registra un abono de renta en el subledger CxC (origen_tipo=arrendamiento). Aplicación dirigida al periodo (o FIFO entre cargos de renta del contrato). NO toca la cobranza de ventas. Iniciativa arrendamiento S1b.';

NOTIFY pgrst, 'reload schema';

COMMIT;
