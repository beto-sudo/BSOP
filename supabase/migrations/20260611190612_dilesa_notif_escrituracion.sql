-- ╭─ 20260611190612_dilesa_notif_escrituracion ─╮
-- Correo de escrituración al cliente (Fase 11) — remate post-cierre de
-- `dilesa-ventas-expediente`. Replica (y mejora) el correo que Coda mandaba
-- al registrar la fase "Escriturada": cliente + vendedor + escrituras@dilesa.mx
-- con los datos de la operación, fecha/valor de escrituración y notaría.
--
-- Componentes:
--   1. `dilesa.ventas.notif_escrituracion_at` — idempotencia del envío
--      automático (mismo patrón que `notif_solicitud_avaluo_at`). El botón
--      "Reenviar" del expediente ignora el timestamp explícitamente.
--   2. Definición en `core.notification_definitions` (slug
--      `dilesa_escrituracion`, global) — from/reply-to/subject/destinatarios
--      extra editables runtime en /settings/notificaciones + kill switch.
--      `escrituras@dilesa.mx` va como recipient extra `always` para que
--      cambiarlo no requiera deploy.
--
-- Aditiva pura. Robusta a Preview branches (sin FK a datos de prod;
-- idempotente vía WHERE NOT EXISTS — el UNIQUE (slug, empresa_id) no
-- protege duplicados cuando empresa_id es NULL).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS notif_escrituracion_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.notif_escrituracion_at IS
  'Último envío del correo de escrituración (Fase 11) a cliente + vendedor + '
  'escrituras@. Idempotencia del disparo automático al cerrar la fase; el '
  'reenvío manual desde el expediente lo actualiza también.';

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_escrituracion',
  NULL,
  'Escrituración al cliente (DILESA)',
  'Email al cliente cuando se registra la escritura (cierre de Fase 11 — '
  'Escriturada). Incluye datos de la operación (inmueble, fecha/número de '
  'escritura, valor de escrituración), el aviso de ~3 meses para la '
  'inscripción en el Registro Público y los datos de la notaría. Cc al '
  'vendedor de la operación; escrituras@dilesa.mx como destinatario fijo. '
  'Disparo automático al cerrar la fase + botón Reenviar en el expediente.',
  'manual',
  '{"ui_location": "/dilesa/ventas/[id] (expediente) y captura Fase 11", "button_label": "Correo de escrituración"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  'admin@dilesa.mx',
  '[{"email": "escrituras@dilesa.mx", "type": "always"}]'::jsonb,
  '📜 Escrituración {proyecto} — {cliente} ({identificador})',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM core.notification_definitions
  WHERE slug = 'dilesa_escrituracion' AND empresa_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
