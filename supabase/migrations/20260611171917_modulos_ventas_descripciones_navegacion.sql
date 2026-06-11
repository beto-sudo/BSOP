-- ╭─ 20260611171917_modulos_ventas_descripciones_navegacion ─╮
-- accesos-intuitivos S1c: la matriz de Accesos ahora muestra la descripción
-- de cada permiso (antes solo el nombre). Se pulen las 5 descripciones que
-- confundían en el caso Nelsy/Nelcy 2026-06-11: `lista` no decía que es el
-- requisito de navegación, `autorizar` no decía que ES la captura de Fase 2,
-- `fase02` no decía que no gobierna pantalla, y 2 desactualizadas (F16 ya es
-- Conformidad; F09 estaba en spanglish). Idempotente: UPDATE por slug.

BEGIN;

UPDATE core.modulos m
SET descripcion = v.descripcion
FROM (VALUES
  ('dilesa.ventas.lista',
   'Ver la lista de ventas y abrir el expediente de cada operación. Requisito de navegación: sin esto no se llega a ninguna captura de fase.'),
  ('dilesa.ventas.autorizar',
   'Capturar Fase 2 — Asignada: autorizar la asignación de la unidad cuando el expediente está completo. (La pantalla de Fase 2 pide ESTE permiso, no el de "02 Asignada".)'),
  ('dilesa.ventas.fase02_asignada',
   'Marcador de la Fase 2 en el pipeline. No gobierna ninguna pantalla: la captura de la Fase 2 la da "Autorizar asignación".'),
  ('dilesa.ventas.fase09_validacion_patronal',
   'Validación patronal Infonavit/Fovissste'),
  ('dilesa.ventas.fase16_conformidad',
   'Conformidad del cliente (encuesta + acta)')
) AS v(slug, descripcion)
JOIN core.empresas e ON e.slug = 'dilesa'
WHERE m.slug = v.slug AND m.empresa_id = e.id;

NOTIFY pgrst, 'reload schema';

COMMIT;
