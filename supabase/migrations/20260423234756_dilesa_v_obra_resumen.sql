-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.v_obra_resumen
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vista de tablero por construccion_lote. Consolida en una sola fila:
--
--   • Datos base del construccion_lote (lote, prototipo, avance, fechas)
--   • Tareas: total, completadas, avance promedio
--   • Última inspección: fecha + resultado
--   • Última bitácora: fecha
--   • Contratos activos (vigentes): count
--   • Contratista principal: nombre armado desde erp.personas
--
-- security_invoker=on respeta RLS del usuario consumidor — solo ve filas de
-- las empresas a las que pertenece.
--
-- Consumida por el UI para mostrar "estado de obra" sin hacer 5 queries.

CREATE OR REPLACE VIEW dilesa.v_obra_resumen
WITH (security_invoker = on) AS
WITH tareas_agg AS (
  SELECT
    t.construccion_lote_id,
    COUNT(*)                                              AS total_tareas,
    COUNT(*) FILTER (WHERE t.estado = 'completada')       AS tareas_completadas,
    AVG(t.avance_pct)                                     AS avance_tareas_pct_avg
  FROM dilesa.tareas_construccion t
  WHERE t.deleted_at IS NULL
  GROUP BY t.construccion_lote_id
),
insp_last AS (
  SELECT DISTINCT ON (s.construccion_lote_id)
    s.construccion_lote_id,
    s.fecha_inspeccion  AS ultima_inspeccion_fecha,
    s.resultado         AS ultima_inspeccion_resultado
  FROM dilesa.checklist_supervision s
  WHERE s.deleted_at IS NULL
  ORDER BY s.construccion_lote_id, s.fecha_inspeccion DESC, s.created_at DESC
),
bit_last AS (
  SELECT
    b.construccion_lote_id,
    MAX(b.fecha) AS ultima_bitacora_fecha
  FROM dilesa.bitacora_obra b
  WHERE b.deleted_at IS NULL
  GROUP BY b.construccion_lote_id
),
contratos_agg AS (
  SELECT
    c.construccion_lote_id,
    COUNT(*) FILTER (WHERE c.estado = 'vigente') AS contratos_activos
  FROM dilesa.contratos_construccion c
  WHERE c.deleted_at IS NULL
  GROUP BY c.construccion_lote_id
)
SELECT
  cl.id,
  cl.empresa_id,
  cl.lote_id,
  cl.prototipo_id,
  cl.etapa_construccion_id,
  cl.fecha_inicio_obra,
  cl.fecha_estimada_entrega,
  cl.fecha_real_entrega,
  cl.avance_pct                  AS construccion_avance_pct,
  cl.presupuesto_asignado,
  cl.costo_acumulado,

  -- Contratista principal
  cl.contratista_principal_id,
  CASE
    WHEN cp.id IS NULL THEN NULL
    ELSE TRIM(BOTH ' ' FROM CONCAT_WS(' ',
      pers.nombre, pers.apellido_paterno, pers.apellido_materno
    ))
  END AS contratista_principal_nombre,

  -- Tareas
  COALESCE(ta.total_tareas, 0)        AS total_tareas,
  COALESCE(ta.tareas_completadas, 0)  AS tareas_completadas,
  ta.avance_tareas_pct_avg            AS avance_tareas_pct,

  -- Inspecciones
  il.ultima_inspeccion_fecha,
  il.ultima_inspeccion_resultado,

  -- Bitácora
  bl.ultima_bitacora_fecha,

  -- Contratos
  COALESCE(co.contratos_activos, 0)   AS contratos_activos,

  cl.created_at,
  cl.updated_at
FROM dilesa.construccion_lote cl
LEFT JOIN dilesa.contratistas cp
  ON cp.id = cl.contratista_principal_id AND cp.deleted_at IS NULL
LEFT JOIN erp.personas pers
  ON pers.id = cp.persona_id AND pers.deleted_at IS NULL
LEFT JOIN tareas_agg   ta ON ta.construccion_lote_id = cl.id
LEFT JOIN insp_last    il ON il.construccion_lote_id = cl.id
LEFT JOIN bit_last     bl ON bl.construccion_lote_id = cl.id
LEFT JOIN contratos_agg co ON co.construccion_lote_id = cl.id
WHERE cl.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_obra_resumen IS
  'Tablero consolidado por construccion_lote: tareas (total/completadas/avance), última inspección, última bitácora, contratos activos, contratista principal (nombre desde erp.personas). security_invoker=on respeta RLS.';
