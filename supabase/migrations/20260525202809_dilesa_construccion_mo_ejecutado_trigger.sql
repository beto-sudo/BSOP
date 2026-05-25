-- ============================================================================
-- DILESA · Construcción — trigger ahora actualiza mo_ejecutado + fixes de UX
-- ============================================================================
--
-- Bugs detectados por Beto en validación de PR #520:
--
-- 1) "MO ejecutado" y "MO por ejecutar" no se modificaban al palomear tareas.
--    Causa: el trigger `fn_tg_construccion_avance` solo actualizaba
--    `avance_pct` y `unidades.estado` — no tocaba `construccion.mo_ejecutado`.
--    Fix: extendemos el trigger para recalcular `mo_ejecutado` como
--    SUM(COALESCE(captura, derivada)) de las tareas terminadas.
--    Backfill: actualizamos las 1,372 obras existentes con el cálculo
--    correcto (la mayoría tendrá valores de la captura `mano_obra_pagada`
--    importada de Coda; las nuevas usarán el cálculo derivado).
--
-- 2) Supervisor mostraba email en vez de nombre. Causa: `core.usuarios.first_name`
--    está NULL para 2 usuarios (beto@anorte.com + adalberto.ss@dilesa.mx) y
--    el fallback `first_name || email` cae al email. Fix: backfill rápido.
--
-- Migración aditiva-segura: solo redefine función + UPDATE de datos. Sin
-- DDL en tablas, sin cambio de constraints.
-- ============================================================================

-- ── 1) Backfill core.usuarios.first_name ──────────────────────────────────
UPDATE core.usuarios
SET first_name = 'Adalberto'
WHERE email IN ('beto@anorte.com', 'adalberto.ss@dilesa.mx')
  AND first_name IS NULL;

-- ── 2) Redefinir trigger para que también actualice mo_ejecutado ──────────
CREATE OR REPLACE FUNCTION dilesa.fn_tg_construccion_avance()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_construccion_id uuid := COALESCE(NEW.construccion_id, OLD.construccion_id);
  v_avance_nuevo    numeric;
  v_avance_anterior numeric;
  v_unidad_id       uuid;
  v_producto_id     uuid;
  v_valor_contrato  numeric;
  v_mo_ejecutado    numeric;
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
  SELECT COALESCE(SUM(
    COALESCE(
      ctt.mano_obra_pagada,
      pt.porcentaje_costo * v_valor_contrato
    )
  ), 0)
    INTO v_mo_ejecutado
  FROM dilesa.construccion_tareas_terminadas ctt
  JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
  WHERE ctt.construccion_id = v_construccion_id
    AND ctt.deleted_at IS NULL;

  UPDATE dilesa.construccion
  SET avance_pct   = v_avance_nuevo,
      mo_ejecutado = v_mo_ejecutado
  WHERE id = v_construccion_id;

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

-- ── 3) Backfill mo_ejecutado para las 1,372 obras existentes ──────────────
-- Recalcula desde cero usando la misma fórmula que el trigger.
WITH mo_por_construccion AS (
  SELECT
    ctt.construccion_id,
    SUM(
      COALESCE(
        ctt.mano_obra_pagada,
        pt.porcentaje_costo * c.valor_contrato_mo
      )
    ) AS suma
  FROM dilesa.construccion_tareas_terminadas ctt
  JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
  JOIN dilesa.construccion c ON c.id = ctt.construccion_id
  WHERE ctt.deleted_at IS NULL
  GROUP BY ctt.construccion_id
)
UPDATE dilesa.construccion c
SET mo_ejecutado = COALESCE(m.suma, 0)
FROM mo_por_construccion m
WHERE c.id = m.construccion_id
  AND c.mo_ejecutado IS DISTINCT FROM COALESCE(m.suma, 0);

-- Asegurar que obras sin tareas terminadas tengan 0 (no NULL).
UPDATE dilesa.construccion
SET mo_ejecutado = 0
WHERE mo_ejecutado IS NULL;

-- Refresca el cache del PostgREST.
NOTIFY pgrst, 'reload schema';
