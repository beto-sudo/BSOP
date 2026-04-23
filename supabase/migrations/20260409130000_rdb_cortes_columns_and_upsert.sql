-- EDITED 2026-04-23 (drift-1.5): rdb.cortes / rdb.cajas / rdb.waitry_pedidos
-- are ambient. Skip the entire migration on a fresh DB; production already
-- has the columns, function and view applied.
-- ============================================================
-- 1. Agregar columnas faltantes a rdb.cortes
--    (equivalentes a las que tenía caja.cortes)
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.cortes') IS NULL OR to_regclass('rdb.cajas') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE rdb.cortes
    ADD COLUMN IF NOT EXISTS coda_id      TEXT,
    ADD COLUMN IF NOT EXISTS corte_nombre TEXT,
    ADD COLUMN IF NOT EXISTS turno        TEXT,
    ADD COLUMN IF NOT EXISTS tipo         TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS observaciones TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS rdb_cortes_coda_id_idx
    ON rdb.cortes (coda_id)
    WHERE coda_id IS NOT NULL;

  EXECUTE $fn$
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
    RETURNS rdb.cortes
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = rdb, public
    AS $body$
    DECLARE
      v_caja_id UUID;
      v_result  rdb.cortes;
    BEGIN
      IF p_caja_nombre IS NOT NULL THEN
        SELECT id INTO v_caja_id
        FROM rdb.cajas
        WHERE nombre = p_caja_nombre
        LIMIT 1;

        IF v_caja_id IS NULL THEN
          INSERT INTO rdb.cajas (nombre)
          VALUES (p_caja_nombre)
          ON CONFLICT (nombre) DO NOTHING
          RETURNING id INTO v_caja_id;

          IF v_caja_id IS NULL THEN
            SELECT id INTO v_caja_id FROM rdb.cajas WHERE nombre = p_caja_nombre LIMIT 1;
          END IF;
        END IF;
      END IF;

      IF p_coda_id IS NOT NULL THEN
        INSERT INTO rdb.cortes (
          coda_id, corte_nombre, caja_id, caja_nombre,
          estado, turno, responsable_apertura, responsable_cierre,
          observaciones, efectivo_inicial, efectivo_contado,
          hora_inicio, hora_fin, fecha_operativa, tipo
        ) VALUES (
          p_coda_id, p_corte_nombre, v_caja_id, p_caja_nombre,
          p_estado, p_turno, p_responsable_apertura, p_responsable_cierre,
          p_observaciones, p_efectivo_inicial, p_efectivo_contado,
          p_hora_inicio, p_hora_fin, p_fecha_operativa, COALESCE(p_tipo, 'normal')
        )
        ON CONFLICT (coda_id) WHERE coda_id IS NOT NULL DO UPDATE SET
          corte_nombre         = COALESCE(EXCLUDED.corte_nombre,         rdb.cortes.corte_nombre),
          caja_id              = COALESCE(EXCLUDED.caja_id,              rdb.cortes.caja_id),
          caja_nombre          = COALESCE(EXCLUDED.caja_nombre,          rdb.cortes.caja_nombre),
          estado               = COALESCE(EXCLUDED.estado,               rdb.cortes.estado),
          turno                = COALESCE(EXCLUDED.turno,                rdb.cortes.turno),
          responsable_apertura = COALESCE(EXCLUDED.responsable_apertura, rdb.cortes.responsable_apertura),
          responsable_cierre   = COALESCE(EXCLUDED.responsable_cierre,   rdb.cortes.responsable_cierre),
          observaciones        = COALESCE(EXCLUDED.observaciones,        rdb.cortes.observaciones),
          efectivo_inicial     = COALESCE(EXCLUDED.efectivo_inicial,     rdb.cortes.efectivo_inicial),
          efectivo_contado     = COALESCE(EXCLUDED.efectivo_contado,     rdb.cortes.efectivo_contado),
          hora_inicio          = COALESCE(EXCLUDED.hora_inicio,          rdb.cortes.hora_inicio),
          hora_fin             = COALESCE(EXCLUDED.hora_fin,             rdb.cortes.hora_fin),
          fecha_operativa      = COALESCE(EXCLUDED.fecha_operativa,      rdb.cortes.fecha_operativa),
          tipo                 = COALESCE(EXCLUDED.tipo,                 rdb.cortes.tipo)
        RETURNING * INTO v_result;
      ELSE
        INSERT INTO rdb.cortes (
          coda_id, corte_nombre, caja_id, caja_nombre,
          estado, turno, responsable_apertura, responsable_cierre,
          observaciones, efectivo_inicial, efectivo_contado,
          hora_inicio, hora_fin, fecha_operativa, tipo
        ) VALUES (
          p_coda_id, p_corte_nombre, v_caja_id, p_caja_nombre,
          p_estado, p_turno, p_responsable_apertura, p_responsable_cierre,
          p_observaciones, p_efectivo_inicial, p_efectivo_contado,
          p_hora_inicio, p_hora_fin, p_fecha_operativa, COALESCE(p_tipo, 'normal')
        )
        ON CONFLICT (id) DO UPDATE SET
          corte_nombre         = COALESCE(EXCLUDED.corte_nombre,         rdb.cortes.corte_nombre),
          estado               = COALESCE(EXCLUDED.estado,               rdb.cortes.estado),
          efectivo_contado     = COALESCE(EXCLUDED.efectivo_contado,     rdb.cortes.efectivo_contado),
          hora_fin             = COALESCE(EXCLUDED.hora_fin,             rdb.cortes.hora_fin),
          responsable_cierre   = COALESCE(EXCLUDED.responsable_cierre,   rdb.cortes.responsable_cierre)
        RETURNING * INTO v_result;
      END IF;

      RETURN v_result;
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION rdb.upsert_corte TO service_role, authenticated;

  IF to_regclass('rdb.waitry_pedidos') IS NOT NULL THEN
    DROP VIEW IF EXISTS rdb.v_cortes_lista;

    EXECUTE $sql$
      CREATE VIEW rdb.v_cortes_lista AS
      SELECT
        c.id,
        COALESCE(c.corte_nombre, 'Corte-' || left(c.id::text, 8)) AS corte_nombre,
        c.coda_id,
        c.caja_id,
        c.caja_nombre,
        c.fecha_operativa,
        c.hora_inicio,
        c.hora_fin,
        c.estado,
        c.turno,
        c.tipo,
        c.observaciones,
        c.efectivo_inicial,
        c.efectivo_contado,
        c.responsable_apertura,
        c.responsable_cierre,
        COALESCE(vt.ingresos_efectivo,        0) AS ingresos_efectivo,
        COALESCE(vt.ingresos_tarjeta,         0) AS ingresos_tarjeta,
        COALESCE(vt.ingresos_stripe,          0) AS ingresos_stripe,
        COALESCE(vt.ingresos_transferencias,  0) AS ingresos_transferencias,
        COALESCE(vt.total_ingresos,           0) AS total_ingresos,
        COALESCE(vt.depositos,                0) AS depositos,
        COALESCE(vt.retiros,                  0) AS retiros,
        COALESCE(vt.efectivo_esperado,        0) AS efectivo_esperado,
        COALESCE((
          SELECT COUNT(*)
          FROM rdb.waitry_pedidos ped
          WHERE ped.status != 'order_canceled'
            AND ped."timestamp" AT TIME ZONE 'America/Matamoros'
                >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
            AND ped."timestamp" AT TIME ZONE 'America/Matamoros'
                <= COALESCE(
                     c.hora_fin AT TIME ZONE 'America/Matamoros',
                     c.hora_inicio AT TIME ZONE 'America/Matamoros' + INTERVAL '12 hours'
                   )
        ), 0) AS pedidos_count
      FROM rdb.cortes c
      LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id
    $sql$;

    GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
  END IF;
END $do$;
