-- Limpieza de saldos a favor heredados de Coda en CxC (data-only).
--
-- Contexto: el import de "Depositos Clientes" de Coda trajo depósitos
-- capturados por ENCIMA de lo que el cargo de la venta realmente necesitaba
-- (Infonavit/Fovissste dispone exactamente el crédito, no sobrepaga; el
-- excedente es ruido de captura de Coda). El backfill FIFO los dejó como
-- "saldo a favor" en el estado de cuenta / aging, pese a que el adeudo ya
-- está 100% liquidado y la venta cerrada.
--
-- Radiografía a prod 2026-06-28 (read-only, congelada para esta migración):
--   186 pagos / 185 ventas / $2,015,311.81 de saldo a favor, TODAS en
--   estado='terminada', TODAS de origen Coda (coda_row_id IS NOT NULL):
--     · institución: $1,941,717.40 (179 ventas) — artefacto claro.
--     · cliente:        $73,594.41   (6 ventas).
--   Ninguna es cartera en proceso. Mismo espíritu que el LIQ-HIST aprobado
--   (20260611032126): limpiar el ruido histórico de Coda, no tocar lo vivo.
--
-- EXCLUIDOS a propósito (NO entran en esta limpieza masiva):
--   · 3 pagos nativos BSOP ($64,341.01, incl. Nancy Villarreal $33,076) —
--     captura reciente en BSOP, van a conciliación individual.
--   · pagos sintéticos LIQ-HIST (aplicados 1:1, sin saldo a favor).
--   · cualquier venta no 'terminada' (cartera viva).
--
-- Regla aprobada por Beto en chat (2026-06-28): "Corregir como artefacto
-- (todo)" — reducir cada abono de Coda a lo realmente aplicado, de modo que
-- el saldo a favor quede en $0. NO se mueve dinero (no es CFDI ni movimiento
-- bancario): se corrige el monto sobre-capturado del depósito. El monto
-- original queda en core.audit_log y en notas para trazabilidad/reversión.
--
-- Mecánica: por cada pago del set, monto_total := Σ aplicaciones. No toca
-- cxc_pago_aplicaciones ni cxc_cargos → ningún trigger de saldo se dispara
-- (el cargo ya está liquidado por sus aplicaciones, que no cambian). El
-- trigger trg_comprobante_cxc_actualizado es AFTER UPDATE OF
-- comprobante_adjunto_id → no se dispara (solo tocamos monto_total/notas).
--
-- Self-verificante (aborta con rollback si el set no cuadra con lo aprobado),
-- idempotente (re-corrida encuentra set vacío → no-op) y no-op en Supabase
-- Preview (sin datos). Timestamp con `npm run db:new` (anti-colisión).

BEGIN;

DO $$
DECLARE
  v_pagos bigint;
  v_ventas bigint;
  v_sobrepago numeric;
  v_actualizados bigint := 0;
  v_residual bigint;
