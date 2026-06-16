-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 3: KPIs del depto.
--
-- Vista agregada de satisfacción (solo números, sin PII) para la franja de KPIs
-- de la bandeja. Los conteos operativos (obras por recibir / por entregar /
-- encuestas pendientes) salen de las vistas de cola que ya consume la página.

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_ac_kpis
WITH (security_invoker = on) AS
SELECT e.empresa_id,
       count(*) FILTER (WHERE e.estado = 'respondida') AS encuestas_respondidas,
       count(*) AS encuestas_total,
       round(avg(e.nps) FILTER (WHERE e.estado = 'respondida' AND e.nps IS NOT NULL), 1) AS nps_prom,
       round(avg(e.calif_vivienda) FILTER (WHERE e.estado = 'respondida' AND e.calif_vivienda IS NOT NULL), 1) AS calif_vivienda_prom,
       round(avg(e.calif_proceso) FILTER (WHERE e.estado = 'respondida' AND e.calif_proceso IS NOT NULL), 1) AS calif_proceso_prom
FROM dilesa.venta_encuestas e
GROUP BY e.empresa_id;

COMMENT ON VIEW dilesa.v_ac_kpis IS
  'Bandeja Atención a Clientes: KPIs de satisfacción (NPS + calificaciones promedio + tasa de respuesta) de las encuestas de conformidad.';

GRANT SELECT ON dilesa.v_ac_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
