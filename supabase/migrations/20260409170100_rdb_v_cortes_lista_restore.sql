-- Restaurar v_cortes_lista (fue borrada por CASCADE al drop de v_cortes_totales)
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
  NULL::bigint                              AS pedidos_count
FROM rdb.cortes c
LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id;

GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
