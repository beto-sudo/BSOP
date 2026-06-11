-- ╭─ 20260611032126_cxc_liquidacion_historica_saldos ─╮
-- Liquidación histórica de saldos CxC DILESA (data-only, sin DDL).
--
-- Contexto: la captura de pagos en Coda "Depositos Clientes" inició el
-- 2024-01-30; todo lo cobrado antes (y buena parte del pago institucional
-- posterior) nunca se registró, dejando $721.7M de saldo abierto ficticio
-- en 879 ventas ya cerradas o desasignadas. Radiografía completa en
-- docs/planning/cxc.md (bitácora 2026-06-10) y CSV de revisión
-- cxc_saldos_revision_2026-06-10.csv aprobado por Beto en chat
-- ("Hay que borrar los 3 bloques y dejar solo lo que esta en proceso").
--
-- Reglas aplicadas (por bucket del CSV):
--   1. desasignada (53 ventas, $45,690,036): cancelar cargos abiertos —
--      el comprador no continuó; verificado que ninguna unidad tiene otra
--      venta activa (el adeudo no es transferible a nadie en el sistema).
--   2. cerrada_pre_coda (646 ventas, $516,223,281) y
--   3. cerrada_era_coda (180 ventas, $159,810,041): abono sintético por
--      fuente (institución/cliente) por el saldo exacto, fecha =
--      fecha_escritura (sentinela 2023-12-31 si NULL), referencia
--      'LIQ-HIST', sin movimiento bancario. La casa entregada = cobrada.
--   4. en_proceso (69 ventas, $79,722,814): intacto — cartera real.
--
-- Self-verificante: aborta (rollback completo) si los conteos/sumas no
-- cuadran con lo aprobado. Idempotente: re-ejecutar no duplica (marcador
-- referencia='LIQ-HIST' + cargos ya cancelados/liquidados salen del set).
-- En Supabase Preview (DB sin datos) es no-op y no truena.

BEGIN;

DO $$
DECLARE
  v_total_ventas bigint;
  v_n bigint;
  v_sum numeric;
  v_pagos_ins bigint := 0;
  v_aplic_ins bigint := 0;
  v_cargos_cancelados bigint := 0;
  v_restante_ventas bigint;
  v_restante_saldo numeric;
