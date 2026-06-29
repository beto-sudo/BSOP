-- Capa de datos del radar de cuellos por fase (DILESA · Ventas)
-- — iniciativa dilesa-fluidez-pipeline, Sprint 2a.
--
-- Mide cuánto tarda el pipeline en CADA fase para detectar dónde se atora el
-- proceso. Tres objetos, todos `security_invoker` (RLS por empresa):
--
-- 1. v_venta_fase_duraciones — duración limpia por tramo (fase → fase siguiente
--    por POSICIÓN). Expone flags de suciedad sin filtrar (cada consumidor decide):
--      · es_tramo_abierto = última fase alcanzada (sin siguiente) → no es duración.
--      · es_negativo      = la fase siguiente tiene fecha anterior (inconsistencia
--                           de la migración Coda: el orden por posición ≠ fecha).
--    El mismo-día (0 días) es duración válida (fase express), NO se marca.
--
-- 2. v_fase_benchmark — referencia histórica estable por fase: mediana y p90 sobre
--    TODOS los tramos limpios (excluye abiertos, negativos y fases 15–17). Es la
--    "vara" contra la que se mide cada periodo (la meta editable de S3 la sustituye).
--    Fases 15–17 (Entregada / Conformidad / Operación Terminada) se excluyen: son
--    cierre post-entrega, contaminadas por el sellado en bloque de la migración
--    (Entregada→Conformidad da mediana ~1535 d artificial). El radar v1 cubre el
--    pipeline de venta real (fases 1–14).
--
-- 3. fn_fase_calificacion(empresa, desde, hasta) — RPC que devuelve, por fase, la
--    mediana/p90/n de los tramos CERRADOS en el periodo (filtra por fecha_salida).
--    Permite el corte por mes/trimestre/semestre/año sin traer las ~14k filas de
--    tramos al cliente. SECURITY INVOKER → respeta el RLS del que llama.

BEGIN;

-- 1) Duración por tramo (fase → siguiente fase por posición).
CREATE OR REPLACE VIEW dilesa.v_venta_fase_duraciones
WITH (security_invoker = true) AS
WITH seq AS (
  SELECT
    vf.empresa_id,
    vf.venta_id,
    vf.posicion,
    vf.fase,
    vf.fecha,
    v.tipo_credito,
    v.estado,
    u.proyecto_id,
    LEAD(vf.fecha) OVER w AS fecha_sig,
    LEAD(vf.posicion) OVER w AS pos_sig
  FROM dilesa.venta_fases vf
  JOIN dilesa.ventas v ON v.id = vf.venta_id AND v.deleted_at IS NULL
  LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
  WHERE vf.deleted_at IS NULL AND vf.fecha IS NOT NULL
  WINDOW w AS (PARTITION BY vf.venta_id ORDER BY vf.posicion)
)
SELECT
  empresa_id,
  venta_id,
  posicion,
  fase,
  tipo_credito,
  estado,
  proyecto_id,
  fecha AS fecha_entrada,
  fecha_sig AS fecha_salida,
  (fecha_sig - fecha)::int AS dias_en_fase,
  (fecha_sig IS NULL) AS es_tramo_abierto,
  (fecha_sig IS NOT NULL AND fecha_sig < fecha) AS es_negativo
FROM seq;

COMMENT ON VIEW dilesa.v_venta_fase_duraciones IS
  'Duración por tramo (fase→siguiente por posición) con flags es_tramo_abierto/es_negativo. Base del radar de fluidez (dilesa-fluidez-pipeline S2).';

-- 2) Benchmark histórico estable por fase (la vara; fases 1–14).
CREATE OR REPLACE VIEW dilesa.v_fase_benchmark
WITH (security_invoker = true) AS
SELECT
  empresa_id,
  posicion,
  fase,
  count(*) AS n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_en_fase)::numeric(8, 1) AS mediana,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY dias_en_fase)::numeric(8, 1) AS p90
FROM dilesa.v_venta_fase_duraciones
WHERE NOT es_tramo_abierto
  AND NOT es_negativo
  AND posicion <= 14
GROUP BY empresa_id, posicion, fase;

COMMENT ON VIEW dilesa.v_fase_benchmark IS
  'Mediana/p90/n histórico por fase (tramos limpios, fases 1–14). Referencia estable del radar de fluidez (dilesa-fluidez-pipeline S2).';

-- 3) RPC: calificación por fase en un periodo (tramos cerrados en [desde, hasta]).
CREATE OR REPLACE FUNCTION dilesa.fn_fase_calificacion(
  p_empresa uuid,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(posicion int, fase text, n bigint, mediana numeric, p90 numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    d.posicion,
    d.fase,
    count(*) AS n,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY d.dias_en_fase)::numeric(8, 1) AS mediana,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY d.dias_en_fase)::numeric(8, 1) AS p90
  FROM dilesa.v_venta_fase_duraciones d
  WHERE d.empresa_id = p_empresa
    AND NOT d.es_tramo_abierto
    AND NOT d.es_negativo
    AND d.posicion <= 14
    AND (p_desde IS NULL OR d.fecha_salida >= p_desde)
    AND (p_hasta IS NULL OR d.fecha_salida <= p_hasta)
  GROUP BY d.posicion, d.fase;
$$;

COMMENT ON FUNCTION dilesa.fn_fase_calificacion(uuid, date, date) IS
  'Por fase, mediana/p90/n de tramos cerrados en [desde,hasta]. Radar de fluidez con corte temporal (dilesa-fluidez-pipeline S2).';

-- Función no privilegiada (SECURITY INVOKER): nadie por default, solo usuarios
-- autenticados (el RLS de la vista subyacente acota por empresa).
REVOKE ALL ON FUNCTION dilesa.fn_fase_calificacion(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_fase_calificacion(uuid, date, date) TO authenticated;

-- Recarga el cache de PostgREST para exponer vistas + RPC vía la API.
NOTIFY pgrst, 'reload schema';

COMMIT;
