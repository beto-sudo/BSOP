-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 2: bandeja de trabajo.
--
-- Módulo nuevo `dilesa.atencion_clientes` (sidebar) + 3 vistas que alimentan la
-- cola de Ciori por momento, todas como VISTA sobre datos existentes (cero
-- duplicación de captura):
--   1. v_ac_obras_por_recibir — obras con todas las tareas previas terminadas
--      y la recepción aún no cerrada (excluye históricas ya recibidas).
--   2. v_ac_ventas_entrega — ventas escrituradas (F11) sin entregar (sin F15),
--      clasificadas en 'pre_entrega' (sin F14) o 'entrega' (con F14).
--   3. v_ac_encuestas_pendientes — encuestas de conformidad programadas/enviadas
--      sin responder.
-- security_invoker=on en las 3 para respetar el RLS de empresa de las tablas base.

BEGIN;

-- ── 1. Vistas de las colas ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW dilesa.v_ac_obras_por_recibir
WITH (security_invoker = on) AS
SELECT c.id AS construccion_id,
       c.empresa_id,
       c.codigo,
       c.avance_pct,
       c.estado,
       u.identificador AS unidad,
       prj.nombre AS proyecto,
       r.estado AS recepcion_estado,
       r.fecha_programada
FROM dilesa.construccion c
LEFT JOIN dilesa.unidades u ON u.id = c.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
LEFT JOIN dilesa.recepcion_obra r ON r.construccion_id = c.id AND r.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND c.estado <> 'cancelada'
  -- todas las tareas de obra (no-recepción) terminadas
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.plantilla_tareas pt
    JOIN dilesa.tareas_construccion tc ON tc.id = pt.tarea_id
    LEFT JOIN dilesa.construccion_tareas_terminadas ctt
      ON ctt.construccion_id = c.id AND ctt.plantilla_tarea_id = pt.id AND ctt.deleted_at IS NULL
    WHERE pt.producto_id = c.producto_id AND pt.deleted_at IS NULL
      AND tc.hito_recepcion IS NULL AND ctt.id IS NULL
  )
  -- la recepción final aún NO está terminada (excluye históricas ya recibidas)
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.plantilla_tareas pt
    JOIN dilesa.tareas_construccion tc ON tc.id = pt.tarea_id AND tc.hito_recepcion = 'recepcion_final'
    JOIN dilesa.construccion_tareas_terminadas ctt
      ON ctt.construccion_id = c.id AND ctt.plantilla_tarea_id = pt.id AND ctt.deleted_at IS NULL
    WHERE pt.producto_id = c.producto_id AND pt.deleted_at IS NULL
  );

COMMENT ON VIEW dilesa.v_ac_obras_por_recibir IS
  'Bandeja Atención a Clientes: obras con tareas previas completas y recepción no cerrada.';

CREATE OR REPLACE VIEW dilesa.v_ac_ventas_entrega
WITH (security_invoker = on) AS
SELECT v.id AS venta_id,
       v.empresa_id,
       v.fase_actual,
       v.fase_posicion,
       NULLIF(trim(concat_ws(' ', per.nombre, per.apellido_paterno, per.apellido_materno)), '') AS cliente,
       u.identificador AS unidad,
       prj.nombre AS proyecto,
       CASE
         WHEN EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 14)
         THEN 'entrega' ELSE 'pre_entrega'
       END AS cola
FROM dilesa.ventas v
LEFT JOIN erp.personas per ON per.id = v.persona_id
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
WHERE v.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 11)
  AND NOT EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 15);

COMMENT ON VIEW dilesa.v_ac_ventas_entrega IS
  'Bandeja Atención a Clientes: ventas escrituradas sin entregar — cola pre_entrega (sin F14) o entrega (con F14).';

CREATE OR REPLACE VIEW dilesa.v_ac_encuestas_pendientes
WITH (security_invoker = on) AS
SELECT e.id AS encuesta_id,
       e.venta_id,
       e.empresa_id,
       e.estado,
       e.programada_para,
       e.intentos,
       NULLIF(trim(concat_ws(' ', per.nombre, per.apellido_paterno, per.apellido_materno)), '') AS cliente,
       u.identificador AS unidad
FROM dilesa.venta_encuestas e
JOIN dilesa.ventas v ON v.id = e.venta_id
LEFT JOIN erp.personas per ON per.id = v.persona_id
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
WHERE e.estado IN ('programada', 'enviada');

COMMENT ON VIEW dilesa.v_ac_encuestas_pendientes IS
  'Bandeja Atención a Clientes: encuestas de conformidad programadas/enviadas sin responder.';

GRANT SELECT ON dilesa.v_ac_obras_por_recibir TO authenticated;
GRANT SELECT ON dilesa.v_ac_ventas_entrega TO authenticated;
GRANT SELECT ON dilesa.v_ac_encuestas_pendientes TO authenticated;

-- ── 2. Módulo nuevo + RBAC (ADR-014) ──────────────────────────────────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.atencion_clientes',
       'Atención a Clientes',
       'Bandeja de trabajo del departamento: obras por recibir, pre-entrega, entrega y encuestas de conformidad.',
       e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Acceso: Atención a Clientes + Dirección (read+write); admin siempre por fn_is_admin.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id AND e.slug = 'dilesa'
JOIN core.modulos m ON m.empresa_id = e.id AND m.slug = 'dilesa.atencion_clientes'
WHERE r.nombre IN ('Atencion a Clientes', 'Dirección')
ON CONFLICT (rol_id, modulo_id) DO UPDATE
  SET acceso_lectura = true, acceso_escritura = true;

NOTIFY pgrst, 'reload schema';

COMMIT;
