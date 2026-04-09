-- ============================================================
-- Vista rdb.v_cortes_lista
-- Reemplaza el uso de caja.v_cortes_completo en el frontend.
-- Combina rdb.cortes + totales de v_cortes_totales + conteo de pedidos.
-- ============================================================

CREATE OR REPLACE VIEW rdb.v_cortes_lista AS
SELECT
  c.id,
  -- Nombre legible generado (rdb.cortes no tiene folio propio)
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
  -- Totales desde v_cortes_totales
  COALESCE(vt.ingresos_efectivo,        0) AS ingresos_efectivo,
  COALESCE(vt.ingresos_tarjeta,         0) AS ingresos_tarjeta,
  COALESCE(vt.ingresos_stripe,          0) AS ingresos_stripe,
  COALESCE(vt.ingresos_transferencias,  0) AS ingresos_transferencias,
  COALESCE(vt.total_ingresos,           0) AS total_ingresos,
  COALESCE(vt.depositos,                0) AS depositos,
  COALESCE(vt.retiros,                  0) AS retiros,
  COALESCE(vt.efectivo_esperado,        0) AS efectivo_esperado,
  -- Conteo de pedidos en el rango del corte (no cancelados)
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
LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id;

-- Grants
GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
