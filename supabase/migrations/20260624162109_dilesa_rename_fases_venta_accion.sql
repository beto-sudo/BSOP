-- ╭─ 20260624162109_dilesa_rename_fases_venta_accion ─╮
-- Renombre de las 17 fases de venta DILESA a la convención "acción a realizar"
-- (Beto, 2026-06-24). La identidad de la fase es su POSICIÓN (1–17), estable y
-- cableada en triggers (estado terminada=17, plan CxC 2–11, encuesta/entrega 15…);
-- aquí solo cambian las ETIQUETAS. Reescribe el catálogo Y el historial
-- (`venta_fases.fase`, `ventas.fase_actual`) por posición para que ninguna fila
-- conserve el nombre viejo. La fuente en código es `lib/dilesa/fases.ts`.
--
-- NULL-safe / idempotente: scopeado a la empresa 'dilesa' vía JOIN; en el
-- Supabase Preview branch (sin datos de prod) cada UPDATE afecta 0 filas. Los
-- guards `IS DISTINCT FROM` hacen que re-correrla no cambie nada.
--
-- Mapa pos → nombre nuevo:
--   1 Solicitar asignación · 2 Asignar unidad · 3 Formalizar promesa
--   4 Solicitar avalúo · 5 Cerrar avalúo · 6 Inscribir crédito
--   7 Solicitar dictamen · 8 Dictaminar · 9 Validación Patronal (sin cambio)
--   10 Programar firmas · 11 Escriturar · 12 Detonar crédito · 13 Facturar
--   14 Preparar entrega · 15 Entregar · 16 Recabar conformidad · 17 Cerrar operación

BEGIN;

-- 1) Backfill defensivo de `posicion` en filas históricas que la tengan NULL,
--    emparejando por el nombre VIEJO contra el catálogo aún sin renombrar. Así
--    los pasos 4/5 (por posición) cubren también el historial migrado de Coda.
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
    (1, 'Solicitar asignación'),
    (2, 'Asignar unidad'),
    (3, 'Formalizar promesa'),
    (4, 'Solicitar avalúo'),
    (5, 'Cerrar avalúo'),
    (6, 'Inscribir crédito'),
    (7, 'Solicitar dictamen'),
    (8, 'Dictaminar'),
    (9, 'Validación Patronal'),
    (10, 'Programar firmas'),
    (11, 'Escriturar'),
    (12, 'Detonar crédito'),
    (13, 'Facturar'),
    (14, 'Preparar entrega'),
    (15, 'Entregar'),
    (16, 'Recabar conformidad'),
    (17, 'Cerrar operación')
) AS m(posicion, nombre)
WHERE c.posicion = m.posicion
  AND c.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND c.nombre IS DISTINCT FROM m.nombre;

-- 3) Descripción de las fases con matiz que Beto explicó (queda como ayuda en el
--    catálogo; hoy el campo estaba vacío).
UPDATE dilesa.venta_fase_catalogo c
SET descripcion = m.descripcion
FROM (
  VALUES
    (3, 'Formalizar la promesa de compraventa con el cliente.'),
    (6, 'Inscripción del crédito ante la notaría.'),
    (9, 'Documento que valida que se le otorgará el crédito al trabajador y que la empresa aplicará el descuento vía nómina.')
) AS m(posicion, descripcion)
WHERE c.posicion = m.posicion
  AND c.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND c.descripcion IS DISTINCT FROM m.descripcion;

-- 4) Reescribir el historial del pipeline (`venta_fases.fase`) por posición. El
--    guard NOT EXISTS evita violar el UNIQUE(venta_id, fase) si una venta tuviera
--    dos filas en la misma posición con nombres distintos (ej. residuo del
--    renombre histórico de la fase 16); esa fila rara se deja como está.
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

-- 5) Reescribir el caché de fase actual en `ventas.fase_actual` por posición.
UPDATE dilesa.ventas v
SET fase_actual = c.nombre
FROM dilesa.venta_fase_catalogo c
WHERE v.empresa_id = c.empresa_id
  AND v.fase_posicion = c.posicion
  AND c.deleted_at IS NULL
  AND v.fase_actual IS DISTINCT FROM c.nombre;

NOTIFY pgrst, 'reload schema';

COMMIT;
