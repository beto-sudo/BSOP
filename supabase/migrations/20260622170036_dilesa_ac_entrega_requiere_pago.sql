-- ╭─ 20260622170036_dilesa_ac_entrega_requiere_pago ─╮
-- Atención a Clientes: la entrega de la vivienda no puede ocurrir sin el pago.
-- "Detonada" (F12) = la institución liberó el recurso y DILESA recibió el
-- depósito. Pasa que la pre-entrega (F14) se hace antes de que entre el pago,
-- y hoy nada impide entregar (F15) sin él. Agregamos `pago_detonado` (EXISTS
-- F12) a la bandeja para marcar "Falta pago" en la cola de entrega; el candado
-- duro de captura vive en la UI de F15.
--
-- CREATE OR REPLACE: solo agrega una columna al final (preserva GRANTs).

BEGIN;

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
       END AS cola,
       -- pago recibido = fase Detonada (F12) cerrada. La cola de entrega sigue
       -- mostrando la venta, pero sin esto no se puede cerrar la entrega.
       EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 12) AS pago_detonado
FROM dilesa.ventas v
LEFT JOIN erp.personas per ON per.id = v.persona_id
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
WHERE v.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 11)
  AND NOT EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 15);

COMMENT ON VIEW dilesa.v_ac_ventas_entrega IS
  'Bandeja Atención a Clientes: ventas escrituradas sin entregar — cola pre_entrega (sin F14) o entrega (con F14); pago_detonado = F12 cerrada (sin pago no se entrega).';

NOTIFY pgrst, 'reload schema';

COMMIT;
