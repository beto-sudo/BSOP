-- Migration: agregar columnas de costos de referencia a dilesa.productos
-- y costo_materiales a dilesa.construccion.
--
-- Contexto: el análisis financiero de anteproyectos compara costos de
-- referencia (de un prototipo existente) vs costos proyectados. Hoy solo
-- existe valor_comercial_referencia en productos; los otros 6 conceptos
-- (urbanización, materiales, MO, RUV, seguro calidad, comercialización)
-- no tienen columna y no se auto-populan al seleccionar prototipo.
--
-- Fase 1:
--   1) Agrega costo_materiales a construccion (captura manual por obra,
--      como existía en Coda).
--   2) Agrega 6 columnas *_referencia a productos.
--   3) Backfill de las columnas derivables:
--      - costo_mo_referencia = avg(valor_contrato_mo) de obras terminadas
--      - costo_urbanizacion_referencia = proyecto.costo_urbanizacion / lotes
--      - costo_comercializacion_referencia = 2% del valor_comercial_referencia

-- ── 1. costo_materiales en construccion ─────────────────────────────────
ALTER TABLE dilesa.construccion
  ADD COLUMN IF NOT EXISTS costo_materiales numeric(14,2);

COMMENT ON COLUMN dilesa.construccion.costo_materiales IS
  'Costo total de materiales de la obra. Captura manual (equivalente a "Costo Materiales" de Coda grid-CkajhVirlg).';

-- ── 2. Columnas de referencia en productos ──────────────────────────────
ALTER TABLE dilesa.productos
  ADD COLUMN IF NOT EXISTS costo_urbanizacion_referencia numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_materiales_referencia numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_mo_referencia numeric(14,2),
  ADD COLUMN IF NOT EXISTS registro_ruv_referencia numeric(14,2),
  ADD COLUMN IF NOT EXISTS seguro_calidad_referencia numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_comercializacion_referencia numeric(14,2);

-- ── 3. Backfill: MO referencia ──────────────────────────────────────────
-- Promedio de valor_contrato_mo de obras terminadas por producto.
UPDATE dilesa.productos p
SET costo_mo_referencia = sub.avg_mo
FROM (
  SELECT c.producto_id,
         round(avg(c.valor_contrato_mo), 2) AS avg_mo
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado IN ('terminada','dtu','seguro_calidad','extraida')
    AND c.valor_contrato_mo IS NOT NULL
    AND c.valor_contrato_mo > 0
  GROUP BY c.producto_id
) sub
WHERE p.id = sub.producto_id
  AND p.deleted_at IS NULL;

-- ── 4. Backfill: urbanización referencia ────────────────────────────────
-- Costo de urbanización del proyecto padre prorrateado entre lotes.
UPDATE dilesa.productos p
SET costo_urbanizacion_referencia = sub.urb_por_lote
FROM (
  SELECT pr.id AS proyecto_id,
         round(pr.costo_urbanizacion / NULLIF(cnt.n, 0), 2) AS urb_por_lote
  FROM dilesa.proyectos pr
  JOIN LATERAL (
    SELECT count(*) AS n
    FROM dilesa.unidades u
    WHERE u.proyecto_id = pr.id AND u.deleted_at IS NULL
  ) cnt ON true
  WHERE pr.deleted_at IS NULL
    AND pr.costo_urbanizacion IS NOT NULL
    AND pr.costo_urbanizacion > 0
    AND cnt.n > 0
) sub
WHERE p.proyecto_id = sub.proyecto_id
  AND p.deleted_at IS NULL;

-- ── 5. Backfill: comercialización referencia ────────────────────────────
-- 2% del valor comercial de referencia.
UPDATE dilesa.productos
SET costo_comercializacion_referencia = round(valor_comercial_referencia * 0.02, 2)
WHERE deleted_at IS NULL
  AND valor_comercial_referencia IS NOT NULL
  AND valor_comercial_referencia > 0;

NOTIFY pgrst, 'reload schema';
