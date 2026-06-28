-- Amplía v_ventas_pipeline_antiguedad a TODO el pipeline activo (DILESA · Ventas)
-- — iniciativa dilesa-fluidez-pipeline, S1b.
--
-- Antes la vista filtraba `numero_escritura IS NULL` (solo el tramo pre-escritura),
-- así el reporte «Ventas estancadas» mostraba apenas 16 ventas con un máximo de 11
-- días — y dejaba fuera las verdaderamente atoradas: 75 ventas activas ya
-- escrituradas, paradas hasta 328 días en las fases post-escritura (Detonada,
-- Facturada, Preparada para Entrega, Entregada) esperando cierre. Esas SON las
-- estancadas que importa ver. Una venta escriturada pero parada meses en Facturado
-- está estancada en el pipeline tanto como una pre-escritura.
--
-- Cambio: se quita el filtro `numero_escritura IS NULL`. Se mantiene
-- `estado = 'activa'` (las terminadas —fase 17— y desasignadas no son pipeline
-- vivo). El resto de la vista (columnas, LATERAL a la fase actual, días en fase,
-- security_invoker) queda igual. La redefinición es CREATE OR REPLACE: preserva
-- GRANTs y RLS. Único consumidor: el reporte «Ventas estancadas» (pantalla + PDF).

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_ventas_pipeline_antiguedad
WITH (security_invoker = true) AS
SELECT
  v.id AS venta_id,
  v.empresa_id,
  v.fase_actual,
  v.fase_posicion,
  fa.fecha AS fecha_fase_actual,
  (CURRENT_DATE - fa.fecha)::int AS dias_en_fase,
  v.unidad_id,
  u.identificador AS unidad_identificador,
  u.proyecto_id,
  p.nombre AS proyecto_nombre,
  v.persona_id,
  trim(concat_ws(' ', per.nombre, per.apellido_paterno, per.apellido_materno)) AS cliente,
  v.vendedor,
  v.vendedor_usuario_id,
  coalesce(v.valor_escrituracion, v.valor_comercial) AS precio
FROM dilesa.ventas v
LEFT JOIN LATERAL (
  SELECT vf.fecha
  FROM dilesa.venta_fases vf
  WHERE vf.venta_id = v.id AND vf.deleted_at IS NULL
  ORDER BY vf.posicion DESC NULLS LAST, vf.fecha DESC NULLS LAST
  LIMIT 1
) fa ON true
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
LEFT JOIN dilesa.proyectos p ON p.id = u.proyecto_id
LEFT JOIN erp.personas per ON per.id = v.persona_id
WHERE v.deleted_at IS NULL
  AND v.estado = 'activa';

-- Recarga el cache de PostgREST para refrescar la definición de la vista.
NOTIFY pgrst, 'reload schema';

COMMIT;
