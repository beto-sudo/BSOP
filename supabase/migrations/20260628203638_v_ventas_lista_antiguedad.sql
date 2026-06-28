-- Vista de antigüedad en fase para TODA la lista de ventas (DILESA · Ventas)
-- — iniciativa dilesa-fluidez-pipeline, Sprint 1.
--
-- Hermana de v_ventas_pipeline_antiguedad (reporte «Ventas estancadas»), pero
-- con menos filtro: cubre TODO el pipeline vivo, no solo el tramo pre-escritura.
-- La vista de estancadas filtra `numero_escritura IS NULL` (su semántica es
-- "atorada antes de escriturar"); aquí queremos también la mitad trasera del
-- pipeline (fases 12-17 post-escritura: Detonada, Facturada, Entregada…), que
-- igual espera. Solo se excluyen las que ya no están en el pipeline:
-- `estado != 'activa'` (terminadas/desasignadas no muestran "días en fase").
--
-- Slim a propósito: la lista (components/dilesa/ventas-module.tsx) ya trae
-- cliente/unidad/proyecto/vendedor por su cuenta; esta vista solo aporta el dato
-- nuevo (días en la fase actual), calculado en la base para no traer las ~14k
-- filas de venta_fases al cliente.
--
-- `dias_en_fase = CURRENT_DATE - fecha_entrada_fase_actual` (entero de días; la
-- columna `fecha` de venta_fases es DATE, sin TZ → resta limpia).
-- security_invoker = true: respeta el RLS por empresa del usuario que consulta.
-- La vista v_ventas_pipeline_antiguedad queda INTACTA (no romper estancadas).

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_ventas_lista_antiguedad
WITH (security_invoker = true) AS
SELECT
  v.id AS venta_id,
  v.empresa_id,
  v.fase_actual,
  v.fase_posicion,
  fa.fecha AS fecha_fase_actual,
  (CURRENT_DATE - fa.fecha)::int AS dias_en_fase
FROM dilesa.ventas v
LEFT JOIN LATERAL (
  SELECT vf.fecha
  FROM dilesa.venta_fases vf
  WHERE vf.venta_id = v.id AND vf.deleted_at IS NULL
  ORDER BY vf.posicion DESC NULLS LAST, vf.fecha DESC NULLS LAST
  LIMIT 1
) fa ON true
WHERE v.deleted_at IS NULL
  AND v.estado = 'activa';

-- Recarga el cache de PostgREST para exponer la vista vía la API.
NOTIFY pgrst, 'reload schema';

COMMIT;
