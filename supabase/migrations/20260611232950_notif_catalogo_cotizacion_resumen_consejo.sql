-- ╭─ 20260611232950_notif_catalogo_cotizacion_resumen_consejo ─╮
-- Completa el catálogo `core.notification_definitions` con 2 envíos que ya
-- corren en prod pero con destinatarios hardcodeados (auditoría de grupos
-- de email DILESA, 2026-06-11):
--
--   1. `dilesa_cotizacion` — el handler de RFQ
--      (`app/api/dilesa/cotizaciones/[id]/solicitud`) consulta este slug
--      desde el Sprint 2 de notificaciones-catalogo, pero la fila nunca se
--      sembró → siempre caía al fallback hardcode. Con la fila, from /
--      reply-to (compras@dilesa.mx) / subject quedan editables runtime.
--   2. `dilesa_resumen_consejo` — el cron diario al Consejo mandaba a
--      `consejo@dilesa.mx` hardcodeado; este PR refactoriza el handler para
--      leer el catálogo (destinatario como recipient extra `always`, mismo
--      patrón que escrituras@ en `dilesa_escrituracion`) + kill switch.
--
-- Data-only (sin DDL → sin NOTIFY pgrst). Robusta a Preview branches: sin
-- FK a datos de prod; idempotente vía WHERE NOT EXISTS — el UNIQUE
-- (slug, empresa_id) no protege duplicados cuando empresa_id es NULL.

BEGIN;

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_cotizacion',
  NULL,
  'Solicitud de cotización (RFQ) a proveedor',
  'Email al proveedor con el PDF de la solicitud de cotización adjunto '
  '(listado de conceptos a cotizar, fecha límite). Las respuestas llegan al '
  'grupo compras@dilesa.mx vía reply-to. Disparo manual desde el detalle de '
  'la cotización en /dilesa/compras.',
  'manual',
  '{"ui_location": "/dilesa/compras (detalle de cotización)", "button_label": "Enviar solicitud"}'::jsonb,
  'noreply@bsop.io',
  'DILESA Compras',
  'compras@dilesa.mx',
  '[]'::jsonb,
  'Solicitud de cotización {folio} — DILESA',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM core.notification_definitions
  WHERE slug = 'dilesa_cotizacion' AND empresa_id IS NULL
);

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_resumen_consejo',
  NULL,
  'Resumen Diario Operación DILESA al Consejo',
  'Correo diario (lunes a sábado, 20:00 hora de Matamoros) al grupo '
  'consejo@dilesa.mx con los 7 bloques de operación: saldos bancos, avances '
  'de obra, margen, inventario, tubería de ventas, asignaciones y '
  'contratistas. El destinatario vive como recipient extra `always`; '
  'RESUMEN_CONSEJO_TEST_TO (env) lo overridea en modo prueba.',
  'cron',
  '{"schedule": "0 1,2 * * *", "guard": "solo la corrida que cae a las 20:00 de Matamoros; domingo no se envía"}'::jsonb,
  'noreply@bsop.io',
  'Desarrollo Inmobiliario los Encinos',
  NULL,
  '[{"email": "consejo@dilesa.mx", "type": "always"}]'::jsonb,
  'Resumen Diario Operación Dilesa 🏘️ {fecha}',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM core.notification_definitions
  WHERE slug = 'dilesa_resumen_consejo' AND empresa_id IS NULL
);

COMMIT;
