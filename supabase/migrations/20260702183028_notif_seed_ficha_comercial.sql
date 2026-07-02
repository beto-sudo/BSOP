-- ╭─ 20260702183028_notif_seed_ficha_comercial ─╮
-- Iniciativa `dilesa-portafolio-predios` · S7 — catálogo de notificaciones
-- para el envío MANUAL de la ficha comercial de un activo del portafolio a
-- un prospecto de venta/renta (con el PDF adjunto). Kill switch + from +
-- recipientes extra editables en /settings/notificaciones; queda en
-- notification_log. Global (empresa_id NULL), aditiva pura, idempotente.

BEGIN;

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_ficha_comercial',
  NULL,
  'Ficha comercial del portafolio (DILESA)',
  'Envío manual de la ficha comercial (PDF adjunto) de un activo del portafolio '
  'a un prospecto interesado en compra o renta. Siempre lo dispara un operador '
  'desde el expediente del activo con confirmación explícita — nunca automático. '
  'El asunto y el mensaje los edita el operador al enviar.',
  'manual',
  '{"ui_location": "expediente del activo (/dilesa/portafolio/activo/[id])", "button_label": "Enviar ficha por correo"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  NULL,
  '[]'::jsonb,
  '(el asunto lo edita el operador al enviar)',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_ficha_comercial' AND empresa_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
