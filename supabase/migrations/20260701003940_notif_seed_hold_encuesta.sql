-- ╭─ 20260701003940_notif_seed_hold_encuesta ─╮
-- S5b.2 (Fase 2 de `notificaciones-catalogo`) — centraliza los 2 correos de
-- ventas que faltaban, cerrando S5:
--
--   1. `dilesa_hold` — correos del ciclo de apartado (hold) de una unidad:
--      creación, promoción de fila, aviso de expiración próxima, expiración y
--      desasignación (5 eventos, mismo destinatario: asesor + cliente).
--   2. `dilesa_encuesta` — encuesta de conformidad posventa al cliente
--      (inicial / recordatorio / último) + aviso interno a Atención a Clientes
--      cuando no responde.
--
-- Con el seed aparecen en /settings/notificaciones con kill switch + from +
-- recipientes extra editables y quedan en `notification_log`. La reconexión al
-- catálogo vive DENTRO de las libs (hold-emails / encuesta-emails) porque cada
-- una tiene varios call sites (cron + form + route); FAIL-OPEN a los defaults
-- de hoy. El ASUNTO se mantiene por-evento en código (no se edita aquí).
--
-- Global (empresa_id NULL), aditiva pura, idempotente (NOT EXISTS). Valores
-- sembrados = los de hoy.

BEGIN;

-- ── dilesa_hold (global) ─────────────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_hold',
  NULL,
  'Ciclo de apartado / hold (DILESA)',
  'Correos del ciclo de apartado de una unidad: creación de la solicitud, '
  'promoción como líder de la fila, aviso de expiración próxima, expiración y '
  'desasignación. Se mandan al asesor y al cliente. El kill switch apaga los 5 '
  'eventos; el asunto varía por evento (se define en código, no aquí).',
  'manual',
  '{"ui_location": "cron de expiración + captura de venta + route notify-hold-creado", "button_label": "Correos de hold"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  NULL,
  '[]'::jsonb,
  '(el asunto varía por evento)',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_hold' AND empresa_id IS NULL
);

-- ── dilesa_encuesta (global) ─────────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_encuesta',
  NULL,
  'Encuesta de conformidad posventa (DILESA)',
  'Encuesta de satisfacción al cliente tras la entrega (inicial, recordatorio y '
  'último aviso) + el aviso interno a Atención a Clientes cuando el cliente no '
  'responde tras 3 intentos. El kill switch apaga toda la serie; el asunto '
  'varía por variante (se define en código, no aquí).',
  'cron',
  '{"ui_location": "cron dilesa-encuestas + envío manual desde el expediente", "schedule_human": "diario (ver vercel.json)"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  NULL,
  '[]'::jsonb,
  '(el asunto varía por variante)',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_encuesta' AND empresa_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
