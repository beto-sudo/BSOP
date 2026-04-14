-- ============================================================
-- Fix duplicate cortes in erp.cortes_caja
-- Root cause: rdb.upsert_corte inserted new rows instead of true upsert
-- ============================================================

-- 1) Replace upsert_corte with a real upsert
DROP FUNCTION IF EXISTS rdb.upsert_corte CASCADE;

CREATE OR REPLACE FUNCTION rdb.upsert_corte(
  p_coda_id              TEXT    DEFAULT NULL,
  p_corte_nombre         TEXT    DEFAULT NULL,
  p_caja_nombre          TEXT    DEFAULT NULL,
  p_estado               TEXT    DEFAULT NULL,
  p_turno                TEXT    DEFAULT NULL,
  p_responsable_apertura TEXT    DEFAULT NULL,
  p_responsable_cierre   TEXT    DEFAULT NULL,
  p_observaciones        TEXT    DEFAULT NULL,
  p_efectivo_inicial     NUMERIC DEFAULT NULL,
  p_efectivo_contado     NUMERIC DEFAULT NULL,
  p_hora_inicio          TIMESTAMPTZ DEFAULT NULL,
  p_hora_fin             TIMESTAMPTZ DEFAULT NULL,
  p_fecha_operativa      DATE    DEFAULT NULL,
  p_tipo                 TEXT    DEFAULT 'normal'
)
RETURNS erp.cortes_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, rdb, public
AS $$
DECLARE
  v_result     erp.cortes_caja;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_estado     TEXT;
BEGIN
  v_estado := CASE LOWER(COALESCE(p_estado, ''))
    WHEN 'cerrado' THEN 'cerrado'
    WHEN 'abierto' THEN 'abierto'
    WHEN 'validado' THEN 'validado'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE CASE WHEN p_hora_fin IS NOT NULL THEN 'cerrado' ELSE 'abierto' END
  END;

  -- First try by coda_id embedded in observaciones
  IF p_coda_id IS NOT NULL THEN
    SELECT * INTO v_result
    FROM erp.cortes_caja c
    WHERE c.empresa_id = v_empresa_id
      AND COALESCE(c.observaciones, '') ILIKE '%' || 'coda_id:' || p_coda_id || '%'
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;
  END IF;

  -- Fallback to natural key
  IF v_result.id IS NULL THEN
    SELECT * INTO v_result
    FROM erp.cortes_caja c
    WHERE c.empresa_id = v_empresa_id
      AND c.caja_nombre IS NOT DISTINCT FROM p_caja_nombre
      AND c.fecha_operativa IS NOT DISTINCT FROM p_fecha_operativa
      AND c.abierto_at IS NOT DISTINCT FROM p_hora_inicio
      AND c.cerrado_at IS NOT DISTINCT FROM p_hora_fin
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;
  END IF;

  IF v_result.id IS NOT NULL THEN
    UPDATE erp.cortes_caja c
    SET corte_nombre     = COALESCE(p_corte_nombre, c.corte_nombre),
        caja_nombre      = COALESCE(p_caja_nombre, c.caja_nombre),
        tipo             = COALESCE(NULLIF(p_tipo, ''), c.tipo),
        estado           = COALESCE(v_estado, c.estado),
        efectivo_inicial = COALESCE(p_efectivo_inicial, c.efectivo_inicial),
        efectivo_contado = COALESCE(p_efectivo_contado, c.efectivo_contado),
        observaciones    = CASE
          WHEN p_coda_id IS NOT NULL AND COALESCE(c.observaciones, '') NOT ILIKE '%' || 'coda_id:' || p_coda_id || '%'
            THEN trim(both ' ' from concat_ws(' | ', NULLIF(c.observaciones, ''), 'coda_id:' || p_coda_id))
          ELSE COALESCE(NULLIF(p_observaciones, ''), c.observaciones)
        END,
        fecha_operativa  = COALESCE(p_fecha_operativa, c.fecha_operativa),
        abierto_at       = COALESCE(p_hora_inicio, c.abierto_at),
        cerrado_at       = COALESCE(p_hora_fin, c.cerrado_at),
        updated_at       = now()
    WHERE c.id = v_result.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, observaciones,
      fecha_operativa, abierto_at, cerrado_at
    ) VALUES (
      v_empresa_id,
      p_caja_nombre,
      COALESCE(p_corte_nombre, 'Corte-' || COALESCE(p_caja_nombre, 'Sin Caja')),
      COALESCE(NULLIF(CASE WHEN p_tipo = 'sin_corte' THEN 'normal' ELSE p_tipo END, ''), 'normal'),
      v_estado,
      COALESCE(p_efectivo_inicial, 0),
      p_efectivo_contado,
      trim(both ' ' from concat_ws(' | ', NULLIF(p_observaciones, ''), CASE WHEN p_coda_id IS NOT NULL THEN 'coda_id:' || p_coda_id END)),
      p_fecha_operativa,
      p_hora_inicio,
      p_hora_fin
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION rdb.upsert_corte TO service_role, authenticated;

-- 2) Consolidate existing duplicates, keep the canonical row per natural key
WITH ranked AS (
  SELECT
    c.id,
    first_value(c.id) OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS rn
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE rdb.waitry_pedidos wp
SET corte_id = d.keep_id
FROM dupes d
WHERE wp.corte_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    c.id,
    first_value(c.id) OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS rn
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE erp.movimientos_caja mc
SET corte_id = d.keep_id
FROM dupes d
WHERE mc.corte_id = d.duplicate_id
  AND mc.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;

WITH ranked AS (
  SELECT
    c.id,
    first_value(c.id) OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS rn
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE erp.corte_conteo_denominaciones ccd
SET corte_id = d.keep_id
FROM dupes d
WHERE ccd.corte_id = d.duplicate_id
  AND ccd.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.empresa_id, c.caja_nombre, c.fecha_operativa, c.abierto_at, COALESCE(c.cerrado_at, 'infinity'::timestamptz)
      ORDER BY
        (SELECT COUNT(*) FROM rdb.waitry_pedidos wp WHERE wp.corte_id = c.id) DESC,
        (SELECT COUNT(*) FROM erp.movimientos_caja mc WHERE mc.corte_id = c.id AND mc.empresa_id = c.empresa_id) DESC,
        CASE WHEN c.estado = 'cerrado' THEN 1 ELSE 0 END DESC,
        c.created_at ASC,
        c.id ASC
    ) AS rn
  FROM erp.cortes_caja c
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
)
DELETE FROM erp.cortes_caja c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 3) Prevent future exact duplicates on natural key
CREATE UNIQUE INDEX IF NOT EXISTS erp_cortes_caja_natural_key_idx
ON erp.cortes_caja (
  empresa_id,
  caja_nombre,
  fecha_operativa,
  abierto_at,
  COALESCE(cerrado_at, 'infinity'::timestamptz)
);

NOTIFY pgrst, 'reload schema';