BEGIN
  -- Set congelado de trabajo: ventas DILESA con saldo abierto, clasificadas
  -- con la MISMA regla del CSV aprobado.
  CREATE TEMP TABLE tmp_liq ON COMMIT DROP AS
  SELECT
    v.id AS venta_id,
    v.empresa_id,
    v.persona_id,
    coalesce(v.fecha_escritura, DATE '2023-12-31') AS fecha_abono,
    CASE
      WHEN v.estado = 'desasignada' THEN 'desasignada'
      WHEN v.fase_actual IN ('Entregada','Inscrita','Comision Pagada','Facturada','Detonada','Escriturada')
           AND (v.fecha_escritura IS NULL OR v.fecha_escritura < DATE '2024-02-01') THEN 'cerrada_pre_coda'
      WHEN v.fase_actual IN ('Entregada','Inscrita','Comision Pagada','Facturada','Detonada','Escriturada') THEN 'cerrada_era_coda'
      ELSE 'en_proceso'
    END AS bucket,
    sum(c.saldo) FILTER (WHERE c.fuente_esperada = 'institucion') AS saldo_inst,
    sum(c.saldo) FILTER (WHERE c.fuente_esperada = 'cliente') AS saldo_cli,
    sum(c.saldo) AS saldo
  FROM erp.cxc_cargos c
  JOIN dilesa.ventas v ON v.id = c.origen_id
  WHERE c.origen_tipo = 'venta_dilesa'
    AND c.deleted_at IS NULL
    AND c.estado <> 'cancelado'
    AND c.saldo > 0
  GROUP BY v.id, v.empresa_id, v.persona_id, v.fecha_escritura, v.estado, v.fase_actual;

  SELECT count(*) INTO v_total_ventas FROM tmp_liq;

  -- DB vacía (Supabase Preview) o ya liquidada: no-op silencioso.
  IF v_total_ventas = 0 THEN
    RAISE NOTICE 'cxc_liquidacion_historica: sin ventas con saldo abierto — no-op.';
    RETURN;
  END IF;

  -- ── Verificación contra lo aprobado (CSV 2026-06-10) ──────────────────
  -- Tolerancia $10 por redondeo de centavos en los agregados reportados.
  SELECT count(*), coalesce(sum(saldo), 0) INTO v_n, v_sum FROM tmp_liq WHERE bucket = 'desasignada';
  IF v_n <> 53 OR abs(v_sum - 45690036) > 10 THEN
    RAISE EXCEPTION 'Bucket desasignada no cuadra con lo aprobado: % ventas, saldo % (esperado 53 / 45690036). Abortando.', v_n, v_sum;
  END IF;

  SELECT count(*), coalesce(sum(saldo), 0) INTO v_n, v_sum FROM tmp_liq WHERE bucket = 'cerrada_pre_coda';
  IF v_n <> 646 OR abs(v_sum - 516223281) > 10 THEN
    RAISE EXCEPTION 'Bucket cerrada_pre_coda no cuadra con lo aprobado: % ventas, saldo % (esperado 646 / 516223281). Abortando.', v_n, v_sum;
  END IF;

  SELECT count(*), coalesce(sum(saldo), 0) INTO v_n, v_sum FROM tmp_liq WHERE bucket = 'cerrada_era_coda';
  IF v_n <> 180 OR abs(v_sum - 159810041) > 10 THEN
    RAISE EXCEPTION 'Bucket cerrada_era_coda no cuadra con lo aprobado: % ventas, saldo % (esperado 180 / 159810041). Abortando.', v_n, v_sum;
  END IF;

  -- ── Bloque 1: desasignadas → cancelar cargos abiertos ─────────────────
  WITH upd AS (
    UPDATE erp.cxc_cargos c
    SET estado = 'cancelado',
        notas = coalesce(c.notas || E'\n', '')
          || 'Cancelado por liquidación histórica 2026-06-10: venta desasignada, plan de pagos no cancelado al desasignar. Aprobado por Beto en chat.',
        updated_at = now()
    FROM tmp_liq t
    WHERE t.venta_id = c.origen_id
      AND t.bucket = 'desasignada'
      AND c.origen_tipo = 'venta_dilesa'
      AND c.deleted_at IS NULL
      AND c.estado <> 'cancelado'
      AND c.saldo > 0
    RETURNING c.id
  )
  SELECT count(*) INTO v_cargos_cancelados FROM upd;

  -- ── Bloques 2 y 3: abono sintético por venta × fuente ─────────────────
  -- Un pago por cada (venta, fuente) con saldo > 0. Idempotencia: si ya
  -- existe un LIQ-HIST para esa venta+fuente, se omite.
  WITH fuentes AS (
    SELECT t.venta_id, t.empresa_id, t.persona_id, t.fecha_abono, t.bucket,
           f.fuente, f.monto
    FROM tmp_liq t
    CROSS JOIN LATERAL (VALUES
      ('institucion', t.saldo_inst),
      ('cliente', t.saldo_cli)
    ) AS f (fuente, monto)
    WHERE t.bucket IN ('cerrada_pre_coda', 'cerrada_era_coda')
      AND f.monto > 0
  ), ins AS (
    INSERT INTO erp.cxc_pagos
      (empresa_id, persona_id, fecha, monto_total, fuente, forma_pago,
       referencia, notas, origen_tipo, origen_id)
    SELECT
      fu.empresa_id, fu.persona_id, fu.fecha_abono, fu.monto, fu.fuente, NULL,
      'LIQ-HIST',
      'Liquidación histórica aprobada por Beto (chat 2026-06-10): venta cerrada sin abonos capturados — la captura de pagos en Coda inició 2024-01-30. Bucket: ' || fu.bucket || '.',
      'venta_dilesa', fu.venta_id
    FROM fuentes fu
    WHERE NOT EXISTS (
      SELECT 1 FROM erp.cxc_pagos p
      WHERE p.origen_tipo = 'venta_dilesa' AND p.origen_id = fu.venta_id
        AND p.fuente = fu.fuente AND p.referencia = 'LIQ-HIST'
        AND p.deleted_at IS NULL
    )
    RETURNING id
  )
  SELECT count(*) INTO v_pagos_ins FROM ins;

  -- Aplicar cada pago LIQ-HIST a los cargos abiertos de su venta y fuente,
  -- cargo por cargo por su saldo exacto (Σ aplicaciones = monto del pago).
  -- El trigger trg_cxc_recalc_cargo_saldo liquida cada cargo.
  WITH aplic AS (
    INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
    SELECT c.empresa_id, p.id, c.id, c.saldo
    FROM erp.cxc_pagos p
    JOIN tmp_liq t ON t.venta_id = p.origen_id
      AND t.bucket IN ('cerrada_pre_coda', 'cerrada_era_coda')
    JOIN erp.cxc_cargos c ON c.origen_id = p.origen_id
      AND c.origen_tipo = 'venta_dilesa'
      AND c.fuente_esperada = p.fuente
      AND c.deleted_at IS NULL
      AND c.estado <> 'cancelado'
      AND c.saldo > 0
    WHERE p.origen_tipo = 'venta_dilesa'
      AND p.referencia = 'LIQ-HIST'
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM erp.cxc_pago_aplicaciones a
        WHERE a.pago_id = p.id AND a.cargo_id = c.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_aplic_ins FROM aplic;

  -- ── Verificación final: solo queda la cartera en proceso ──────────────
  SELECT count(DISTINCT c.origen_id), coalesce(sum(c.saldo), 0)
  INTO v_restante_ventas, v_restante_saldo
  FROM erp.cxc_cargos c
  WHERE c.origen_tipo = 'venta_dilesa'
    AND c.deleted_at IS NULL
    AND c.estado <> 'cancelado'
    AND c.saldo > 0;

  IF v_restante_ventas <> 69 OR abs(v_restante_saldo - 79722814) > 10 THEN
    RAISE EXCEPTION 'Estado final no cuadra: % ventas con saldo abierto por % (esperado 69 / 79722814). Abortando (rollback).', v_restante_ventas, v_restante_saldo;
  END IF;

  RAISE NOTICE 'cxc_liquidacion_historica OK: % cargos cancelados (desasignadas), % pagos LIQ-HIST, % aplicaciones; queda en proceso: % ventas, $%.',
    v_cargos_cancelados, v_pagos_ins, v_aplic_ins, v_restante_ventas, v_restante_saldo;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
