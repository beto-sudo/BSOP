-- Reversión parcial de la liquidación histórica de CxC (data-only).
--
-- Contexto: 20260611032126_cxc_liquidacion_historica_saldos.sql clasificó
-- "cerrada" por fase (Escriturada/Detonada/Facturada/Inscrita/Entregada/
-- Comision Pagada) SIN piso de fecha hacia el presente. Ventas que
-- escrituraron en mar–jun 2026 siguen en cobranza activa (el pago
-- institucional llega semanas después de la escritura; los residuos de
-- cliente se cobran al final) y aun así recibieron abono sintético
-- LIQ-HIST — caso detectado por Beto: Josue Daniel Cruz Valverde
-- (M10-L23-LDLE-ISC), abono fantasma de $1,622 el 2026-05-12.
--
-- Regla (pendiente de OK de Beto en chat antes de aplicar): revertir los
-- pagos LIQ-HIST de ventas con fecha_escritura >= 2026-03-01 y monto > 0.
-- Set verificado a prod el 2026-06-11: 31 ventas / 44 pagos /
-- $10,485,164.71 ($9.86M de ellos en escrituras may–jun). Sus saldos
-- vuelven a quedar abiertos como cartera viva en el aging.
--
-- Mecánica: DELETE de las aplicaciones (el trigger
-- trg_cxc_recalc_cargo_saldo recalcula monto_pagado/estado de cada cargo)
-- + soft-delete del pago con nota de reversión. Sin tocar movimientos
-- bancarios (LIQ-HIST nunca los emitió) ni adjuntos (no tiene).
--
-- Self-verificante (aborta con rollback si el set no cuadra con lo
-- aprobado), idempotente (la re-corrida encuentra set vacío → no-op) y
-- no-op en Supabase Preview (sin datos).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

DO $$
DECLARE
  v_pagos bigint;
  v_ventas bigint;
  v_monto numeric;
  v_aplic_borradas bigint := 0;
  v_monto_aplic numeric := 0;
  v_huerfanas bigint;
BEGIN
  -- Set objetivo congelado: LIQ-HIST vivos de ventas en flujo reciente.
  CREATE TEMP TABLE tmp_revert ON COMMIT DROP AS
  SELECT p.id AS pago_id, p.origen_id AS venta_id, p.monto_total
  FROM erp.cxc_pagos p
  JOIN dilesa.ventas v ON v.id = p.origen_id
  WHERE p.origen_tipo = 'venta_dilesa'
    AND p.referencia = 'LIQ-HIST'
    AND p.deleted_at IS NULL
    AND p.monto_total > 0
    AND v.fecha_escritura >= DATE '2026-03-01';

  SELECT count(*), count(DISTINCT venta_id), coalesce(sum(monto_total), 0)
  INTO v_pagos, v_ventas, v_monto
  FROM tmp_revert;

  -- Preview vacío o reversión ya aplicada: no-op silencioso.
  IF v_pagos = 0 THEN
    RAISE NOTICE 'cxc_revert_liq_hist: sin pagos LIQ-HIST en ventas con escritura >= 2026-03-01 — no-op.';
    RETURN;
  END IF;

  -- ── Verificación contra el set aprobado (prod 2026-06-11) ─────────────
  IF v_pagos <> 44 OR v_ventas <> 31 OR abs(v_monto - 10485164.71) > 1 THEN
    RAISE EXCEPTION 'Set a revertir no cuadra con lo aprobado: % pagos / % ventas / $% (esperado 44 / 31 / 10485164.71). Abortando (rollback).',
      v_pagos, v_ventas, v_monto;
  END IF;

  -- ── 1. Borrar aplicaciones: el trigger reabre el saldo de cada cargo ──
  WITH del AS (
    DELETE FROM erp.cxc_pago_aplicaciones a
    USING tmp_revert t
    WHERE a.pago_id = t.pago_id
    RETURNING a.monto_aplicado
  )
  SELECT count(*), coalesce(sum(monto_aplicado), 0)
  INTO v_aplic_borradas, v_monto_aplic
  FROM del;

  -- La liquidación aplicó cada pago 1:1 completo; lo des-aplicado debe ser
  -- exactamente el monto de los pagos revertidos.
  IF abs(v_monto_aplic - v_monto) > 0.01 THEN
    RAISE EXCEPTION 'Las aplicaciones borradas ($%) no igualan el monto de los pagos revertidos ($%). Abortando (rollback).',
      v_monto_aplic, v_monto;
  END IF;

  -- ── 2. Soft-delete de los pagos sintéticos, con rastro ────────────────
  UPDATE erp.cxc_pagos p
  SET deleted_at = now(),
      notas = coalesce(p.notas || E'\n', '')
        || 'Revertido 2026-06-11: la venta escrituró >= 2026-03-01 y sigue en cobranza activa — el abono sintético tapaba cartera viva (falso positivo del bucket por fase sin piso de fecha). Aprobado por Beto en chat.',
      updated_at = now()
  FROM tmp_revert t
  WHERE p.id = t.pago_id;

  -- ── Verificación final: ninguna aplicación viva apunta a un pago borrado
  SELECT count(*) INTO v_huerfanas
  FROM erp.cxc_pago_aplicaciones a
  JOIN erp.cxc_pagos p ON p.id = a.pago_id
  WHERE p.deleted_at IS NOT NULL;

  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION '% aplicaciones quedaron colgando de pagos soft-deleted. Abortando (rollback).', v_huerfanas;
  END IF;

  RAISE NOTICE 'cxc_revert_liq_hist OK: % pagos LIQ-HIST revertidos en % ventas ($%); % aplicaciones borradas — los saldos vuelven al aging como cartera viva.',
    v_pagos, v_ventas, v_monto, v_aplic_borradas;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
