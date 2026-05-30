-- ============================================================================
-- Backfill: marcar todas las tareas de plantilla como terminadas para obras
-- que ya están en estado completado (terminada/dtu/seguro_calidad/extraida)
-- pero tienen 0 tareas registradas porque se borraron en Coda por
-- limitaciones de tamaño de tabla.
-- ============================================================================
--
-- Universo: 1,174 obras completadas con avance < 100% y CERO tareas.
--   - Terminadas entre 2017 y nov-2025.
--   - 11 obras parciales (68/74 tareas, terminadas 2025-11-26) se EXCLUYEN
--     porque esas sí conservan tareas de Coda — su gap puede ser real.
-- Total estimado de inserts: ~113k filas en tareas + ~646 estimaciones nuevas.
--
-- Estrategia:
--   1. Desactivar trigger de avance (evita ~113k recálculos individuales).
--   2. INSERT tareas con fecha_pagada = fecha_terminada.
--   3. Recalcular avance_pct y mo_ejecutado en bulk.
--   4. Reactivar trigger.
--   5. Crear estimaciones históricas para los 646 grupos nuevos
--      (contratista × fecha) con ON CONFLICT DO NOTHING (los 8 existentes
--      se respetan — no se generan códigos duplicados).
--   6. Vincular las ~113k tareas a sus estimaciones (nuevas o existentes)
--      para que salgan de v_tareas_pendientes_de_pago.
-- ============================================================================

-- 1. Desactivar trigger.
ALTER TABLE dilesa.construccion_tareas_terminadas
  DISABLE TRIGGER tg_construccion_avance;

-- 2. Insertar tareas con fecha_pagada = fecha_terminada.
WITH obras_sin_tareas AS (
  SELECT c.id
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado IN ('terminada', 'dtu', 'seguro_calidad', 'extraida')
    AND c.avance_pct < 100
    AND NOT EXISTS (
      SELECT 1 FROM dilesa.construccion_tareas_terminadas ctt
      WHERE ctt.construccion_id = c.id AND ctt.deleted_at IS NULL
    )
)
INSERT INTO dilesa.construccion_tareas_terminadas (
  empresa_id,
  construccion_id,
  plantilla_tarea_id,
  fecha_terminada,
  fecha_pagada
)
SELECT
  c.empresa_id,
  c.id AS construccion_id,
  pt.id AS plantilla_tarea_id,
  c.fecha_terminada,
  c.fecha_terminada
FROM obras_sin_tareas ost
JOIN dilesa.construccion c ON c.id = ost.id
JOIN dilesa.plantilla_tareas pt
  ON pt.producto_id = c.producto_id
  AND pt.deleted_at IS NULL;

-- 3. Recalcular avance_pct en bulk.
WITH obras_afectadas AS (
  SELECT c.id
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado IN ('terminada', 'dtu', 'seguro_calidad', 'extraida')
    AND c.avance_pct < 100
)
UPDATE dilesa.construccion c
SET avance_pct = dilesa.fn_calcular_avance_construccion(c.id)
FROM obras_afectadas oa
WHERE c.id = oa.id;

-- 4. Recalcular mo_ejecutado en bulk.
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
    AND c.deleted_at IS NULL
    AND c.estado IN ('terminada', 'dtu', 'seguro_calidad', 'extraida')
  GROUP BY ctt.construccion_id
)
UPDATE dilesa.construccion c
SET mo_ejecutado = COALESCE(m.suma, 0)
FROM mo_por_construccion m
WHERE c.id = m.construccion_id
  AND c.mo_ejecutado IS DISTINCT FROM COALESCE(m.suma, 0);

-- 5. Reactivar trigger.
ALTER TABLE dilesa.construccion_tareas_terminadas
  ENABLE TRIGGER tg_construccion_avance;

-- 6. Crear estimaciones históricas para grupos nuevos (ON CONFLICT skip).
--    Los 8 grupos que ya tienen estimación se respetan sin tocar.
WITH grupos_nuevos AS (
  SELECT
    c.contratista_id,
    ctt.fecha_pagada,
    SUM(COALESCE(
      ctt.mano_obra_pagada,
      pt.porcentaje_costo * c.valor_contrato_mo
    ))::numeric(14,2) AS monto_bruto
  FROM dilesa.construccion_tareas_terminadas ctt
  JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
  JOIN dilesa.construccion c ON c.id = ctt.construccion_id
  WHERE ctt.fecha_pagada IS NOT NULL
    AND ctt.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM dilesa.estimaciones e
      WHERE e.contratista_id = c.contratista_id
        AND e.fecha_cierre = ctt.fecha_pagada
        AND e.deleted_at IS NULL
    )
  GROUP BY c.contratista_id, ctt.fecha_pagada
)
INSERT INTO dilesa.estimaciones (
  empresa_id, codigo, contratista_id, fecha_cierre, fecha_pago_programado,
  monto_bruto, retencion_pct, retencion_monto, monto_neto,
  pagada_at, estado, notas
)
SELECT
  (SELECT id FROM core.empresas WHERE slug = 'dilesa'),
  format('EST-%s-W%s-%s-%s',
    EXTRACT(ISOYEAR FROM g.fecha_pagada)::int,
    LPAD(EXTRACT(WEEK FROM g.fecha_pagada)::int::text, 2, '0'),
    COALESCE(cd.abreviacion, 'CONT'),
    SUBSTRING(gen_random_uuid()::text, 1, 8)
  ),
  g.contratista_id,
  g.fecha_pagada,
  g.fecha_pagada,
  g.monto_bruto,
  5.0,
  (g.monto_bruto * 0.05)::numeric(14,2),
  (g.monto_bruto * 0.95)::numeric(14,2),
  g.fecha_pagada::timestamptz,
  'pagada',
  'Backfill: tareas reconstruidas de obras completadas (Coda purgó las originales)'
FROM grupos_nuevos g
LEFT JOIN dilesa.contratistas_datos cd
  ON cd.persona_id = g.contratista_id AND cd.deleted_at IS NULL;

-- 7. Vincular TODAS las tareas con fecha_pagada sin estimación a su
--    estimación correspondiente (nuevas del paso 6 + las 8 preexistentes).
INSERT INTO dilesa.estimacion_tareas (
  empresa_id, estimacion_id, tarea_terminada_id, construccion_id, monto_calculado
)
SELECT
  (SELECT id FROM core.empresas WHERE slug = 'dilesa'),
  e.id,
  ctt.id,
  ctt.construccion_id,
  COALESCE(
    ctt.mano_obra_pagada,
    pt.porcentaje_costo * c.valor_contrato_mo
  )::numeric(14,2)
FROM dilesa.construccion_tareas_terminadas ctt
JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
JOIN dilesa.construccion c ON c.id = ctt.construccion_id
JOIN dilesa.estimaciones e
  ON e.contratista_id = c.contratista_id
  AND e.fecha_cierre = ctt.fecha_pagada
  AND e.deleted_at IS NULL
WHERE ctt.fecha_pagada IS NOT NULL
  AND ctt.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.estimacion_tareas et
    WHERE et.tarea_terminada_id = ctt.id
  );

NOTIFY pgrst, 'reload schema';
