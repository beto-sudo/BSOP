-- ============================================================================
-- DILESA · Estimaciones — RPC para backfill incremental (Sprint 6 cutover)
-- ============================================================================
--
-- Las estimaciones NO viven como tabla propia en Coda — son derivadas
-- agrupando `Tareas Construcción Terminada` por (contratista, fecha_pagada).
--
-- Cada noche tras el sync de tareas terminadas pueden aparecer fechas_pagada
-- nuevas (cierres recientes en Coda). Esta función recrea idempotentemente
-- las estimaciones para grupos NUEVOS (que aún no tengan estimación) +
-- vincula las tareas correspondientes.
--
-- Diseño:
--   - Solo crea estimaciones donde NOT EXISTS(estimación para ese grupo)
--   - Solo vincula tareas donde NOT EXISTS(vinculación) — UNIQUE de defensa
--   - 0 mutaciones a estimaciones existentes (incl. borradores, pagadas
--     históricas — todo se respeta)
--   - SECURITY DEFINER para que el script con anon/service-role pueda llamarla
--   - RETURNS TABLE con conteos para reporte
--
-- Reusa el mismo formato de código que el backfill histórico inicial:
--   `EST-YYYY-WNN-<abrev>-<UUID4>-NNN`
-- ============================================================================

CREATE OR REPLACE FUNCTION dilesa.fn_estimaciones_backfill_incremental()
RETURNS TABLE (
  estimaciones_creadas int,
  tareas_vinculadas int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, dilesa, core
AS $$
DECLARE
  v_dilesa_id uuid;
  v_estimaciones_creadas int := 0;
  v_tareas_vinculadas int := 0;
BEGIN
  SELECT id INTO v_dilesa_id FROM core.empresas WHERE slug = 'dilesa';
  IF v_dilesa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró empresa DILESA';
  END IF;

  -- 1. Crear estimaciones nuevas (1 por grupo contratista × fecha_pagada
  --    que aún no exista).
  WITH grupos_nuevos AS (
    SELECT
      c.contratista_id,
      ctt.fecha_pagada,
      SUM(COALESCE(ctt.mano_obra_pagada, pt.porcentaje_costo * c.valor_contrato_mo))::numeric(14,2) AS monto_bruto,
      ROW_NUMBER() OVER (
        PARTITION BY
          c.contratista_id,
          EXTRACT(ISOYEAR FROM ctt.fecha_pagada),
          EXTRACT(WEEK FROM ctt.fecha_pagada)
        ORDER BY ctt.fecha_pagada
      ) AS seq_en_semana
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
    v_dilesa_id,
    format(
      'EST-%s-W%s-%s-%s-%s',
      EXTRACT(ISOYEAR FROM g.fecha_pagada)::int,
      LPAD(EXTRACT(WEEK FROM g.fecha_pagada)::int::text, 2, '0'),
      COALESCE(cd.abreviacion, 'CONT'),
      SUBSTRING(g.contratista_id::text, 1, 4),
      LPAD(g.seq_en_semana::text, 3, '0')
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
    'Estimación migrada incrementalmente desde Coda (sync nocturno)'
  FROM grupos_nuevos g
  LEFT JOIN dilesa.contratistas_datos cd
    ON cd.persona_id = g.contratista_id AND cd.deleted_at IS NULL;

  GET DIAGNOSTICS v_estimaciones_creadas = ROW_COUNT;

  -- 2. Vincular tareas que aún no estén en ninguna estimación. Cubre tanto
  --    las recién creadas en el paso 1 como cualquier tarea que por algún
  --    motivo quedó sin vincular (defensa contra inconsistencias).
  INSERT INTO dilesa.estimacion_tareas (
    empresa_id, estimacion_id, tarea_terminada_id, construccion_id, monto_calculado
  )
  SELECT
    v_dilesa_id,
    e.id,
    ctt.id,
    ctt.construccion_id,
    COALESCE(ctt.mano_obra_pagada, pt.porcentaje_costo * c.valor_contrato_mo)::numeric(14,2)
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

  GET DIAGNOSTICS v_tareas_vinculadas = ROW_COUNT;

  RETURN QUERY SELECT v_estimaciones_creadas, v_tareas_vinculadas;
END $$;

COMMENT ON FUNCTION dilesa.fn_estimaciones_backfill_incremental() IS
  'Backfill incremental de estimaciones DILESA. Idempotente: solo crea '
  'estimaciones para grupos (contratista × fecha_pagada) que aún NO existan '
  'y vincula tareas sueltas. Usado por scripts/import_dilesa_estimaciones_incremental.ts '
  'cada noche tras sync de tareas terminadas.';

GRANT EXECUTE ON FUNCTION dilesa.fn_estimaciones_backfill_incremental() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