BEGIN
  -- ── Set objetivo congelado: saldo a favor de Coda en ventas terminada ──
  CREATE TEMP TABLE tmp_limpieza ON COMMIT DROP AS
  SELECT pg.id AS pago_id,
         pg.empresa_id,
         pg.origen_id AS venta_id,
         pg.fuente,
         pg.monto_total AS monto_original,
         COALESCE((SELECT SUM(a.monto_aplicado)
                   FROM erp.cxc_pago_aplicaciones a
                   WHERE a.pago_id = pg.id), 0) AS aplicado
  FROM erp.cxc_pagos pg
  JOIN dilesa.ventas v ON v.id = pg.origen_id
  WHERE pg.deleted_at IS NULL
    AND pg.origen_tipo = 'venta_dilesa'
    AND pg.coda_row_id IS NOT NULL
    AND pg.referencia IS DISTINCT FROM 'LIQ-HIST'
    AND v.estado = 'terminada';

  -- Solo los que tienen saldo a favor real (monto > aplicado).
  DELETE FROM tmp_limpieza WHERE (monto_original - aplicado) <= 0.01;

  SELECT count(*), count(DISTINCT venta_id), coalesce(sum(monto_original - aplicado), 0)
  INTO v_pagos, v_ventas, v_sobrepago
  FROM tmp_limpieza;

  -- Preview vacío o limpieza ya aplicada: no-op silencioso.
  IF v_pagos = 0 THEN
    RAISE NOTICE 'cxc_limpieza_saldos_favor: sin saldos a favor de Coda en ventas terminada — no-op.';
    RETURN;
  END IF;

  -- ── Verificación contra el set aprobado (prod 2026-06-28) ──────────────
  IF v_pagos <> 186 OR v_ventas <> 185 OR abs(v_sobrepago - 2015311.81) > 1 THEN
    RAISE EXCEPTION 'Set a limpiar no cuadra con lo aprobado: % pagos / % ventas / $% (esperado 186 / 185 / 2015311.81). Abortando (rollback).',
      v_pagos, v_ventas, v_sobrepago;
  END IF;

  -- ── 1. Rastro en core.audit_log (monto anterior → nuevo) ───────────────
  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  SELECT t.empresa_id, NULL, 'cxc_limpieza_saldo_favor', 'cxc_pagos', t.pago_id,
         jsonb_build_object('monto_total', t.monto_original, 'fuente', t.fuente, 'saldo_a_favor', round(t.monto_original - t.aplicado, 2)),
         jsonb_build_object('monto_total', t.aplicado, 'motivo', 'sobre-captura Coda en venta terminada — aprobado por Beto 2026-06-28')
  FROM tmp_limpieza t;

  -- ── 2. Reducir el abono a lo realmente aplicado (saldo a favor → 0) ────
  WITH upd AS (
    UPDATE erp.cxc_pagos p
    SET monto_total = t.aplicado,
        notas = coalesce(p.notas || E'\n', '')
          || 'Saldo a favor limpiado 2026-06-28: depósito Coda sobre-capturado en venta terminada (monto original $'
          || to_char(t.monto_original, 'FM999G999G990D00') || ', aplicado $'
          || to_char(t.aplicado, 'FM999G999G990D00') || '). No es movimiento de dinero — corrección de captura. Aprobado por Beto en chat.',
        updated_at = now()
    FROM tmp_limpieza t
    WHERE p.id = t.pago_id
    RETURNING p.id
  )
  SELECT count(*) INTO v_actualizados FROM upd;

  -- ── Verificación final: 0 saldos a favor de Coda/terminada restantes ───
  SELECT count(*) INTO v_residual
  FROM erp.cxc_pagos pg
  JOIN dilesa.ventas v ON v.id = pg.origen_id
  WHERE pg.deleted_at IS NULL
    AND pg.origen_tipo = 'venta_dilesa'
    AND pg.coda_row_id IS NOT NULL
    AND pg.referencia IS DISTINCT FROM 'LIQ-HIST'
    AND v.estado = 'terminada'
    AND (pg.monto_total - COALESCE((SELECT SUM(a.monto_aplicado)
         FROM erp.cxc_pago_aplicaciones a WHERE a.pago_id = pg.id), 0)) > 0.01;

  IF v_residual > 0 THEN
    RAISE EXCEPTION 'Quedaron % pagos Coda/terminada con saldo a favor tras la limpieza. Abortando (rollback).', v_residual;
  END IF;

  IF v_actualizados <> v_pagos THEN
    RAISE EXCEPTION 'Actualizados (%) != set objetivo (%). Abortando (rollback).', v_actualizados, v_pagos;
  END IF;

  RAISE NOTICE 'cxc_limpieza_saldos_favor OK: % pagos en % ventas, $% de saldo a favor de Coda corregido a $0 (sin movimiento de dinero).',
    v_pagos, v_ventas, v_sobrepago;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
