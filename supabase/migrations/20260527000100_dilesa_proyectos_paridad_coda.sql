-- Paridad de `dilesa.proyectos` con la tabla canónica de Coda
-- (`grid-SlvkPAfZNE`, 8 rows × 60 columnas).
--
-- Sprint A de la iniciativa `dilesa-proyectos-paridad-coda` (ver
-- docs/planning/dilesa-proyectos-paridad-coda.md).
--
-- Tres cambios:
-- 1. ALTER `dilesa.proyectos` agregando 4 columnas raw que estaban en
--    Coda pero faltaban en BSOP (todas nullable, cero rompe-cambios).
-- 2. UPDATE puntual de 3 desarrollos terminados (LV, LV2, LDV) que
--    seguían como `estado='ejecutando'` aunque su construcción y
--    ventas en Coda están al 100% / ~99%.
-- 3. CREATE VIEW `dilesa.v_proyecto_avances` que computa los
--    indicadores derivados que Coda tenía como fórmulas (avances %,
--    conteos por estado, ticket promedio, ventas totales, estado
--    sugerido).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) 4 columnas raw nuevas en `dilesa.proyectos`
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE dilesa.proyectos
  ADD COLUMN plano_oficial_url      text,
  ADD COLUMN image_url              text,
  ADD COLUMN acreditacion_escritura text,
  ADD COLUMN objetivo_trimestral    integer CHECK (objetivo_trimestral IS NULL OR objetivo_trimestral >= 0);

COMMENT ON COLUMN dilesa.proyectos.plano_oficial_url IS
  'URL al plano oficial del fraccionamiento (PDF/DWG). Sprint A de dilesa-proyectos-paridad-coda.';
COMMENT ON COLUMN dilesa.proyectos.image_url IS
  'URL a la imagen de portada del proyecto (render/foto). Sprint A de dilesa-proyectos-paridad-coda.';
COMMENT ON COLUMN dilesa.proyectos.acreditacion_escritura IS
  'Notas/referencia de la acreditación de escritura del proyecto. Sprint A de dilesa-proyectos-paridad-coda.';
COMMENT ON COLUMN dilesa.proyectos.objetivo_trimestral IS
  'Meta trimestral de escrituración (unidades). Base del KPI Cumplimiento. Sprint A de dilesa-proyectos-paridad-coda.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Reconciliar estados — los 3 desarrollos al 100% pasan a completado
-- ════════════════════════════════════════════════════════════════════════════
UPDATE dilesa.proyectos
SET estado = 'completado', updated_at = NOW()
WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND clave_interna IN ('LV', 'LV2', 'LDV')
  AND tipo = 'desarrollo'
  AND estado = 'ejecutando'
  AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Vista de avances derivados — reemplaza las 46 fórmulas de Coda
-- ════════════════════════════════════════════════════════════════════════════
-- Estados canónicos de `dilesa.unidades` (orden de ciclo de vida):
--   planeada → lote_urbanizado → en_construccion → terminada →
--   asignada → vendida → escriturada → entregada.
--
-- Reglas de avance (validadas contra Coda):
-- - avance_urb_pct  = unidades con estado ≠ planeada / total.
-- - avance_const_pct = unidades en {terminada, asignada, vendida,
--   escriturada, entregada} / total.
-- - avance_vts_pct  = unidades en {vendida, escriturada, entregada,
--   asignada} / total.
-- - estado_sugerido: 'completado' cuando const ≥ 100% Y vts ≥ 95%;
--   'ejecutando' en caso contrario. Para anteproyectos (sin unidades)
--   se preserva el estado actual.

CREATE OR REPLACE VIEW dilesa.v_proyecto_avances
WITH (security_invoker = on) AS
WITH u AS (
  SELECT
    proyecto_id,
    COUNT(*)                                                                                           AS total,
    COUNT(*) FILTER (WHERE estado IN ('terminada','asignada','vendida','escriturada','entregada'))    AS construidas,
    COUNT(*) FILTER (WHERE estado IN ('vendida','escriturada','entregada','asignada'))                AS vendidas,
    COUNT(*) FILTER (WHERE estado <> 'planeada')                                                       AS con_avance_urb,
    COUNT(*) FILTER (WHERE estado = 'terminada')                                                       AS terminadas,
    COUNT(*) FILTER (WHERE estado = 'en_construccion')                                                 AS en_construccion,
    COUNT(*) FILTER (WHERE estado = 'escriturada')                                                     AS escrituradas,
    AVG(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada') AND precio IS NOT NULL)  AS ticket_promedio,
    SUM(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada') AND precio IS NOT NULL)  AS ventas_totales
  FROM dilesa.unidades
  WHERE deleted_at IS NULL
  GROUP BY proyecto_id
)
SELECT
  p.id                                                                                 AS proyecto_id,
  p.empresa_id,
  COALESCE(u.total, 0)                                                                 AS lotes_total,
  COALESCE(u.construidas, 0)                                                           AS lotes_construidos,
  COALESCE(u.vendidas, 0)                                                              AS lotes_vendidos,
  COALESCE(u.con_avance_urb, 0)                                                        AS lotes_urbanizados,
  COALESCE(u.terminadas, 0)                                                            AS casas_terminadas,
  COALESCE(u.en_construccion, 0)                                                       AS casas_en_construccion,
  COALESCE(u.escrituradas, 0)                                                          AS casas_escrituradas,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.con_avance_urb / u.total, 2) END          AS avance_urb_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.construidas    / u.total, 2) END          AS avance_const_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.vendidas       / u.total, 2) END          AS avance_vts_pct,
  GREATEST(0, COALESCE(u.total, 0) - COALESCE(u.vendidas, 0))                          AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0)                                                        AS ventas_totales,
  -- Regla operativa: ambos avances ≥ 95% → completado. Captura la
  -- realidad de que BSOP cuenta unidades en estados intermedios
  -- (en_construccion, terminada) que Coda contaba como 100% completas.
  CASE
    WHEN u.total IS NULL OR u.total = 0 THEN p.estado
    WHEN (100.0 * u.construidas / u.total) >= 95
     AND (100.0 * u.vendidas    / u.total) >= 95
    THEN 'completado'
    ELSE 'ejecutando'
  END                                                                                  AS estado_sugerido,
  p.estado                                                                             AS estado_actual,
  p.tipo                                                                               AS tipo
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_proyecto_avances IS
  'Indicadores derivados de proyectos DILESA: avances %, conteos de unidades por estado, ticket promedio, ventas totales y estado sugerido. Reemplaza las 46 fórmulas de la tabla Proyectos en Coda. security_invoker=on respeta RLS de unidades + proyectos. Sprint A de dilesa-proyectos-paridad-coda.';

NOTIFY pgrst, 'reload schema';

COMMIT;
