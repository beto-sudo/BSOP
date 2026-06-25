-- ╭─ 20260625210939_fix_detonacion_acumula_abonos_coacreditados ─╮
-- La detonación de coacreditados (Infonavit Unamos, etc.) debe ACUMULAR todos
-- los abonos de institución, no quedarse en el primero (titular).
--
-- Bug: `dilesa.fn_detonar_venta_desde_cxc()` escribía `monto_detonado` con el
-- monto del PRIMER depósito que disparaba la detonación (el del titular). Cuando
-- llegaba el 2º depósito (cotitular) la venta ya estaba en fase >= 12, entraba a
-- la rama "ya detonada", y hacía `monto_detonado = COALESCE(monto_detonado,
-- v_pago.monto_total)`: como ya había un valor, el COALESCE lo dejaba intacto y
-- NUNCA sumaba el cotitular. El motor de cuadratura (`lib/dilesa/cuadratura.ts`)
-- usa `monto_detonado` como la "detonación" del Valor Real Venta DILESA, así que
-- el Valor Real quedaba subvaluado por el monto del cotitular y el descuento
-- real / nota de crédito quedaban inflados por ese mismo monto.
--   Caso detectado 2026-06-25: Aracely Martínez (detonado 656,281.58 vs 940,000;
--   Valor Real 622,901.58 vs 906,620) y Christopher Limas (757,234.86 vs
--   1,021,000). El dinero SÍ estaba completo en Cobranza (los 2 abonos de
--   institución en `erp.cxc_pagos`); sólo el escalar `monto_detonado` estaba mal.
--   Ambos datos ya corregidos a mano; esto cierra la causa raíz para el futuro.
--
-- Fix: `monto_detonado` = suma de TODOS los abonos de institución de la venta
-- (vía la misma cadena pago->aplicacion->cargo que el trigger ya usa para
-- identificar la venta). El trigger es AFTER INSERT en
-- `erp.cxc_pago_aplicaciones`, así que la fila recién aplicada ya está visible y
-- el total incluye el depósito actual. Idempotente y acumulativo: re-disparos
-- con el mismo total no actualizan (IS DISTINCT FROM); cada nuevo abono de
-- institución re-suma el total correcto, sin importar el orden ni cuántos
-- coacreditados haya. Resto de la función intacto (idempotencia de venta_fases,
-- copia de comprobante, fecha, manejo de excepción).
--
-- Partido de la versión VIVA en prod (pg_get_functiondef 2026-06-25), no de la
-- migración 20260612173513 (que podría haberse sobrescrito después).

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_detonar_venta_desde_cxc()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_pago erp.cxc_pagos%ROWTYPE;
  v_cargo erp.cxc_cargos%ROWTYPE;
  v_venta dilesa.ventas%ROWTYPE;
  v_total_detonado numeric;
BEGIN
  SELECT * INTO v_pago
  FROM erp.cxc_pagos
  WHERE id = NEW.pago_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_pago.fuente <> 'institucion' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cargo
  FROM erp.cxc_cargos
  WHERE id = NEW.cargo_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_cargo.origen_tipo <> 'venta_dilesa' OR v_cargo.origen_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_venta
  FROM dilesa.ventas
  WHERE id = v_cargo.origen_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Total detonado = suma de TODOS los abonos de institución aplicados a esta
  -- venta (titular + cotitular en coacreditados). Vía la cadena
  -- pago->aplicacion->cargo, igual que la identificación de la venta de arriba,
  -- para no depender de `cxc_pagos.origen_id` directo. AFTER INSERT ⇒ NEW ya está
  -- visible y se incluye en la suma. SUM sobre cxc_pagos (no sobre aplicaciones):
  -- un pago aplicado a varios cargos de la misma venta cuenta una sola vez.
  SELECT COALESCE(SUM(pg.monto_total), 0) INTO v_total_detonado
  FROM erp.cxc_pagos pg
  WHERE pg.fuente = 'institucion'
    AND pg.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM erp.cxc_pago_aplicaciones ap
      JOIN erp.cxc_cargos cg ON cg.id = ap.cargo_id AND cg.deleted_at IS NULL
      WHERE ap.pago_id = pg.id
        AND cg.origen_tipo = 'venta_dilesa'
        AND cg.origen_id = v_venta.id
    );

  -- Venta ya detonada (o más allá): ACUMULAR el total detonado (2º depósito de
  -- coacreditados) y copiar el comprobante. Antes un COALESCE dejaba
  -- `monto_detonado` en el 1er depósito y perdía el cotitular.
  IF COALESCE(v_venta.fase_posicion, 0) >= 12 THEN
    UPDATE dilesa.ventas
    SET fecha_detonacion = COALESCE(fecha_detonacion, v_pago.fecha),
        monto_detonado = v_total_detonado,
        updated_at = now()
    WHERE id = v_venta.id
      AND (fecha_detonacion IS NULL OR monto_detonado IS DISTINCT FROM v_total_detonado);
    PERFORM dilesa.fn_copiar_comprobante_detonacion(v_pago.id);
    RETURN NEW;
  END IF;

  -- Solo se detona desde Escriturada (11) — mismo enforcement que la
  -- pantalla F12. Depósitos más tempranos no avanzan la fase.
  IF COALESCE(v_venta.fase_posicion, 0) <> 11 THEN
    RETURN NEW;
  END IF;

  -- Cierra F12 (idempotente: el partial unique venta_fases_uk protege la
  -- carrera; el NOT EXISTS evita el error en el camino normal — p.ej. un
  -- pago aplicado a varios cargos de la misma venta dispara N veces).
  INSERT INTO dilesa.venta_fases
    (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
  SELECT v_venta.empresa_id, v_venta.id, 'Detonada', 12, v_pago.fecha,
         v_pago.registrado_por,
         'Cierre automático: abono de institución registrado en Cobranza'
  WHERE NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = v_venta.id AND fase = 'Detonada' AND deleted_at IS NULL
  );

  -- Primera detonación: en el caso normal v_total_detonado = el 1er depósito
  -- (titular); si ambos depósitos llegaran antes de detonar, ya suma los dos.
  UPDATE dilesa.ventas
  SET fase_actual = 'Detonada',
      fase_posicion = 12,
      fecha_detonacion = v_pago.fecha,
      monto_detonado = v_total_detonado,
      updated_at = now()
  WHERE id = v_venta.id AND fase_posicion = 11;

  -- Comprobante del abono → expediente (si ya está seteado; el deferred
  -- upload del drawer lo setea después y lo cubre el trigger de UPDATE).
  PERFORM dilesa.fn_copiar_comprobante_detonacion(v_pago.id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_detonar_venta_desde_cxc fallo (pago %, cargo %): %',
    NEW.pago_id, NEW.cargo_id, SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;
