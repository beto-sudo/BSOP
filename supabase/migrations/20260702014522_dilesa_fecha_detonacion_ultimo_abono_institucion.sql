-- ╭─ 20260702014522_dilesa_fecha_detonacion_ultimo_abono_institucion ─╮
-- La fecha de detonación (fase 12) debe ser la fecha del ÚLTIMO recibo de pago
-- de institución registrado en Cobranza — es la fecha determinante para el
-- cálculo y pago de comisiones (el dinero está completo hasta el último abono).
--
-- Huecos que cierra (norma Beto 2026-07-01):
--   1. `fn_detonar_venta_desde_cxc()` conservaba la fecha del PRIMER abono
--      (COALESCE en la rama fase >= 12): con coacreditados (Infonavit Unamos)
--      que depositan en días distintos, la comisión quedaba anclada a una fecha
--      en la que el dinero aún no estaba completo.
--   2. El cierre manual de emergencia (pantalla F12) escribía una fecha que el
--      abono real posterior en CxC nunca corregía. CxC es la fuente de verdad:
--      en cuanto hay abono de institución, su MAX(fecha) pisa la fecha manual.
--   3. `dilesa.venta_fases.fecha` (fase Detonada) y `dilesa.ventas.fecha_detonacion`
--      podían divergir (drift observado: 4 ventas con 1 día de diferencia).
--   4. Corregir la fecha de un abono (o soft-borrarlo) en CxC dejaba la
--      detonación stale en silencio → nuevo trigger de UPDATE en erp.cxc_pagos
--      recalcula fecha y monto detonado.
--
-- Regla resultante: fecha_detonacion = MAX(pg.fecha) y monto_detonado =
-- SUM(pg.monto_total) sobre TODOS los abonos `fuente='institucion'` vivos
-- aplicados a cargos de la venta. Los abonos de cliente (enganches) no mueven
-- la detonación. Idempotente: solo escribe cuando hay diferencia.
--
-- Partido de la versión 20260625210939 (fix acumula coacreditados); resto de la
-- función intacto (gates de fase, comprobante, manejo de excepción).

BEGIN;

-- ── 1. Recalculo compartido: fecha (MAX) + monto (SUM) de abonos institución ──
-- Actualiza dilesa.ventas y dilesa.venta_fases (fase Detonada) de una venta a
-- partir del estado vivo de CxC. No toca ventas sin abonos de institución
-- (v_fecha_ultimo NULL) ni avanza fases — solo sincroniza los escalares.
CREATE OR REPLACE FUNCTION dilesa.fn_sync_detonacion_desde_cxc(p_venta_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_total_detonado numeric;
  v_fecha_ultimo date;
BEGIN
  SELECT COALESCE(SUM(pg.monto_total), 0), MAX(pg.fecha)
    INTO v_total_detonado, v_fecha_ultimo
  FROM erp.cxc_pagos pg
  WHERE pg.fuente = 'institucion'
    AND pg.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM erp.cxc_pago_aplicaciones ap
      JOIN erp.cxc_cargos cg ON cg.id = ap.cargo_id AND cg.deleted_at IS NULL
      WHERE ap.pago_id = pg.id
        AND cg.origen_tipo = 'venta_dilesa'
        AND cg.origen_id = p_venta_id
    );

  -- Sin abonos de institución vivos no hay nada que sincronizar (si todos se
  -- borraron, la detonación existente queda para revisión manual — regresar
  -- la fase es una acción destructiva que no se automatiza).
  IF v_fecha_ultimo IS NULL THEN
    RETURN;
  END IF;

  UPDATE dilesa.ventas
  SET fecha_detonacion = v_fecha_ultimo,
      monto_detonado = v_total_detonado,
      updated_at = now()
  WHERE id = p_venta_id
    AND deleted_at IS NULL
    AND (fecha_detonacion IS DISTINCT FROM v_fecha_ultimo
         OR monto_detonado IS DISTINCT FROM v_total_detonado);

  UPDATE dilesa.venta_fases
  SET fecha = v_fecha_ultimo,
      updated_at = now()
  WHERE venta_id = p_venta_id
    AND fase = 'Detonada'
    AND deleted_at IS NULL
    AND fecha IS DISTINCT FROM v_fecha_ultimo;
END;
$function$;

REVOKE ALL ON FUNCTION dilesa.fn_sync_detonacion_desde_cxc(uuid) FROM PUBLIC;

