-- ╭─ 20260617215750_cxc_auto_generar_plan_pagos_venta ─╮
-- Auto-generación del plan de pagos CxC en el ciclo de vida de la VENTA.
--
-- Contexto (chat 2026-06-17, incidente Arizpe Luna): registrar un abono en
-- una venta sin plan de pagos (cero cargos en erp.cxc_cargos) dejaba el pago
-- flotando sin aplicar y la venta clavada en Fase 11. El PR #930 cerró el
-- hueco en UI (bloqueo + "Generar plan" inline + avisos). Pero la generación
-- del plan seguía siendo MANUAL — herencia del cutover de CxC (1-jun): la
-- función `dilesa.fn_generar_plan_pagos` se agregó como botón suelto y nunca
-- se enganchó al ciclo de vida de la venta. Esta migración la engancha.
--
-- Disparador: un trigger AFTER INSERT/UPDATE sobre dilesa.ventas genera el
-- plan cuando la venta está lista, con estas guardas (validadas con datos de
-- prod 2026-06-17):
--   • `valor_escrituracion` (o `precio_asignacion`) > 0  → salta los 112
--     "cascarones vacíos" sin economía (limpieza 2026-06-13) y la venta sin
--     valor que aún no captura precio.
--   • fase 2..11 (Asignada → Escriturada): el precio se congela al asignar
--     (desglose_precio snapshot, PR #900) y paramos antes de Detonada (12)
--     para no crear cargos fantasma en ventas ya cerradas/migradas.
--   • NO hay plan aún (create-once): si ya existen cargos, NO se toca — la
--     regeneración sigue siendo manual (botón) para no churnear ids ni pisar
--     ajustes. fn_generar_plan_pagos de por sí se congela tras el 1er abono.
--   • fail-open: si la función falla (datos borde, carrera), se emite WARNING
--     y el guardado de la venta NUNCA se aborta.
--
-- El enganche/economía ya está capturado desde fase 1-2; enganche_fecha y
-- fecha_escritura nulas las maneja la función (default hoy / vencimiento
-- nulo). El backfill al final genera el plan de las ventas vivas en pipeline
-- que hoy cumplen la regla y no tienen plan.
--
-- Preview-safe: el backfill corre sobre datos vivos; en el branch de Preview
-- (sin datos) es no-op.

BEGIN;

-- ─── 1. Trigger function: auto plan al alistarse la venta ──────────────

CREATE OR REPLACE FUNCTION dilesa.fn_venta_auto_plan_pagos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL
     AND COALESCE(NEW.fase_posicion, 0) BETWEEN 2 AND 11
     AND COALESCE(NEW.valor_escrituracion, NEW.precio_asignacion, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM erp.cxc_cargos c
       WHERE c.origen_tipo = 'venta_dilesa'
         AND c.origen_id = NEW.id
         AND c.deleted_at IS NULL
         AND c.estado <> 'cancelado'
     )
  THEN
    BEGIN
      PERFORM dilesa.fn_generar_plan_pagos(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Nunca abortar el guardado de la venta por un fallo del plan.
      RAISE WARNING 'fn_venta_auto_plan_pagos: no se pudo generar el plan (venta %): %',
        NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_venta_auto_plan_pagos() IS
  'Genera el plan de pagos CxC (dilesa.fn_generar_plan_pagos) cuando la venta se alista: fase 2-11, valor > 0 y sin plan previo (create-once). Fail-open: nunca bloquea el guardado de la venta.';

DROP TRIGGER IF EXISTS trg_venta_auto_plan_pagos ON dilesa.ventas;
CREATE TRIGGER trg_venta_auto_plan_pagos
  AFTER INSERT OR UPDATE OF
    fase_posicion, fase_actual, valor_escrituracion, precio_asignacion,
    enganche_requerido, tipo_credito
  ON dilesa.ventas
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_venta_auto_plan_pagos();

-- ─── 2. Backfill: ventas vivas en pipeline sin plan, con datos ─────────
-- Misma regla que el trigger. Idempotente: el NOT EXISTS evita re-generar.
-- Las ventas en fase 1 (Solicitud) se auto-generan al pasar a Asignada.

DO $$
DECLARE
  v_id uuid;
  v_ok integer := 0;
  v_fail integer := 0;
BEGIN
  FOR v_id IN
    SELECT v.id
    FROM dilesa.ventas v
    WHERE v.deleted_at IS NULL
      AND COALESCE(v.fase_posicion, 0) BETWEEN 2 AND 11
      AND COALESCE(v.valor_escrituracion, v.precio_asignacion, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM erp.cxc_cargos c
        WHERE c.origen_tipo = 'venta_dilesa'
          AND c.origen_id = v.id
          AND c.deleted_at IS NULL
          AND c.estado <> 'cancelado'
      )
  LOOP
    BEGIN
      PERFORM dilesa.fn_generar_plan_pagos(v_id);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      RAISE WARNING 'backfill plan_pagos: venta % falló: %', v_id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'backfill plan_pagos: % generados, % fallidos', v_ok, v_fail;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
