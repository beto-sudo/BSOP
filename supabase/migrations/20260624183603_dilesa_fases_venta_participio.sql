-- ╭─ 20260624183603_dilesa_fases_venta_participio ─╮
-- Revert de las 17 fases de venta DILESA: de infinitivo ("acción a realizar",
-- migración 20260624162109) de vuelta a PARTICIPIO / hito alcanzado. El
-- infinitivo causaba un desfase por uno en los badges de estado: `fase_actual`
-- es la última fase COMPLETADA, así que una venta "Escriturar" ya había
-- escriturado. Se vuelve al participio (decisión Beto 2026-06-24), arreglando de
-- paso la mezcla original: los 3 "Solicitud de…" quedan como estado uniforme
-- ("Asignación Solicitada", "Avalúo Solicitado", "Dictamen Solicitado").
--
-- Solo reescribe ETIQUETAS por posición (catálogo + historial). NO toca
-- posiciones, triggers, ni el modelo. NULL-safe / idempotente (scopeado a
-- 'dilesa'; en el Preview branch sin datos cada UPDATE afecta 0 filas).
--
-- Mapa pos → nombre:
--   1 Asignación Solicitada · 2 Asignada · 3 Formalizada · 4 Avalúo Solicitado
--   5 Avalúo Cerrado · 6 Inscrita · 7 Dictamen Solicitado · 8 Dictaminada
--   9 Validación Patronal · 10 Firmas Programadas · 11 Escriturada · 12 Detonada
--   13 Facturada · 14 Preparada para Entrega · 15 Entregada
--   16 Conformidad del Cliente · 17 Operación Terminada

BEGIN;

-- 1) Backfill defensivo de `posicion` en filas con posicion NULL (en prod hoy
--    son 0; queda por idempotencia/Preview), emparejando por el nombre vigente.
UPDATE dilesa.venta_fases vf
SET posicion = c.posicion
FROM dilesa.venta_fase_catalogo c
WHERE vf.posicion IS NULL
  AND vf.empresa_id = c.empresa_id
  AND vf.fase = c.nombre
  AND c.deleted_at IS NULL;

-- 2) Renombrar el catálogo por posición (la fuente del nombre visible en DB).
UPDATE dilesa.venta_fase_catalogo c
SET nombre = m.nombre
FROM (
  VALUES
    (1, 'Asignación Solicitada'),
    (2, 'Asignada'),
    (3, 'Formalizada'),
    (4, 'Avalúo Solicitado'),
    (5, 'Avalúo Cerrado'),
    (6, 'Inscrita'),
    (7, 'Dictamen Solicitado'),
    (8, 'Dictaminada'),
    (9, 'Validación Patronal'),
    (10, 'Firmas Programadas'),
    (11, 'Escriturada'),
    (12, 'Detonada'),
    (13, 'Facturada'),
    (14, 'Preparada para Entrega'),
    (15, 'Entregada'),
    (16, 'Conformidad del Cliente'),
    (17, 'Operación Terminada')
) AS m(posicion, nombre)
WHERE c.posicion = m.posicion
  AND c.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND c.nombre IS DISTINCT FROM m.nombre;

-- 3) Reescribir el historial del pipeline (`venta_fases.fase`) por posición. El
--    guard NOT EXISTS evita violar el UNIQUE(venta_id, fase) si una venta tuviera
--    dos filas en la misma posición con nombres distintos (esa fila rara se deja).
UPDATE dilesa.venta_fases vf
SET fase = c.nombre
FROM dilesa.venta_fase_catalogo c
WHERE vf.empresa_id = c.empresa_id
  AND vf.posicion = c.posicion
  AND c.deleted_at IS NULL
  AND vf.fase IS DISTINCT FROM c.nombre
  AND NOT EXISTS (
    SELECT 1
    FROM dilesa.venta_fases vf2
    WHERE vf2.venta_id = vf.venta_id
      AND vf2.fase = c.nombre
      AND vf2.id <> vf.id
  );

-- 4) Reescribir el caché de fase actual en `ventas.fase_actual` por posición.
UPDATE dilesa.ventas v
SET fase_actual = c.nombre
FROM dilesa.venta_fase_catalogo c
WHERE v.empresa_id = c.empresa_id
  AND v.fase_posicion = c.posicion
  AND c.deleted_at IS NULL
  AND v.fase_actual IS DISTINCT FROM c.nombre;

NOTIFY pgrst, 'reload schema';

COMMIT;
