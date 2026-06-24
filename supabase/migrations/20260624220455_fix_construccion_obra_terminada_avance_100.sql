-- ╭─ 20260624220455_fix_construccion_obra_terminada_avance_100 ─╮
-- Cuando una obra llega al 100% de avance (todas sus tareas cerradas, p.ej.
-- al cerrar la recepción desde Atención a Clientes) el trigger
-- `tg_construccion_avance` marcaba 'terminada' SOLO en `dilesa.unidades`,
-- nunca en `dilesa.construccion`. La obra quedaba en 'en_progreso' con
-- `fecha_terminada` NULL pese a estar al 100% (asimetría con el fix
-- 20260616224318, que solo blindó la dirección estado⇒avance, no avance⇒estado).
--
-- Fix de fondo: la obra al 100% pasa a 'terminada' (espejo de la unidad) y
-- sella `fecha_terminada` = fecha de la última tarea cerrada. + backfill de las
-- obras ya rezagadas (las cerradas por recepción antes de este parche).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

-- ── 1. Trigger: propagar 100% ⇒ construccion.estado='terminada' + fecha ──────
-- Reescrito desde la definición VIVA en prod (pg_get_functiondef) + el bloque
-- nuevo de la obra. Lo demás queda idéntico (avance, MO, transiciones de unidad).
CREATE OR REPLACE FUNCTION dilesa.fn_tg_construccion_avance()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'dilesa', 'public'
AS $function$
DECLARE
  v_construccion_id uuid := COALESCE(NEW.construccion_id, OLD.construccion_id);
  v_avance_nuevo    numeric;
  v_avance_anterior numeric;
  v_unidad_id       uuid;
  v_producto_id     uuid;
  v_valor_contrato  numeric;
  v_mo_ejecutado    numeric;
  v_fecha_obra      date;
BEGIN
  -- Snapshot del avance ANTES de recalcular (para detectar cruce del 20%).
  SELECT avance_pct, unidad_id, producto_id, valor_contrato_mo
    INTO v_avance_anterior, v_unidad_id, v_producto_id, v_valor_contrato
  FROM dilesa.construccion
  WHERE id = v_construccion_id;

  -- Recalcular avance (% de costo terminado).
  v_avance_nuevo := dilesa.fn_calcular_avance_construccion(v_construccion_id);

  -- Recalcular MO ejecutado = SUM(COALESCE(captura_manual, % × valor_contrato))
  -- de cada tarea terminada. Mismo principio que la vista
  -- `v_construccion_tareas_terminadas_con_mo`: si Coda capturó un monto
  -- explícito en mano_obra_pagada, lo respeta; si no (registros nuevos
  -- desde la UI inline post-2026-05-25), deriva del % × valor_contrato_mo.
  -- De paso captura la fecha de la última tarea cerrada (= término real de obra).
  SELECT COALESCE(SUM(
    COALESCE(
      ctt.mano_obra_pagada,
      pt.porcentaje_costo * v_valor_contrato
    )
  ), 0),
  max(ctt.fecha_terminada)
    INTO v_mo_ejecutado, v_fecha_obra
  FROM dilesa.construccion_tareas_terminadas ctt
  JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
  WHERE ctt.construccion_id = v_construccion_id
    AND ctt.deleted_at IS NULL;

  UPDATE dilesa.construccion
  SET avance_pct   = v_avance_nuevo,
      mo_ejecutado = v_mo_ejecutado
  WHERE id = v_construccion_id;

  -- La OBRA al 100% pasa a 'terminada' (espejo de la unidad) y sella su fecha.
  -- SIN guard de cruce a propósito: auto-sana obras que ya están en 100 con el
  -- estado rezagado (p.ej. cerradas por recepción de Atención a Clientes, donde
  -- la última tarea no necesariamente cruzó el umbral porque las demás ya
  -- sumaban ≥100). El filtro estado IN ('arrancada','en_progreso') garantiza
  -- que NUNCA degrade un estado posterior (terminada/dtu/seguro_calidad/extraida)
  -- y lo hace idempotente.
  IF v_avance_nuevo >= 100 THEN
    UPDATE dilesa.construccion
    SET estado          = 'terminada',
        fecha_terminada = COALESCE(fecha_terminada, v_fecha_obra, CURRENT_DATE)
    WHERE id = v_construccion_id
      AND estado IN ('arrancada', 'en_progreso');
  END IF;

  -- Trigger "20% → en_construccion (disponible para venta)". Idempotente:
  -- solo dispara si la unidad sigue en planeada/lote_urbanizado.
  IF v_avance_nuevo >= 20 AND COALESCE(v_avance_anterior, 0) < 20 THEN
    UPDATE dilesa.unidades
    SET estado = 'en_construccion',
        producto_id = COALESCE(producto_id, v_producto_id)
    WHERE id = v_unidad_id
      AND estado IN ('planeada', 'lote_urbanizado')
      AND deleted_at IS NULL;
  END IF;

  -- Trigger 100% → terminada (cuando todas las tareas están cerradas).
  IF v_avance_nuevo >= 100 AND COALESCE(v_avance_anterior, 0) < 100 THEN
    UPDATE dilesa.unidades
    SET estado = 'terminada'
    WHERE id = v_unidad_id
      AND estado = 'en_construccion'
      AND deleted_at IS NULL;
  END IF;

  -- Trigger inverso: si bajó de ≥20 a <20 (improbable pero posible si se
  -- borra una tarea terminada), volver a planeada.
  IF v_avance_nuevo < 20 AND COALESCE(v_avance_anterior, 0) >= 20 THEN
    UPDATE dilesa.unidades
    SET estado = 'planeada'
    WHERE id = v_unidad_id
      AND estado = 'en_construccion'
      AND deleted_at IS NULL;
  END IF;

  RETURN NULL;
END $function$;

-- ── 2. Backfill: obras ya al 100% con estado rezagado ────────────────────────
-- Mismo criterio que el trigger. Hoy son exactamente las 2 cerradas por
-- recepción antes de este parche (M13-L10 / M13-L11 LDS-RMD-MAYA); la cláusula
-- es general por si quedara alguna más. El trigger BEFORE UPDATE OF estado
-- (`tg_construccion_estado_avance`) mantiene avance=100 — aquí ya lo está.
UPDATE dilesa.construccion c
SET estado          = 'terminada',
    fecha_terminada = COALESCE(
      c.fecha_terminada,
      (SELECT max(ctt.fecha_terminada)
         FROM dilesa.construccion_tareas_terminadas ctt
        WHERE ctt.construccion_id = c.id
          AND ctt.deleted_at IS NULL),
      CURRENT_DATE)
WHERE c.avance_pct >= 100
  AND c.estado IN ('arrancada', 'en_progreso')
  AND c.deleted_at IS NULL;

COMMIT;
