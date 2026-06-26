-- ╭─ 20260626021255_reconciliar_ventas_fase14_saltada ─╮
-- Data-fix: las ventas que ya saltaron a la Fase 14 (Preparada para Entrega) sin
-- haber recorrido Detonada (12) / Facturada (13) regresan a su última fase REAL
-- secuencial. Causa: el gate especial `{14:11}` + el avance no-estricto de
-- `marcarFase` (ambos corregidos en 20260626020801 y en la app). Al momento del
-- fix eran 6 ventas activas (Julio César, Víctor Manuel, Ángeles Daniela → 11;
-- Nancy Villarreal, Christopher Alfonso, Eduardo → 12), todas con su checklist
-- ya cargado: cuando facturen, el trigger `fn_auto_preparada_entrega` las
-- recogerá sola.
--
-- Idempotente y robusto a Preview: identifica por CONDICIÓN (activa + pos 14 +
-- sin Facturada (13) cerrada), no por IDs. En el Preview branch (vacío) no
-- matchea nada; re-correr tras el fix tampoco (ya no están en pos 14). NO toca
-- `erp.adjuntos` (el checklist se conserva) ni la casa física.

BEGIN;

-- Ventas activas que aterrizaron en la 14 sin tener cerrada la Facturada (13).
-- Destino = 12 (Detonada) si la 12 ya está cerrada; si no, 11 (Escriturada).
CREATE TEMP TABLE _fase14_saltadas ON COMMIT DROP AS
SELECT v.id AS venta_id,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM dilesa.venta_fases vf
           WHERE vf.venta_id = v.id AND vf.posicion = 12 AND vf.deleted_at IS NULL
         ) THEN 12
         ELSE 11
       END AS fase_destino
FROM dilesa.ventas v
WHERE v.estado = 'activa'
  AND v.deleted_at IS NULL
  AND v.fase_posicion = 14
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases vf
    WHERE vf.venta_id = v.id AND vf.posicion = 13 AND vf.deleted_at IS NULL
  );

-- 1) Soft-delete de la fila `venta_fases` pos 14 (cerrada fuera de orden). El
--    soft-delete (UPDATE de deleted_at) no dispara el auto-cierre (es AFTER
--    INSERT), así que no se vuelve a crear.
UPDATE dilesa.venta_fases vf
SET deleted_at = now(), updated_at = now()
FROM _fase14_saltadas s
WHERE vf.venta_id = s.venta_id
  AND vf.posicion = 14
  AND vf.deleted_at IS NULL;

-- 2) Regresar el caché de posición a la última fase real. El trigger
--    `fn_sync_unidad_estado_por_fase` recalcula el estado de la unidad: 11/12
--    siguen mapeando a 'escriturada' (sin cambio, solo-adelanta no degrada).
UPDATE dilesa.ventas v
SET fase_posicion = s.fase_destino,
    fase_actual = CASE s.fase_destino WHEN 12 THEN 'Detonada' ELSE 'Escriturada' END,
    updated_at = now()
FROM _fase14_saltadas s
WHERE v.id = s.venta_id;

COMMIT;
