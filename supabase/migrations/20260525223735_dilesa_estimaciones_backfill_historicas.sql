-- ============================================================================
-- DILESA · Estimaciones — backfill histórico desde Coda
-- ============================================================================
--
-- Las 14,374 tareas terminadas importadas de Coda tienen `fecha_pagada`
-- populated (cobertura 100%). Esta migración crea las estimaciones
-- históricas correspondientes para que:
--
-- 1. La vista `v_tareas_pendientes_de_pago` quede limpia (solo aparezcan
--    tareas verdaderamente pendientes — palomeadas post-bsop sin pagar).
-- 2. El trigger lock proteja las 14,374 tareas históricas como pagadas
--    (no se pueden des-palomear por error).
-- 3. Audit trail completo: cada tarea queda trazable a "qué estimación
--    se pagó, cuándo".
--
-- Agrupación: (contratista_id, fecha_pagada). Cada grupo = 1 estimación.
-- Resultado esperado: 188 estimaciones, 14,374 vinculaciones.
--
-- **Decisión retención**: aplicamos 5% (confirmado por Beto — así se
-- modelaba en Coda al nivel estimación). monto_neto = monto_bruto × 0.95.
--
-- Audit user fields quedan NULL (data legacy sin attribution). El campo
-- `notas` deja claro el origen para auditorías futuras.
--
-- **Nota sobre código**: la abreviación de contratista NO es única (ej.
-- "MAYA" la comparten 2 contratistas: CONSTRUCCIONES VEGA RAMÍREZ + ANA
-- SARAHI MORADO). Para garantizar UNIQUE(empresa_id, codigo), incluimos
-- los primeros 4 chars del UUID del contratista como disambiguator:
-- `EST-YYYY-WNN-<abrev>-<UUID4>-NNN`. También actualizamos el RPC
-- `fn_generar_estimacion_borrador` para usar el mismo formato.
-- ============================================================================

-- ── A) Re-definir fn_generar_estimacion_borrador con disambiguator UUID ──────
-- Mismo bug aplicaba al RPC: dos contratistas con misma abreviación
-- generarían códigos colisionados en la misma semana. Fix proactivo.

CREATE OR REPLACE FUNCTION dilesa.fn_generar_estimacion_borrador(
  p_contratista_id uuid,
  p_fecha_cierre date DEFAULT CURRENT_DATE,
  p_retencion_pct numeric DEFAULT 5.0
)
RETURNS uuid
LANGUAGE plpgsql
AS $func$
DECLARE
  v_empresa_id uuid;
  v_abreviacion text;
  v_uuid_short text;
  v_estimacion_id uuid;
  v_codigo text;
  v_anio int;
  v_semana int;
  v_seq int;
  v_monto_bruto numeric(14,2);
  v_retencion_monto numeric(14,2);
  v_monto_neto numeric(14,2);
  v_tareas_count int;
BEGIN
  SELECT id INTO v_empresa_id FROM core.empresas WHERE slug = 'dilesa' LIMIT 1;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró empresa con slug = dilesa';
  END IF;

  SELECT cd.abreviacion INTO v_abreviacion
  FROM dilesa.contratistas_datos cd
  WHERE cd.persona_id = p_contratista_id
    AND cd.deleted_at IS NULL
    AND cd.empresa_id = v_empresa_id;
  IF v_abreviacion IS NULL THEN v_abreviacion := 'CONT'; END IF;

  -- Disambiguator: primeros 4 chars del UUID del contratista (hex). Mata la
  -- ambigüedad cuando 2+ contratistas comparten abreviación.
  v_uuid_short := SUBSTRING(p_contratista_id::text, 1, 4);

  SELECT COUNT(*) INTO v_tareas_count
  FROM dilesa.v_tareas_pendientes_de_pago vp
  WHERE vp.contratista_id = p_contratista_id
    AND vp.fecha_terminada <= p_fecha_cierre;
  IF v_tareas_count = 0 THEN RETURN NULL; END IF;

  v_anio := EXTRACT(ISOYEAR FROM p_fecha_cierre)::int;
  v_semana := EXTRACT(WEEK FROM p_fecha_cierre)::int;

  SELECT COUNT(*) + 1 INTO v_seq
  FROM dilesa.estimaciones e
  WHERE e.contratista_id = p_contratista_id
    AND EXTRACT(ISOYEAR FROM e.fecha_cierre) = v_anio
    AND EXTRACT(WEEK FROM e.fecha_cierre) = v_semana
    AND e.deleted_at IS NULL;

  v_codigo := format('EST-%s-W%s-%s-%s-%s',
                     v_anio,
                     LPAD(v_semana::text, 2, '0'),
                     v_abreviacion,
                     v_uuid_short,
                     LPAD(v_seq::text, 3, '0'));

  INSERT INTO dilesa.estimaciones (
    empresa_id, codigo, contratista_id, fecha_cierre, fecha_pago_programado,
    monto_bruto, retencion_pct, retencion_monto, monto_neto, estado
  ) VALUES (
    v_empresa_id, v_codigo, p_contratista_id, p_fecha_cierre,
    p_fecha_cierre + INTERVAL '1 day',
    0, p_retencion_pct, 0, 0, 'borrador'
  ) RETURNING id INTO v_estimacion_id;

  INSERT INTO dilesa.estimacion_tareas (
    empresa_id, estimacion_id, tarea_terminada_id, construccion_id, monto_calculado
  )
  SELECT vp.empresa_id, v_estimacion_id, vp.tarea_terminada_id, vp.construccion_id, vp.monto_calculado
  FROM dilesa.v_tareas_pendientes_de_pago vp
  WHERE vp.contratista_id = p_contratista_id
    AND vp.fecha_terminada <= p_fecha_cierre;

  SELECT COALESCE(SUM(monto_calculado), 0) INTO v_monto_bruto
  FROM dilesa.estimacion_tareas WHERE estimacion_id = v_estimacion_id;
  v_retencion_monto := v_monto_bruto * (p_retencion_pct / 100);
  v_monto_neto := v_monto_bruto - v_retencion_monto;

  UPDATE dilesa.estimaciones
  SET monto_bruto = v_monto_bruto, retencion_monto = v_retencion_monto, monto_neto = v_monto_neto
  WHERE id = v_estimacion_id;

  RETURN v_estimacion_id;
