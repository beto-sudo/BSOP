
DROP VIEW IF EXISTS caja.v_cortes_totales_30d;

CREATE VIEW caja.v_cortes_totales_30d AS
SELECT
  vt.corte_id,
  COALESCE(c.coda_id, c.corte_nombre, vt.caja_nombre) AS corte_nombre,
  vt.caja_nombre,
  vt.hora_inicio,
  vt.hora_fin,
  (vt.hora_inicio AT TIME ZONE 'America/Matamoros')::date AS fecha_operativa,
  vt.efectivo_inicial,
  vt.total_ingresos        AS total_pedidos,
  vt.ingresos_efectivo,
  vt.ingresos_tarjeta,
  vt.ingresos_stripe,
  vt.ingresos_transferencias,
  vt.depositos,
  vt.retiros,
  vt.efectivo_esperado
FROM caja.v_cortes_totales vt
JOIN caja.cortes c ON c.id = vt.corte_id
WHERE vt.hora_inicio >= (CURRENT_DATE - INTERVAL '35 days');
;
