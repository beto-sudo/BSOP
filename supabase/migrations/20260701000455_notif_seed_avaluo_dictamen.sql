-- ╭─ 20260701000455_notif_seed_avaluo_dictamen ─╮
-- S5b (Fase 2 de `notificaciones-catalogo`) — centraliza 2 correos de ventas
-- que ya se mandan pero no estaban en el catálogo:
--
--   1. `dilesa_avaluo_solicitud` — al cerrar Fase 4, mail a la casa valuadora.
--   2. `dilesa_dictamen_solicitud` — al cerrar Fase 7, mail a la notaría.
--
-- Con el seed aparecen en /settings/notificaciones (kill switch + from/asunto +
-- recipientes extra editables). Los handlers se reconectan al catálogo en el
-- mismo PR (routes notify-solicitud-avaluo / -dictamen), FAIL-OPEN a los
-- defaults hardcoded de las libs. El destinatario principal sigue siendo
-- dinámico (valuador / notario); recipients_extra son copias fijas opcionales.
--
-- Global (empresa_id NULL): son correos DILESA y los handlers leen el slug con
-- venta.empresa_id (fallback a global). Aditiva pura, idempotente (NOT EXISTS).
-- Valores sembrados = los hardcoded de hoy.

BEGIN;

-- ── dilesa_avaluo_solicitud (global) ─────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_avaluo_solicitud',
  NULL,
  'Solicitud de avalúo al valuador (DILESA)',
  'Al cerrar la Fase 4 se manda a la casa valuadora los datos del inmueble y '
  'del comprador + un magic link para subir el dictamen sin login. Cc al gerente '
  'de ventas. Destinatario principal = email del valuador (dinámico).',
  'manual',
  '{"ui_location": "/dilesa/ventas/[id] — captura Fase 4 (solicitud de avalúo)", "button_label": "Solicitud de avalúo"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  NULL,
  '[]'::jsonb,
  'Solicitud de avalúo — {proyecto} · {unidad}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_avaluo_solicitud' AND empresa_id IS NULL
);

-- ── dilesa_dictamen_solicitud (global) ───────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_dictamen_solicitud',
  NULL,
  'Solicitud de dictaminación notarial (DILESA)',
  'Al cerrar la Fase 7 se manda a la notaría los datos del cliente, inmueble y '
  'crédito + un magic link para subir la Carta de Instrucción sin login. Cc al '
  'gerente de ventas. Destinatario principal = email del notario (dinámico).',
  'manual',
  '{"ui_location": "/dilesa/ventas/[id] — captura Fase 7 (solicitud de dictamen)", "button_label": "Solicitud de dictaminación"}'::jsonb,
  'noreply@bsop.io',
  'DILESA',
  NULL,
  '[]'::jsonb,
  'Solicitud de dictaminación notarial — {proyecto} · {unidad}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_dictamen_solicitud' AND empresa_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
