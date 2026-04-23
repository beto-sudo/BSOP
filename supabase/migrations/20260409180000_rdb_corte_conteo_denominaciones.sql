-- EDITED 2026-04-23 (drift-1.5): rdb.cortes is ambient. CREATE TABLE
-- references rdb.cortes(id) via FK; skip the whole migration on a fresh DB
-- (production has both the table and the view).
-- ============================================================
-- Tabla rdb.corte_conteo_denominaciones
-- Registra el conteo físico de billetes y monedas al cierre.
-- El total se calcula: SUM(denominacion * cantidad)
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.cortes') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS rdb.corte_conteo_denominaciones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corte_id    UUID NOT NULL REFERENCES rdb.cortes(id) ON DELETE CASCADE,
    denominacion NUMERIC(10,2) NOT NULL,
    tipo        TEXT NOT NULL CHECK (tipo IN ('billete','moneda')),
    cantidad    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    subtotal    NUMERIC(12,2) GENERATED ALWAYS AS (denominacion * cantidad) STORED,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corte_id, denominacion)
  );

  CREATE INDEX IF NOT EXISTS rdb_corte_conteo_corte_id_idx
    ON rdb.corte_conteo_denominaciones (corte_id);

  GRANT SELECT, INSERT, UPDATE, DELETE ON rdb.corte_conteo_denominaciones TO service_role, authenticated;
  GRANT SELECT ON rdb.corte_conteo_denominaciones TO anon;

  EXECUTE $sql$
    CREATE OR REPLACE VIEW rdb.v_corte_conteo_totales AS
    SELECT
      corte_id,
      SUM(subtotal) AS total_contado,
      jsonb_object_agg(
        denominacion::text,
        jsonb_build_object('cantidad', cantidad, 'subtotal', subtotal, 'tipo', tipo)
        ORDER BY denominacion DESC
      ) AS detalle
    FROM rdb.corte_conteo_denominaciones
    GROUP BY corte_id
  $sql$;

  GRANT SELECT ON rdb.v_corte_conteo_totales TO anon, authenticated, service_role;
END $do$;