END $func$;

DO $$
DECLARE
  v_dilesa_id uuid;
  v_estimaciones_creadas int;
  v_tareas_vinculadas int;
BEGIN
  SELECT id INTO v_dilesa_id FROM core.empresas WHERE slug = 'dilesa';
  IF v_dilesa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró empresa DILESA';
  END IF;

  -- 1. INSERT estimaciones (1 por grupo contratista × fecha_pagada). Códigos
  --    auto-secuenciales por contratista × semana ISO × año ISO.
  WITH grupos AS (
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
      SUBSTRING(g.contratista_id::text, 1, 4),  -- disambiguator
      LPAD(g.seq_en_semana::text, 3, '0')
    ),
    g.contratista_id,
    g.fecha_pagada,                       -- fecha_cierre
    g.fecha_pagada,                       -- fecha_pago_programado (mismo día — no asumimos gap)
    g.monto_bruto,
    5.0,                                  -- retencion_pct (convención DILESA)
    (g.monto_bruto * 0.05)::numeric(14,2),
    (g.monto_bruto * 0.95)::numeric(14,2),
    g.fecha_pagada::timestamptz,          -- pagada_at
    'pagada',                             -- bypass del flujo borrador → pagada
    'Estimación histórica migrada de Coda el 2026-05-25 (Sprint 1 Estimaciones · backfill)'
  FROM grupos g
  LEFT JOIN dilesa.contratistas_datos cd
    ON cd.persona_id = g.contratista_id AND cd.deleted_at IS NULL;

  GET DIAGNOSTICS v_estimaciones_creadas = ROW_COUNT;
  RAISE NOTICE '✓ Estimaciones históricas creadas: %', v_estimaciones_creadas;

  -- 2. INSERT estimacion_tareas (1 por tarea pagada, vinculada a su
  --    estimación correspondiente vía contratista × fecha_pagada).
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
    AND e.estado = 'pagada'
    AND e.notas LIKE 'Estimación histórica migrada de Coda%'
  WHERE ctt.fecha_pagada IS NOT NULL
    AND ctt.deleted_at IS NULL
    AND c.deleted_at IS NULL;

  GET DIAGNOSTICS v_tareas_vinculadas = ROW_COUNT;
  RAISE NOTICE '✓ Tareas vinculadas: %', v_tareas_vinculadas;

  -- 3. Sanity check: ninguna tarea con fecha_pagada debería quedar sin
  --    vincular (= cero entradas en v_tareas_pendientes_de_pago para
  --    las que tienen fecha_pagada).
  IF EXISTS (
    SELECT 1
    FROM dilesa.construccion_tareas_terminadas ctt
    JOIN dilesa.construccion c ON c.id = ctt.construccion_id
    WHERE ctt.fecha_pagada IS NOT NULL
      AND ctt.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM dilesa.estimacion_tareas et
        WHERE et.tarea_terminada_id = ctt.id
      )
  ) THEN
    RAISE EXCEPTION 'Backfill incompleto: hay tareas con fecha_pagada sin vincular';
  END IF;

  RAISE NOTICE '✓ Backfill histórico completado sin huérfanos.';
END $$;

NOTIFY pgrst, 'reload schema';
