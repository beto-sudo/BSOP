-- Regla de transición estricta: `completado` solo cuando 100% en ambos
-- avances. Si queda 1 unidad por vender, sigue `ejecutando`.
--
-- Corrección a la regla original del Sprint A (mismo iniciativa
-- `dilesa-proyectos-paridad-coda`). Beto pidió: "aunque quede una
-- vivienda por vender hay que marcarlo como ejecutando".
--
-- Cambios:
-- 1. Revert del UPDATE de la migración anterior — los 3 desarrollos
--    (LV, LV2, LDV) vuelven a `estado='ejecutando'` porque en BSOP
--    todavía les quedan unidades por vender (3, 6 y 10 respectivamente).
-- 2. CREATE OR REPLACE VIEW `dilesa.v_proyecto_avances` con la regla
--    estricta: solo `completado` cuando `u.construidas = u.total Y
--    u.vendidas = u.total`.
--
-- Implicación operativa: un proyecto pasa a `completado` solo cuando
-- TODAS sus unidades están en `terminada`/`asignada`/`vendida`/
-- `escriturada`/`entregada` (para const) Y todas están en `vendida`/
-- `escriturada`/`entregada`/`asignada` (para vts). El UPDATE manual
-- por el operador sigue siendo posible — la vista solo sugiere.

BEGIN;

-- 1) Revert de estados — LV/LV2/LDV vuelven a ejecutando.
UPDATE dilesa.proyectos
SET estado = 'ejecutando', updated_at = NOW()
WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND clave_interna IN ('LV', 'LV2', 'LDV')
  AND tipo = 'desarrollo'
  AND estado = 'completado'
  AND deleted_at IS NULL;

-- 2) Vista refinada con regla estricta.
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
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.construidas    / u.total, 2) END AS avance_const_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.vendidas       / u.total, 2) END AS avance_vts_pct,
  GREATEST(0, COALESCE(u.total, 0) - COALESCE(u.vendidas, 0))                          AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0)                                                        AS ventas_totales,
  -- Regla estricta: 100% en ambos. Si queda 1 unidad por vender,
  -- sigue ejecutando (decisión de Beto).
  CASE
    WHEN u.total IS NULL OR u.total = 0 THEN p.estado
    WHEN u.construidas = u.total
     AND u.vendidas    = u.total
    THEN 'completado'
    ELSE 'ejecutando'
  END                                                                                  AS estado_sugerido,
  p.estado                                                                             AS estado_actual,
  p.tipo                                                                               AS tipo
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_proyecto_avances IS
  'Indicadores derivados de proyectos DILESA. Regla estricta: estado_sugerido=completado solo cuando todas las unidades están construidas Y vendidas. Sprint A de dilesa-proyectos-paridad-coda (refinado).';

NOTIFY pgrst, 'reload schema';

COMMIT;
