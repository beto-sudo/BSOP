-- ╭─ 20260630235504_notif_seed_orden_compra_briefing ─╮
-- S5 (Fase 2 de `notificaciones-catalogo`) — primer lote de centralización.
-- Dos correos que el sistema ya manda pero NO estaban registrados en el
-- catálogo, por lo que no se veían ni se podían apagar/editar en
-- /settings/notificaciones:
--
--   1. `dilesa_orden_compra` — el endpoint POST de la OC YA lee el catálogo con
--      fail-open (getDefinitionBySlug + kill switch + log), solo le faltaba la
--      fila. Con esto aparece, se puede apagar y editar from/subject. Global
--      (el handler busca el slug sin empresa_id). Valores = los hardcoded de hoy.
--   2. `daily_briefing` — el cron matutino de Beto. La fila lo hace visible +
--      apagable + editable (from/subject/destinatario); el handler se reconecta
--      al catálogo en el mismo PR (fail-open a los valores de hoy).
--
-- Aditiva pura, idempotente vía WHERE NOT EXISTS (slug global, empresa_id IS
-- NULL — el UNIQUE no cubre NULL). Sin tocar comportamiento: los handlers caen
-- a sus defaults hardcoded si el catálogo no responde.

BEGIN;

-- ── dilesa_orden_compra (global) ─────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'dilesa_orden_compra',
  NULL,
  'Orden de compra al proveedor (DILESA)',
  'Envía la orden de compra en PDF al proveedor adjudicado. Se dispara desde el '
  'detalle de la OC (botón Enviar). El destinatario es el email del proveedor '
  '(no un recipiente fijo); from/asunto/kill switch editables aquí.',
  'manual',
  '{"ui_location": "/dilesa/compras — detalle de la orden de compra", "button_label": "Enviar OC al proveedor"}'::jsonb,
  'noreply@bsop.io',
  'DILESA Compras',
  'compras@dilesa.mx',
  '[]'::jsonb,
  'Orden de compra {folio} — DILESA',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'dilesa_orden_compra' AND empresa_id IS NULL
);

-- ── daily_briefing (global) ──────────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'daily_briefing',
  NULL,
  'Briefing matutino (Beto)',
  'Briefing diario que redacta Claude (salud + agenda + correo + FX/noticias) y '
  'se manda por correo cada mañana ~07:00 hora de Matamoros. Cron en Vercel '
  '(0 12,13 UTC + guard de hora local). Destinatario, from y asunto editables.',
  'cron',
  '{"schedule_cron": "0 12,13 * * *", "schedule_human": "~07:00 Matamoros (guard de hora local, auto-DST)", "defined_in": "vercel.json"}'::jsonb,
  'briefing@bsop.io',
  'Daily Briefing',
  NULL,
  '[{"email": "beto@anorte.com", "type": "always"}]'::jsonb,
  'Daily Briefing — {fecha} ({dia})',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM core.notification_definitions
  WHERE slug = 'daily_briefing' AND empresa_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
