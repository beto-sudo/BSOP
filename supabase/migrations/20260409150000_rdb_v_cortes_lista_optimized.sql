-- EDITED 2026-04-23 (drift-1.5): rdb.cortes / rdb.waitry_pedidos are ambient.
-- ============================================================
-- Optimización de rdb.v_cortes_lista
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.cortes') IS NULL OR to_regclass('rdb.waitry_pedidos') IS NULL THEN
    RETURN;
  END IF;

  DROP VIEW IF EXISTS rdb.v_cortes_lista;

  EXECUTE $sql$
    CREATE VIEW rdb.v_cortes_lista AS
    WITH pedidos_por_corte AS (
      SELECT
        c.id AS corte_id,
        COUNT(p.id) AS pedidos_count
      FROM rdb.cortes c
      LEFT JOIN rdb.waitry_pedidos p
        ON p.status != 'order_canceled'
        AND p."timestamp" AT TIME ZONE 'America/Matamoros'
            >= c.hora_inicio AT TIME ZONE 'America/Matamoros'
        AND p."timestamp" AT TIME ZONE 'America/Matamoros'
            <= COALESCE(
                 c.hora_fin AT TIME ZONE 'America/Matamoros',
                 c.hora_inicio AT TIME ZONE 'America/Matamoros' + INTERVAL '12 hours'
               )
      GROUP BY c.id
    )
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
      COALESCE(pc.pedidos_count,            0) AS pedidos_count
    FROM rdb.cortes c
    LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id
    LEFT JOIN pedidos_por_corte pc ON pc.corte_id = c.id
  $sql$;

  GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
END $do$;
