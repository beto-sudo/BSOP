-- Atención a Clientes: días en fase para el chip de urgencia de las colas.
--
-- Las colas pre-entrega/entrega no comunicaban urgencia: una venta ya detonada
-- (pago recibido, F12) esperando entrega se veía igual que una recién
-- escriturada. Agregamos `dias_en_fase` (días desde que la venta alcanzó su
-- fase actual = la de mayor posición con fecha) para que la UI pinte un chip de
-- urgencia por color (detonada + N días). `pago_detonado` ya existía.
--
-- CREATE OR REPLACE: re-declara la vista completa (preserva GRANTs) y agrega la
-- columna al final; re-especifica security_invoker=on.

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
       -- pago recibido = fase Detonada (F12) cerrada. Sin esto no se entrega.
       EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 12) AS pago_detonado,
       -- días desde que alcanzó su fase actual (la de mayor posición con fecha);
       -- la fecha del evento, no el created_at del import (ver memoria de fechas).
       (CURRENT_DATE - (
         SELECT f.fecha FROM dilesa.venta_fases f
         WHERE f.venta_id = v.id AND f.fecha IS NOT NULL
         ORDER BY f.posicion DESC NULLS LAST, f.fecha DESC
         LIMIT 1
       )) AS dias_en_fase
FROM dilesa.ventas v
LEFT JOIN erp.personas per ON per.id = v.persona_id
LEFT JOIN dilesa.unidades u ON u.id = v.unidad_id
LEFT JOIN dilesa.proyectos prj ON prj.id = u.proyecto_id
WHERE v.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 11)
  AND NOT EXISTS (SELECT 1 FROM dilesa.venta_fases f WHERE f.venta_id = v.id AND f.posicion = 15);

COMMENT ON VIEW dilesa.v_ac_ventas_entrega IS
  'Bandeja Atención a Clientes: ventas escrituradas sin entregar — cola pre_entrega (sin F14) o entrega (con F14); pago_detonado = F12 cerrada; dias_en_fase = días desde la fase actual (para el chip de urgencia).';

NOTIFY pgrst, 'reload schema';

COMMIT;
