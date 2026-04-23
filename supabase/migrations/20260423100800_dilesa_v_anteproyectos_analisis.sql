-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.v_anteproyectos_analisis
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vista de análisis financiero del anteproyecto. Expone:
--
--   • Herencia de terreno: area_terreno_m2, valor_predio, areas_aprovechables
--   • Aprovechamiento: aprovechamiento_pct, porcentaje_areas_verdes,
--     vialidades_banquetas_m2
--   • Precio neto: precio_m2_aprovechable (incluye infraestructura cabecera)
--   • Referencias financieras: promedios de los prototipos vinculados vía
--     anteproyectos_prototipos_referencia (valor_comercial, 6 costos + total)
--   • Proyección: cada referencia × cantidad_lotes → valor_comercial_proyecto,
--     costo_total_proyecto, utilidad_proyecto, margen_pct
--
-- security_invoker=on: la vista respeta el RLS del usuario que la consulta,
-- así anteproyectos y prototipos solo visibles para su empresa.
--
-- Reemplaza las 12+ fórmulas de Coda en la tabla Anteproyectos (cols 10-34
-- del deep dive §3). El recálculo es dinámico — si se edita un prototipo
-- referenciado, el análisis financiero se actualiza en el siguiente query.

CREATE OR REPLACE VIEW dilesa.v_anteproyectos_analisis
WITH (security_invoker = on) AS
WITH proto_ref AS (
  SELECT
    ref.anteproyecto_id,
    AVG(p.valor_comercial)        AS valor_comercial_ref,
    AVG(p.costo_urbanizacion)     AS costo_urbanizacion_ref,
    AVG(p.costo_materiales)       AS costo_materiales_ref,
    AVG(p.costo_mano_obra)        AS costo_mano_obra_ref,
    AVG(p.costo_registro_ruv)     AS costo_registro_ruv_ref,
    AVG(p.seguro_calidad)         AS seguro_calidad_ref,
    AVG(p.costo_comercializacion) AS costo_comercializacion_ref,
    AVG(p.costo_total_unitario)   AS costo_total_ref,
    COUNT(*)                      AS prototipos_referenciados
  FROM dilesa.anteproyectos_prototipos_referencia ref
  JOIN dilesa.prototipos p ON p.id = ref.prototipo_id AND p.deleted_at IS NULL
  GROUP BY ref.anteproyecto_id
)
SELECT
  a.id,
  a.empresa_id,
  a.nombre,
  a.clave_interna,
  a.terreno_id,
  a.tipo_proyecto_id,
  a.estado,
  a.etapa,
  a.decision_actual,
  a.prioridad,
  a.responsable_id,
  a.fecha_inicio,
  a.fecha_ultima_revision,
  a.siguiente_accion,
  a.motivo_no_viable,
  a.plano_lotificacion_url,
  a.proyecto_id,
  a.convertido_a_proyecto_en,
  a.convertido_a_proyecto_por,

  -- Inputs físicos
  a.area_vendible_m2,
  a.areas_verdes_m2,
  a.cantidad_lotes,
  a.infraestructura_cabecera_inversion,
  a.lote_promedio_m2,

  -- Herencia de terreno
  t.area_terreno_m2,
  t.areas_aprovechables_m2,
  t.valor_predio,

  -- Aprovechamiento
  CASE
    WHEN COALESCE(t.area_terreno_m2, 0) = 0 THEN NULL
    ELSE a.area_vendible_m2 / t.area_terreno_m2
  END AS aprovechamiento_pct,
  CASE
    WHEN COALESCE(t.area_terreno_m2, 0) = 0 THEN NULL
    ELSE a.areas_verdes_m2 / t.area_terreno_m2
  END AS porcentaje_areas_verdes,
  (COALESCE(t.area_terreno_m2, 0) - COALESCE(a.area_vendible_m2, 0) - COALESCE(a.areas_verdes_m2, 0))
    AS vialidades_banquetas_m2,

  -- Precio neto por m² aprovechable (incluye infraestructura cabecera)
  CASE
    WHEN COALESCE(t.areas_aprovechables_m2, 0) = 0 THEN NULL
    ELSE (COALESCE(t.valor_predio, 0) + COALESCE(a.infraestructura_cabecera_inversion, 0))
         / t.areas_aprovechables_m2
  END AS precio_m2_aprovechable,

  -- Referencias financieras (promedio de prototipos)
  pr.prototipos_referenciados,
  pr.valor_comercial_ref,
  pr.costo_urbanizacion_ref,
  pr.costo_materiales_ref,
  pr.costo_mano_obra_ref,
  pr.costo_registro_ruv_ref,
  pr.seguro_calidad_ref,
  pr.costo_comercializacion_ref,
  pr.costo_total_ref,

  -- Proyección (referencia × cantidad_lotes)
  pr.valor_comercial_ref * a.cantidad_lotes AS valor_comercial_proyecto,
  pr.costo_total_ref     * a.cantidad_lotes AS costo_total_proyecto,
  (pr.valor_comercial_ref - pr.costo_total_ref) * a.cantidad_lotes AS utilidad_proyecto,
  CASE
    WHEN COALESCE(pr.valor_comercial_ref, 0) = 0 THEN NULL
    ELSE (pr.valor_comercial_ref - pr.costo_total_ref) / pr.valor_comercial_ref
  END AS margen_pct,

  a.created_at,
  a.updated_at
FROM dilesa.anteproyectos a
JOIN dilesa.terrenos t ON t.id = a.terreno_id AND t.deleted_at IS NULL
LEFT JOIN proto_ref pr ON pr.anteproyecto_id = a.id
WHERE a.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_anteproyectos_analisis IS
  'Análisis financiero dinámico del anteproyecto (aprovechamiento, promedios de prototipos, utilidad, margen). security_invoker=on respeta RLS del usuario.';
