-- ============================================================================
-- DILESA · RUV Sprint 4 — la liga lote→frente se mueve a dilesa.unidades
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv`. El alta de frentes selecciona LOTES (existan o no en
-- construcción), así que la liga correcta vive en el lote (`dilesa.unidades`),
-- no en `dilesa.construccion` (que solo existe cuando hay obra).
--
--   1. dilesa.unidades.frente_id (FK → ruv_frentes) — liga canónica lote→frente
--   2. Backfill: propaga la liga actual de construccion.frente_id → unidades
--      (el import refinará con TODOS los lotes desde Coda Inventario).
--   3. Reescribe v_ruv_frente_avance para derivar de unidades ⋈ construccion.
--   4. Deprecación: drop dilesa.construccion.frente_id (unidades es la fuente).
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- 1. Liga canónica lote → frente
ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS frente_id uuid
    REFERENCES dilesa.ruv_frentes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS unidades_frente_id_idx
  ON dilesa.unidades (frente_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN dilesa.unidades.frente_id IS
  'Oferta RUV (dilesa.ruv_frentes) a la que pertenece el lote/vivienda. Fuente canónica de la pertenencia lote→frente (un lote pertenece a un solo frente). El import la puebla desde la columna "Frente RUV" de Coda Inventario.';

-- 2. Backfill inicial: propagar lo que ya estaba en construccion.frente_id.
-- (El import del Sprint 4 lo completa con los lotes sin construcción.)
UPDATE dilesa.unidades u
SET frente_id = c.frente_id
FROM dilesa.construccion c
WHERE c.unidad_id = u.id
  AND c.frente_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND u.frente_id IS NULL;

-- 3. Vista de avance: ahora deriva de unidades (lotes del frente) ⋈ construccion.
-- DROP + CREATE (no REPLACE) porque cambia el set de columnas (agrega `lotes`).
DROP VIEW IF EXISTS dilesa.v_ruv_frente_avance;
CREATE VIEW dilesa.v_ruv_frente_avance WITH (security_invoker = on) AS
SELECT
  f.id           AS frente_id,
  f.empresa_id,
  f.proyecto_id,
  f.nombre,
  f.viviendas_oferta,
  l.lotes,
  c.viviendas,
  c.cuvs_emitidos,
  c.con_dtu,
  c.con_seguro_calidad,
  c.con_paquete_ruv,
  d.documentos_pendientes,
  CASE
    WHEN f.viviendas_oferta > 0
    THEN round(100.0 * c.con_paquete_ruv / f.viviendas_oferta, 1)
    ELSE NULL
  END AS pct_paquete_ruv
FROM dilesa.ruv_frentes f
LEFT JOIN LATERAL (
  SELECT count(*) AS lotes
  FROM dilesa.unidades uu
  WHERE uu.frente_id = f.id AND uu.deleted_at IS NULL
) l ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                    AS viviendas,
    count(*) FILTER (WHERE cc.cuv ~ '^\d{16}$')                 AS cuvs_emitidos,
    count(*) FILTER (WHERE cc.fecha_dtu IS NOT NULL)            AS con_dtu,
    count(*) FILTER (WHERE cc.fecha_seguro_calidad IS NOT NULL) AS con_seguro_calidad,
    count(*) FILTER (WHERE cc.fecha_paquete_ruv IS NOT NULL)    AS con_paquete_ruv
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
  'Avance del trámite RUV por frente: lotes ligados, viviendas en construcción, CUVs, DTU, seguro de calidad, paquete RUV y documentos pendientes. Deriva de dilesa.unidades (frente_id) ⋈ dilesa.construccion + dilesa.ruv_frente_documentos.';

-- 4. Deprecación de dilesa.construccion.frente_id: la vista y la app ya usan
-- unidades.frente_id como fuente única. NO se dropea la columna aquí (acto
-- destructivo en prod → requiere confirmación explícita de Beto en un PR
-- aparte). Queda como vestigio inofensivo, sincronizado por el backfill del
-- paso 2 pero sin lectores.

-- 5. Inicializar el checklist (27 docs en 'pendiente') para los frentes que ya
-- existen — los nuevos lo inicializan en la server action de alta. Idempotente.
INSERT INTO dilesa.ruv_frente_documentos (empresa_id, frente_id, documento_catalogo_id, estado)
SELECT f.empresa_id, f.id, c.id, 'pendiente'
FROM dilesa.ruv_frentes f
JOIN dilesa.ruv_documentos_catalogo c ON c.empresa_id = f.empresa_id AND c.activo
WHERE f.deleted_at IS NULL
ON CONFLICT (frente_id, documento_catalogo_id) WHERE deleted_at IS NULL DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
