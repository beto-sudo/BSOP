-- EDITED 2026-04-23 (drift-1.5): rdb.cortes / rdb.waitry_pedidos /
-- rdb.v_cortes_totales are ambient or built later by ambient-dependent
-- migrations. Skip whole view creation when any source is absent. Production
-- already has the view; later migrations replace it.
-- ============================================================
-- Vista rdb.v_cortes_lista
-- Reemplaza el uso de caja.v_cortes_completo en el frontend.
-- Combina rdb.cortes + totales de v_cortes_totales + conteo de pedidos.
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.cortes') IS NULL
     OR to_regclass('rdb.waitry_pedidos') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE VIEW rdb.v_cortes_lista AS
    SELECT
      c.id,
      'Corte-' || left(c.id::text, 8)      AS corte_nombre,
      c.caja_id,
      c.caja_nombre,
      c.fecha_operativa,
      c.hora_inicio,
      c.hora_fin,
      c.estado,
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
      ), 0)                                AS pedidos_count
    FROM rdb.cortes c
    LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id
  $sql$;

  GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
END $do$;
