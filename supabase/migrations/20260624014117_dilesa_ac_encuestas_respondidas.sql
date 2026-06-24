-- Atención a Clientes (dilesa-atencion-clientes) — bandeja de respuestas.
--
-- Las encuestas de conformidad respondidas no tenían superficie de lectura: la
-- página solo mostraba pendientes (cola) y promedios (KPIs). Esta vista expone
-- cada respuesta individual (NPS + calificaciones + comentario) con cliente,
-- proyecto y unidad resueltos, para la pestaña "Respuestas" (filtrable por
-- fecha/proyecto/segmento y con foco en detractores).
--
-- security_invoker=on para respetar el RLS de empresa de las tablas base.
-- nps_segmento clasifica al estándar NPS (promotor 9-10 / pasivo 7-8 /
-- detractor 0-6). respondida_fecha = fecha local Matamoros, para filtrar por
-- día sin líos de TZ en el cliente.

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_ac_encuestas_respondidas
WITH (security_invoker = on) AS
SELECT e.id AS encuesta_id,
       e.venta_id,
       e.empresa_id,
       e.nps,
       e.calif_vivienda,
       e.calif_proceso,
       e.comentario,
       e.canal,
       e.respondida_at,
       (e.respondida_at AT TIME ZONE 'America/Matamoros')::date AS respondida_fecha,
       NULLIF(trim(concat_ws(' ', per.nombre, per.apellido_paterno, per.apellido_materno)), '') AS cliente,
       u.identificador AS unidad,
       prj.id AS proyecto_id,
       prj.nombre AS proyecto,
       CASE
         WHEN e.nps IS NULL THEN NULL
         WHEN e.nps >= 9 THEN 'promotor'
         WHEN e.nps >= 7 THEN 'pasivo'
         ELSE 'detractor'
       END AS nps_segmento
FROM dilesa.venta_encuestas e
JOIN dilesa.ventas v ON v.id = e.venta_id
LEFT JOIN erp.personas per ON per.id = v.persona_id
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
WHERE e.estado = 'respondida';

COMMENT ON VIEW dilesa.v_ac_encuestas_respondidas IS
  'Bandeja Atención a Clientes: encuestas de conformidad respondidas (NPS + calificaciones + comentario) con cliente/proyecto/unidad y segmento NPS, para la pestaña Respuestas.';

GRANT SELECT ON dilesa.v_ac_encuestas_respondidas TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
