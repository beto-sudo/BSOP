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
-- Dos tratamientos según cuánto del depósito sí aplicó a un cargo:
--   · PARCIAL (183 pagos, aplicó > 0): reducir monto_total a lo aplicado →
--     saldo a favor a $0, conservando el abono real que sí liquidó cargos.
--   · FANTASMA (3 pagos, aplicó = 0, $34,757.10): el depósito no liquidó
--     ningún cargo (no había disposición que cubrir). monto_total no puede
--     ir a $0 (CHECK monto_total > 0) y el abono no representa nada → se
--     SOFT-DELETE. No tienen aplicaciones (no quedan huérfanas) ni
--     movimiento bancario (import Coda sin cuenta).
--
-- EXCLUIDOS a propósito (NO entran en esta limpieza masiva):
--   · 3 pagos nativos BSOP ($64,341.01, incl. Nancy Villarreal $33,076) —
--     captura reciente en BSOP, van a conciliación individual.
--   · pagos sintéticos LIQ-HIST (aplicados 1:1, sin saldo a favor).
--   · cualquier venta no 'terminada' (cartera viva).
--
-- Regla aprobada por Beto en chat (2026-06-28): "Corregir como artefacto
-- (todo)" — el saldo a favor de Coda queda en $0. NO se mueve dinero (no es
-- CFDI ni movimiento bancario): se corrige el monto sobre-capturado del
-- depósito. El monto original queda en core.audit_log y en notas.
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
  v_reducidos bigint := 0;
  v_borrados bigint := 0;
  v_residual bigint;
  v_huerfanas bigint;
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

  -- ── 1. Rastro en core.audit_log (monto anterior → acción) ──────────────
  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  SELECT t.empresa_id, NULL, 'cxc_limpieza_saldo_favor', 'cxc_pagos', t.pago_id,
         jsonb_build_object('monto_total', t.monto_original, 'fuente', t.fuente, 'saldo_a_favor', round(t.monto_original - t.aplicado, 2)),
         CASE
           WHEN t.aplicado > 0.01 THEN
             jsonb_build_object('accion', 'reduce', 'monto_total', t.aplicado, 'motivo', 'sobre-captura Coda en venta terminada — aprobado por Beto 2026-06-28')
           ELSE
             jsonb_build_object('accion', 'soft_delete', 'motivo', 'depósito Coda fantasma (no aplicó a ningún cargo) en venta terminada — aprobado por Beto 2026-06-28')
         END
  FROM tmp_limpieza t;

  -- ── 2a. PARCIAL: reducir el abono a lo aplicado (saldo a favor → 0) ────
  WITH upd AS (
    UPDATE erp.cxc_pagos p
    SET monto_total = t.aplicado,
        notas = coalesce(p.notas || E'\n', '')
          || 'Saldo a favor limpiado 2026-06-28: depósito Coda sobre-capturado en venta terminada (monto original $'
          || to_char(t.monto_original, 'FM999G999G990D00') || ', aplicado $'
          || to_char(t.aplicado, 'FM999G999G990D00') || '). No es movimiento de dinero — corrección de captura. Aprobado por Beto en chat.',
        updated_at = now()
    FROM tmp_limpieza t
    WHERE p.id = t.pago_id AND t.aplicado > 0.01
    RETURNING p.id
  )
  SELECT count(*) INTO v_reducidos FROM upd;

  -- ── 2b. FANTASMA: soft-delete (monto_total no puede ir a $0) ───────────
  WITH del AS (
    UPDATE erp.cxc_pagos p
    SET deleted_at = now(),
        notas = coalesce(p.notas || E'\n', '')
          || 'Depósito Coda fantasma eliminado 2026-06-28: $'
          || to_char(t.monto_original, 'FM999G999G990D00')
          || ' que no aplicó a ningún cargo en venta terminada (saldo a favor artefacto). No es movimiento de dinero. Aprobado por Beto en chat.',
        updated_at = now()
    FROM tmp_limpieza t
    WHERE p.id = t.pago_id AND t.aplicado <= 0.01
    RETURNING p.id
  )
  SELECT count(*) INTO v_borrados FROM del;

  -- ── Verificación: ninguna aplicación viva cuelga de un pago soft-deleted
  SELECT count(*) INTO v_huerfanas
  FROM erp.cxc_pago_aplicaciones a
  JOIN erp.cxc_pagos p ON p.id = a.pago_id
  JOIN tmp_limpieza t ON t.pago_id = p.id
  WHERE p.deleted_at IS NOT NULL;

  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION '% aplicaciones quedaron colgando de pagos soft-deleted. Abortando (rollback).', v_huerfanas;
  END IF;

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

  IF (v_reducidos + v_borrados) <> v_pagos THEN
    RAISE EXCEPTION 'Procesados (% reduce + % soft-delete = %) != set objetivo (%). Abortando (rollback).',
      v_reducidos, v_borrados, v_reducidos + v_borrados, v_pagos;
  END IF;

  RAISE NOTICE 'cxc_limpieza_saldos_favor OK: % pagos / % ventas, $% de saldo a favor de Coda a $0 (% reducidos + % fantasma eliminados; sin movimiento de dinero).',
    v_pagos, v_ventas, v_sobrepago, v_reducidos, v_borrados;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
