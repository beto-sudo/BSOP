-- ============================================================================
-- DILESA · RUV — el CUV se mueve a dilesa.unidades (cutoff de Coda)
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv`. El comparativo Coda↔BSOP reveló que 166 CUVs de Coda
-- no estaban en BSOP: el CUV solo vivía en `construccion.cuv`, que existe únicamente
-- para viviendas con obra — los lotes con CUV pero sin construcción quedaban fuera.
-- Mismo patrón que `frente_id`: el CUV es atributo del lote/vivienda y persiste
-- con o sin obra, así que su hogar canónico es `dilesa.unidades.cuv`.
--
--   1. dilesa.unidades.cuv (text) — el import lo puebla desde Coda Inventario.
--   2. Backfill inicial desde construccion.cuv (lo ya migrado).
--   3. v_ruv_frente_avance: cuvs_emitidos ahora cuenta unidades.cuv (más completo).
-- ============================================================================

BEGIN;

-- 1. Columna + índice de búsqueda (no único: la unicidad la valida el reconcile;
-- un CUV repetido en Coda sería un error de datos, no una constraint que rompa
-- el backfill).
ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS cuv text;

CREATE INDEX IF NOT EXISTS unidades_cuv_idx
  ON dilesa.unidades (cuv) WHERE cuv IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN dilesa.unidades.cuv IS
  'Clave Única de Vivienda (INFONAVIT/RUV) del lote/vivienda. Hogar canónico del CUV (antes vivía solo en construccion.cuv, que no cubre lotes sin obra). El import lo puebla desde la columna CUV de Coda Inventario.';

-- 2. Backfill inicial desde construccion.cuv (lo ya migrado); el import completa
-- el resto desde Coda Inventario (incluye los lotes sin construcción).
UPDATE dilesa.unidades u
SET cuv = c.cuv
FROM dilesa.construccion c
WHERE c.unidad_id = u.id
  AND c.cuv ~ '^\d{16}$'
  AND c.deleted_at IS NULL
  AND u.cuv IS NULL;

-- 3. Vista: cuvs_emitidos cuenta unidades.cuv del frente (en vez de construccion).
DROP VIEW IF EXISTS dilesa.v_ruv_frente_avance;
CREATE VIEW dilesa.v_ruv_frente_avance WITH (security_invoker = on) AS
SELECT
  f.id AS frente_id, f.empresa_id, f.proyecto_id, f.nombre, f.viviendas_oferta,
  l.lotes, l.cuvs_emitidos,
  c.viviendas, c.con_dtu, c.con_seguro_calidad, c.con_paquete_ruv,
  d.documentos_pendientes,
  CASE WHEN f.viviendas_oferta > 0
       THEN round(100.0 * c.con_paquete_ruv / f.viviendas_oferta, 1)
       ELSE NULL END AS pct_paquete_ruv
FROM dilesa.ruv_frentes f
LEFT JOIN LATERAL (
  SELECT
    count(*) AS lotes,
    count(*) FILTER (WHERE uu.cuv ~ '^\d{16}$') AS cuvs_emitidos
  FROM dilesa.unidades uu
  WHERE uu.frente_id = f.id AND uu.deleted_at IS NULL
) l ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) AS viviendas,
    count(*) FILTER (WHERE cc.fecha_dtu IS NOT NULL) AS con_dtu,
    count(*) FILTER (WHERE cc.fecha_seguro_calidad IS NOT NULL) AS con_seguro_calidad,
    count(*) FILTER (WHERE cc.fecha_paquete_ruv IS NOT NULL) AS con_paquete_ruv
  FROM dilesa.unidades uu
  JOIN dilesa.construccion cc ON cc.unidad_id = uu.id AND cc.deleted_at IS NULL
  WHERE uu.frente_id = f.id AND uu.deleted_at IS NULL
) c ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE fd.estado = 'pendiente') AS documentos_pendientes
  FROM dilesa.ruv_frente_documentos fd
  WHERE fd.frente_id = f.id AND fd.deleted_at IS NULL
) d ON true
WHERE f.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_ruv_frente_avance IS
  'Avance del trámite RUV por frente: lotes, CUVs emitidos (unidades.cuv), viviendas en construcción, DTU, seguro de calidad, paquete RUV y documentos pendientes.';

NOTIFY pgrst, 'reload schema';

COMMIT;
