-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-2a — dilesa.v_lotes_estatus
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vista consolidada de estatus por lote para consumo del UI. Agrega:
--
--   • Datos del lote (manzana, número, dimensiones, prototipo asignado)
--   • Avance agregado de urbanización (promedio simple sobre fases activas)
--   • Avance constructivo activo (única fila por lote vía UNIQUE parcial)
--   • Estatus unificado derivado: disponible | urbanizando | urbanizado |
--     construyendo | construido | (ventas y escrituración llegan en
--     dilesa-4/dilesa-5; aquí queda como NULL hasta entonces)
--
-- security_invoker=on: respeta RLS de cada tabla origen, así un usuario solo
-- ve los lotes/avances de las empresas a las que pertenece.
--
-- El UI lane consume esta vista en lugar de hacer 3 queries separados.

CREATE OR REPLACE VIEW dilesa.v_lotes_estatus
WITH (security_invoker = on) AS
WITH urb_agg AS (
  SELECT
    u.lote_id,
    AVG(u.avance_pct)            AS urbanizacion_avance_pct_avg,
    MIN(u.fecha_inicio)          AS urbanizacion_fecha_inicio_min,
    MAX(u.fecha_terminacion)     AS urbanizacion_fecha_terminacion_max,
    COUNT(*)                     AS urbanizacion_fases_count,
    COUNT(*) FILTER (WHERE u.avance_pct >= 100) AS urbanizacion_fases_completas
  FROM dilesa.urbanizacion_lote u
  WHERE u.deleted_at IS NULL
  GROUP BY u.lote_id
)
SELECT
  l.id,
  l.empresa_id,
  l.proyecto_id,
  l.manzana,
  l.numero_lote,
  l.superficie_m2,
  l.frente_m,
  l.fondo_m,
  l.tipo_uso,
  l.precio_lote,
  l.fase_inventario_id,
  l.prototipo_asignado_id,
  p.nombre AS prototipo_asignado_nombre,
  l.responsable_id,
  l.etapa,
  l.decision_actual,
  l.prioridad,
  l.fecha_ultima_revision,
  l.siguiente_accion,

  -- Urbanización (agregado)
  COALESCE(ua.urbanizacion_avance_pct_avg, 0)::numeric(5,2) AS urbanizacion_avance_pct,
  ua.urbanizacion_fases_count,
  ua.urbanizacion_fases_completas,
  ua.urbanizacion_fecha_inicio_min      AS urbanizacion_fecha_inicio,
  ua.urbanizacion_fecha_terminacion_max AS urbanizacion_fecha_terminacion,

  -- Construcción (única activa por lote vía UNIQUE parcial)
  cl.id                       AS construccion_id,
  cl.prototipo_id             AS construccion_prototipo_id,
  cl.etapa_construccion_id,
  cl.fecha_inicio_obra,
  cl.fecha_estimada_entrega,
  cl.fecha_real_entrega,
  COALESCE(cl.avance_pct, 0)::numeric(5,2) AS construccion_avance_pct,
  cl.contratista_principal_id,
  cl.presupuesto_asignado,
  cl.costo_acumulado,

  -- Estatus unificado derivado
  CASE
    WHEN cl.id IS NOT NULL AND COALESCE(cl.avance_pct, 0) >= 100 THEN 'construido'
    WHEN cl.id IS NOT NULL                                       THEN 'construyendo'
    WHEN ua.lote_id IS NOT NULL
         AND ua.urbanizacion_fases_count > 0
         AND ua.urbanizacion_fases_completas = ua.urbanizacion_fases_count
                                                                 THEN 'urbanizado'
    WHEN ua.lote_id IS NOT NULL                                  THEN 'urbanizando'
    ELSE                                                              'disponible'
  END AS estatus_unificado,

  l.created_at,
  l.updated_at
FROM dilesa.lotes l
LEFT JOIN dilesa.prototipos p
  ON p.id = l.prototipo_asignado_id AND p.deleted_at IS NULL
LEFT JOIN urb_agg ua
  ON ua.lote_id = l.id
LEFT JOIN dilesa.construccion_lote cl
  ON cl.lote_id = l.id AND cl.deleted_at IS NULL
WHERE l.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_lotes_estatus IS
  'Estatus consolidado por lote: agrega urbanización (promedio sobre fases) + construcción activa + estatus_unificado (disponible/urbanizando/urbanizado/construyendo/construido). Los estatus de venta/escrituración se agregan en sprints dilesa-4 y dilesa-5. security_invoker=on.';
