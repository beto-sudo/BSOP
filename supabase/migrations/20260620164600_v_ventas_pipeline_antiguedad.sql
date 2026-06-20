-- Vista de antigüedad en pipeline (DILESA · Ventas) — iniciativa dilesa-reportes, ADR-047.
--
-- Para el reporte «Ventas estancadas»: por cada venta en pipeline vivo (activa, sin
-- escriturar), la fecha de entrada a su fase actual (la fila de mayor posición en
-- venta_fases) y los días transcurridos. Calcular eso en la base evita traer las
-- ~14k filas de venta_fases al cliente.
--
-- security_invoker = true: la vista respeta el RLS del usuario que la consulta
-- (no expone datos cross-empresa). Cliente sale de erp.personas (RLS por empresa);
-- el vendedor se resuelve en la app (core.usuarios es self-only).

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
  AND v.estado = 'activa'
  AND v.numero_escritura IS NULL;

-- Recarga el cache de PostgREST para exponer la vista vía la API.
NOTIFY pgrst, 'reload schema';

COMMIT;
