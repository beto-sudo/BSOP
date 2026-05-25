-- ============================================================================
-- DILESA · Construcción Sprint 4 (refactor post-Coda-review)
-- ----------------------------------------------------------------------------
-- Vista que expone tareas terminadas con el MO derivado de
-- valor_contrato_mo × plantilla_tareas.porcentaje_costo. Útil para
-- KPIs de contratista (MO total ejecutado), reportes y para la UI de
-- obra (donde el supervisor ya no captura MO por tarea — ver decisión
-- ADR-032 D3).
--
-- Por qué vista en lugar de columna calculada en la tabla:
--   - El cálculo cambia si valor_contrato_mo o porcentaje_costo se editan
--     después (ej. corregimos el monto del contrato porque el contratista
--     refacturó). Una columna almacenada quedaría stale.
--   - Mantenemos `construccion_tareas_terminadas.mano_obra_pagada` como
--     override opcional manual — los rows históricos de Coda (Sprint 2)
--     ya traen ese valor poblado; los rows nuevos lo dejan NULL y la
--     vista deriva.
--
-- Security: SECURITY INVOKER → respeta RLS de las tablas base. La vista
-- no introduce vector de bypass.
--
-- Nota: usa `pt.porcentaje_costo` (numérico, ej. 0.025 = 2.5% o 2.5 =
-- 2.5% — depende del seed). El seed actual de Coda está en %-puntos
-- (números tipo 2.5, no 0.025), por lo que dividimos entre 100 para que
-- la multiplicación dé el MO en MXN. Si en algún momento cambiamos el
-- seed a fracción, ajustar aquí.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_construccion_tareas_terminadas_con_mo
WITH (security_invoker = on)
AS
SELECT
  ctt.id,
  ctt.empresa_id,
  ctt.construccion_id,
  ctt.plantilla_tarea_id,
  ctt.fecha_terminada,
  ctt.tiempo_real_dias,
  ctt.revisado_por_persona_id,
  ctt.fecha_pagada,
  ctt.notas,
  ctt.created_at,
  ctt.updated_at,
  ctt.deleted_at,
  -- MO: override manual si lo capturaron (Coda histórico); si NULL,
  -- derivamos como valor_contrato_mo × % plantilla.
  COALESCE(
    ctt.mano_obra_pagada,
    c.valor_contrato_mo * (pt.porcentaje_costo / 100.0)
  )::numeric(14, 2) AS mo_calculado
FROM dilesa.construccion_tareas_terminadas ctt
JOIN dilesa.construccion c ON c.id = ctt.construccion_id
JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
WHERE ctt.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_construccion_tareas_terminadas_con_mo IS
  'Tareas terminadas con MO calculado = valor_contrato_mo × porcentaje_costo/100. '
  'Si mano_obra_pagada (override manual o legado de Coda) está poblado, lo respeta. '
  'ADR-032 D3 — MO por tarea es derivado, no se captura en UI.';

NOTIFY pgrst, 'reload schema';

COMMIT;
