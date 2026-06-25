-- ╭─ 20260625000107_dilesa_notif_tareas_pendientes ─╮
-- Definición de notificación para el correo de "Tareas pendientes de
-- ejecución" que se le envía al contratista desde el detalle de la obra
-- (app/dilesa/construccion/[id] → botón "Pendientes"). Slug
-- `dilesa_tareas_pendientes`, global — from/reply-to/subject/destinatarios
-- extra editables runtime en /settings/notificaciones + kill switch.
--
-- El handler (app/api/dilesa/construccion/[id]/pendientes/pdf POST) es
-- FAIL-OPEN: si esta fila no existe usa defaults hardcoded, así que el
-- envío funciona aunque la migración aún no se aplique a prod. Esta fila
-- solo lo hace gobernable (config sin deploy + traza en notification_log).
--
-- Pure DML (INSERT) — no toca schema, robusto a Preview branches:
-- idempotente vía WHERE NOT EXISTS (el UNIQUE (slug, empresa_id) no
-- protege duplicados cuando empresa_id es NULL) y sin FK a datos de prod.

BEGIN;

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_tareas_pendientes',
  NULL,
  'Tareas pendientes al contratista (DILESA)',
  'Email al contratista con la relación de tareas pendientes de ejecución '
  'de una obra (valor de mano de obra por tarea + datos de la vivienda y el '
  'contrato), como adjunto PDF. Se dispara manualmente desde el detalle de '
  'la obra cuando el contratista lo pide. Excluye los hitos de recepción.',
  'manual',
  '{"ui_location": "/dilesa/construccion/[id] (detalle de obra)", "button_label": "Pendientes → Enviar al contratista"}'::jsonb,
  'noreply@bsop.io',
  'DILESA Obra',
  'admin@dilesa.mx',
  '[]'::jsonb,
  'Pendientes de obra {identificador} · {contratista}',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM core.notification_definitions
  WHERE slug = 'dilesa_tareas_pendientes' AND empresa_id IS NULL
);

COMMIT;
