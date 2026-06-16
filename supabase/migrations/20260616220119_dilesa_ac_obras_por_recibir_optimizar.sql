-- Atención a Clientes (dilesa-atencion-clientes) — fix de performance.
--
-- La vista v_ac_obras_por_recibir daba statement timeout vía PostgREST: usaba
-- 2 NOT EXISTS correlacionados que escaneaban el catálogo de tareas por cada
-- una de las ~1372 construcciones (con el overhead de RLS de security_invoker
-- por fila, superaba los 8s). Se reescribe con agregación de una pasada (hash
-- joins) + pre-filtro por avance_pct < 100 (las históricas ya recibidas están
-- al 100% y quedan fuera barato). Mismo resultado; ~850ms → ~180ms.

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_ac_obras_por_recibir
WITH (security_invoker = on) AS
WITH cand AS (
  -- Pre-filtro barato: una obra por recibir tiene la recepción pendiente, así
  -- que su avance es < 100 (le falta el % del checklist/recepción). Excluye de
  -- entrada las históricas ya recibidas (100%).
  SELECT id, producto_id
  FROM dilesa.construccion
  WHERE deleted_at IS NULL AND estado <> 'cancelada' AND avance_pct < 100
),
agg AS (
  SELECT cand.id,
         count(*) FILTER (WHERE tc.hito_recepcion IS NULL) AS prev_total,
         count(ctt.id) FILTER (WHERE tc.hito_recepcion IS NULL) AS prev_hechas,
         count(ctt.id) FILTER (WHERE tc.hito_recepcion = 'recepcion_final') AS recep_hechas
  FROM cand
  JOIN dilesa.plantilla_tareas pt ON pt.producto_id = cand.producto_id AND pt.deleted_at IS NULL
  JOIN dilesa.tareas_construccion tc ON tc.id = pt.tarea_id
  LEFT JOIN dilesa.construccion_tareas_terminadas ctt
    ON ctt.construccion_id = cand.id AND ctt.plantilla_tarea_id = pt.id AND ctt.deleted_at IS NULL
  GROUP BY cand.id
)
SELECT c.id AS construccion_id,
       c.empresa_id,
       c.codigo,
       c.avance_pct,
       c.estado,
       u.identificador AS unidad,
       prj.nombre AS proyecto,
       r.estado AS recepcion_estado,
       r.fecha_programada
FROM agg
JOIN dilesa.construccion c ON c.id = agg.id
LEFT JOIN dilesa.unidades u ON u.id = c.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
LEFT JOIN dilesa.recepcion_obra r ON r.construccion_id = c.id AND r.deleted_at IS NULL
WHERE agg.prev_total > 0          -- la obra tiene tareas previas
  AND agg.prev_hechas = agg.prev_total  -- todas terminadas
  AND agg.recep_hechas = 0;       -- recepción final aún no cerrada

COMMENT ON VIEW dilesa.v_ac_obras_por_recibir IS
  'Bandeja Atención a Clientes: obras con tareas previas completas y recepción no cerrada. Optimizada (agregación + pre-filtro avance_pct<100) para no timeoutear vía PostgREST.';

NOTIFY pgrst, 'reload schema';

COMMIT;