-- ── 2. Trigger de detonación: usar MAX(fecha), no la del pago que dispara ──
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

  -- Venta ya detonada (o más allá): sincronizar fecha (último abono) + monto
  -- (acumulado) y copiar el comprobante. La fecha manual de la pantalla F12
  -- también se pisa aquí: CxC es la fuente de verdad de la detonación.
  IF COALESCE(v_venta.fase_posicion, 0) >= 12 THEN
    PERFORM dilesa.fn_sync_detonacion_desde_cxc(v_venta.id);
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
  -- La fecha exacta (MAX de todos los abonos) la fija fn_sync abajo.
  INSERT INTO dilesa.venta_fases
    (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
  SELECT v_venta.empresa_id, v_venta.id, 'Detonada', 12, v_pago.fecha,
         v_pago.registrado_por,
         'Cierre automático: abono de institución registrado en Cobranza'
  WHERE NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = v_venta.id AND fase = 'Detonada' AND deleted_at IS NULL
  );

  UPDATE dilesa.ventas
  SET fase_actual = 'Detonada',
      fase_posicion = 12,
      updated_at = now()
  WHERE id = v_venta.id AND fase_posicion = 11;

  -- Fecha + monto desde el estado vivo de CxC (si ambos depósitos de
  -- coacreditados llegaron antes de detonar, ya toma MAX/SUM de los dos).
  PERFORM dilesa.fn_sync_detonacion_desde_cxc(v_venta.id);

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

-- ── 3. Correcciones en CxC re-sincronizan la detonación ──
-- Si Cobranza corrige la fecha/monto de un abono de institución, lo soft-borra
-- o lo restaura, la fecha de detonación se recalcula sola (hoy quedaba stale).
CREATE OR REPLACE FUNCTION dilesa.fn_resync_detonacion_por_pago()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_venta_id uuid;
BEGIN
  -- Solo interesan cambios que afectan la detonación.
  IF NEW.fuente <> 'institucion' AND OLD.fuente <> 'institucion' THEN
    RETURN NEW;
  END IF;
  IF NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.monto_total IS NOT DISTINCT FROM OLD.monto_total
     AND NEW.fuente IS NOT DISTINCT FROM OLD.fuente
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  FOR v_venta_id IN
    SELECT DISTINCT cg.origen_id
    FROM erp.cxc_pago_aplicaciones ap
    JOIN erp.cxc_cargos cg ON cg.id = ap.cargo_id AND cg.deleted_at IS NULL
    WHERE ap.pago_id = NEW.id
      AND cg.origen_tipo = 'venta_dilesa'
      AND cg.origen_id IS NOT NULL
  LOOP
    PERFORM dilesa.fn_sync_detonacion_desde_cxc(v_venta_id);
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_resync_detonacion_por_pago fallo (pago %): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_resync_detonacion_por_pago ON erp.cxc_pagos;
CREATE TRIGGER trg_resync_detonacion_por_pago
  AFTER UPDATE ON erp.cxc_pagos
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_resync_detonacion_por_pago();

-- ── 4. Backfill: alinear ventas ya detonadas al último abono de institución ──
-- FINANCIERA DE RIESGO (mueve la fecha base del pago de comisiones).
-- Alcance verificado en prod 2026-07-01: 4-5 ventas con drift de 1 día
-- (cierre manual F12 el 2026-06-10, abono real en CxC el 2026-06-11).
-- Solo toca ventas con fecha_detonacion YA seteada (las ~1,029 legacy de Coda
-- con fecha_detonacion NULL quedan intactas: selladas sin proceso).
WITH ultimo AS (
  SELECT cg.origen_id AS venta_id, MAX(pg.fecha) AS max_fecha
  FROM erp.cxc_pagos pg
  JOIN erp.cxc_pago_aplicaciones ap ON ap.pago_id = pg.id
  JOIN erp.cxc_cargos cg ON cg.id = ap.cargo_id AND cg.deleted_at IS NULL
  WHERE pg.fuente = 'institucion'
    AND pg.deleted_at IS NULL
    AND cg.origen_tipo = 'venta_dilesa'
    AND cg.origen_id IS NOT NULL
  GROUP BY cg.origen_id
)
UPDATE dilesa.ventas v
SET fecha_detonacion = u.max_fecha,
    updated_at = now()
FROM ultimo u
WHERE v.id = u.venta_id
  AND v.deleted_at IS NULL
  AND v.fecha_detonacion IS NOT NULL
  AND v.fecha_detonacion IS DISTINCT FROM u.max_fecha;

WITH ultimo AS (
  SELECT cg.origen_id AS venta_id, MAX(pg.fecha) AS max_fecha
  FROM erp.cxc_pagos pg
  JOIN erp.cxc_pago_aplicaciones ap ON ap.pago_id = pg.id
  JOIN erp.cxc_cargos cg ON cg.id = ap.cargo_id AND cg.deleted_at IS NULL
  WHERE pg.fuente = 'institucion'
    AND pg.deleted_at IS NULL
    AND cg.origen_tipo = 'venta_dilesa'
    AND cg.origen_id IS NOT NULL
  GROUP BY cg.origen_id
)
UPDATE dilesa.venta_fases vf
SET fecha = u.max_fecha,
    updated_at = now()
FROM ultimo u
JOIN dilesa.ventas v ON v.id = u.venta_id AND v.deleted_at IS NULL
WHERE vf.venta_id = u.venta_id
  AND vf.fase = 'Detonada'
  AND vf.deleted_at IS NULL
  AND v.fecha_detonacion IS NOT NULL
  AND vf.fecha IS DISTINCT FROM u.max_fecha;

NOTIFY pgrst, 'reload schema';

COMMIT;
