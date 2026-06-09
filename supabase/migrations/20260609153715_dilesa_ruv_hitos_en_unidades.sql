-- ============================================================================
-- DILESA · RUV v1.1 — los hitos del trámite se mueven a dilesa.unidades
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv`. Los hitos DTU / Extracción / Seguro de Calidad /
-- Paquete RUV son del trámite por vivienda y deben poder marcarse para CUALQUIER
-- lote del frente (incluidos los sin obra). Vivían solo en construccion.fecha_*
-- (no cubre lotes sin construcción ni trajo todas las fechas), por lo que el
-- comparativo encontró 193 fechas de extracción + 325 de paquete ausentes en
-- BSOP. Mismo patrón que cuv/frente_id: el hogar canónico es `dilesa.unidades`.
-- (Estas columnas no se usan en código fuera de RUV — verificado.)
--
--   1. unidades.fecha_dtu / fecha_extraccion / fecha_seguro_calidad / fecha_paquete_ruv
--   2. Backfill desde construccion (lo ya migrado); el import completa desde Coda.
--   3. v_ruv_frente_avance: cuenta los hitos desde unidades.
-- ============================================================================

BEGIN;

ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS fecha_dtu date,
  ADD COLUMN IF NOT EXISTS fecha_extraccion date,
  ADD COLUMN IF NOT EXISTS fecha_seguro_calidad date,
  ADD COLUMN IF NOT EXISTS fecha_paquete_ruv date;

COMMENT ON COLUMN dilesa.unidades.fecha_dtu IS 'RUV: fecha de liberación del DTU del lote/vivienda. Fuente canónica (antes en construccion.fecha_dtu).';
COMMENT ON COLUMN dilesa.unidades.fecha_extraccion IS 'RUV: fecha de extracción del lote/vivienda.';
COMMENT ON COLUMN dilesa.unidades.fecha_seguro_calidad IS 'RUV: fecha de pago del seguro de calidad del lote/vivienda.';
COMMENT ON COLUMN dilesa.unidades.fecha_paquete_ruv IS 'RUV: fecha del paquete RUV del lote/vivienda.';

-- Backfill desde construccion (lo ya migrado de Coda); el import completa el resto.
UPDATE dilesa.unidades u
SET fecha_dtu = c.fecha_dtu,
    fecha_extraccion = c.fecha_extraccion,
    fecha_seguro_calidad = c.fecha_seguro_calidad,
    fecha_paquete_ruv = c.fecha_paquete_ruv
FROM dilesa.construccion c
WHERE c.unidad_id = u.id
  AND c.deleted_at IS NULL
  AND (c.fecha_dtu IS NOT NULL OR c.fecha_extraccion IS NOT NULL
       OR c.fecha_seguro_calidad IS NOT NULL OR c.fecha_paquete_ruv IS NOT NULL);

-- Vista: los hitos ahora se cuentan desde unidades (completos).
DROP VIEW IF EXISTS dilesa.v_ruv_frente_avance;
CREATE VIEW dilesa.v_ruv_frente_avance WITH (security_invoker = on) AS
SELECT
  f.id AS frente_id, f.empresa_id, f.proyecto_id, f.nombre, f.viviendas_oferta,
  u.lotes, u.cuvs_emitidos, u.con_dtu, u.con_seguro_calidad, u.con_paquete_ruv,
  c.viviendas,
  d.documentos_pendientes,
  CASE WHEN f.viviendas_oferta > 0
       THEN round(100.0 * u.con_paquete_ruv / f.viviendas_oferta, 1)
       ELSE NULL END AS pct_paquete_ruv
FROM dilesa.ruv_frentes f
LEFT JOIN LATERAL (
  SELECT
    count(*) AS lotes,
    count(*) FILTER (WHERE uu.cuv ~ '^\d{16}$') AS cuvs_emitidos,
    count(*) FILTER (WHERE uu.fecha_dtu IS NOT NULL) AS con_dtu,
    count(*) FILTER (WHERE uu.fecha_seguro_calidad IS NOT NULL) AS con_seguro_calidad,
    count(*) FILTER (WHERE uu.fecha_paquete_ruv IS NOT NULL) AS con_paquete_ruv
  FROM dilesa.unidades uu
  WHERE uu.frente_id = f.id AND uu.deleted_at IS NULL
) u ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS viviendas
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
  'Avance del trámite RUV por frente: lotes, CUVs, DTU, seguro de calidad y paquete RUV (todos desde unidades), viviendas en construcción y documentos pendientes.';

NOTIFY pgrst, 'reload schema';

COMMIT;
