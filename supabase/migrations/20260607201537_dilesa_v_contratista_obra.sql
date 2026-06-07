-- Iniciativa: dilesa-resumen-consejo · pulido sección Contratistas
-- Vista de contratistas con obra EN CONSTRUCCIÓN (estado 'en_progreso') para el
-- correo al Consejo. Reemplaza la sección basada en v_estimaciones_resumen
-- (montos de estimaciones) por la operativa que pidió Beto: viviendas en
-- construcción, monto de contrato (MO), ejecutado, y efectividad vs calendario.
--
-- Efectividad = avance físico real / avance esperado por calendario (>100% =
-- adelantado). Vencidas = viviendas cuya fecha de compromiso ya pasó y siguen en
-- progreso (alerta para el Consejo).
CREATE OR REPLACE VIEW dilesa.v_contratista_obra WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    c.empresa_id,
    c.contratista_id,
    count(*)                          AS viviendas,
    sum(c.valor_contrato_mo)          AS mo_contratado,
    sum(c.mo_ejecutado)               AS mo_ejecutado,
    avg(c.avance_pct)                 AS avance_real,
    avg(
      CASE
        WHEN c.fecha_compromiso_terminar > c.fecha_arranque THEN
          100.0 * LEAST(1, GREATEST(0,
            (CURRENT_DATE - c.fecha_arranque)::numeric
            / NULLIF(c.fecha_compromiso_terminar - c.fecha_arranque, 0)))
      END
    )                                 AS avance_esperado,
    count(*) FILTER (
      WHERE c.fecha_compromiso_terminar < CURRENT_DATE
    )                                 AS vencidas
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado = 'en_progreso'
  GROUP BY c.empresa_id, c.contratista_id
)
SELECT
  b.empresa_id,
  b.contratista_id,
  p.nombre                                                        AS contratista,
  b.viviendas,
  round(b.mo_contratado, 2)                                       AS mo_contratado,
  round(b.mo_ejecutado, 2)                                        AS mo_ejecutado,
  round(100.0 * b.mo_ejecutado / NULLIF(b.mo_contratado, 0), 1)   AS pct_ejecutado,
  round(b.avance_real, 1)                                         AS avance_real,
  round(b.avance_esperado, 1)                                     AS avance_esperado,
  round(100.0 * b.avance_real / NULLIF(b.avance_esperado, 0), 0)  AS efectividad_pct,
  b.vencidas
FROM base b
LEFT JOIN erp.personas p ON p.id = b.contratista_id;

NOTIFY pgrst, 'reload schema';
