-- ============================================================================
-- Iniciativa: notificaciones-catalogo · Sprint 1 — Schema base
-- ============================================================================
-- Crea catálogo runtime-editable de notificaciones (emails del sistema) +
-- log de envíos. Hoy hay 6 emails saliendo de BSOP vía Resend (welcome,
-- juntas terminar/reenviar, daily-task-summary, dilesa estimaciones PDF,
-- dilesa-sync GH Actions); todos viven hardcoded en código. Esta migración
-- es el cimiento para Sprint 2 (refactor handlers) + Sprint 3-4 (UI admin).
--
-- Componentes:
--   - core.notification_definitions (1 fila por slug × empresa_id, NULL global)
--   - core.notification_log (1 fila por envío real, FK SET NULL para preservar histórico)
--   - Backfill: 6 rows iniciales de los emails actuales con su config de hoy
--
-- Patrón BSOP:
--   - PK uuid + DEFAULT gen_random_uuid()
--   - RLS con core.fn_is_admin() (admin-only; sub-slug `settings.notificaciones`
--     se agrega en Sprint 3 cuando se cree la UI)
--   - created_at/updated_at + trigger fn_set_updated_at
--
-- Aditiva pura — no toca tablas existentes.
-- ============================================================================

-- ── 1. core.notification_definitions ────────────────────────────────────────

CREATE TABLE core.notification_definitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL,
  -- empresa_id NULL = definición global (welcome, sync). Override per-empresa
  -- con mismo slug + empresa_id != NULL si se quiere personalizar para una
  -- empresa específica (ej. minutas).
  empresa_id          uuid REFERENCES core.empresas(id) ON DELETE CASCADE,

  nombre              text NOT NULL,
  descripcion         text,

  -- Cómo se dispara este email.
  trigger_type        text NOT NULL
    CHECK (trigger_type IN ('cron','manual','webhook')),
  -- Config descriptiva del trigger. Estructura:
  --   cron:    {schedule_cron, schedule_human, defined_in}
  --   manual:  {ui_location, button_label}
  --   webhook: {endpoint_path, description}
  trigger_config      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Recipientes editables runtime.
  from_email          text NOT NULL,
  from_name           text,
  reply_to            text,
  -- Array de extras siempre añadidos: [{email: '...', type: 'cc'|'bcc'|'always'}]
  recipients_extra    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Subject template con vars {placeholder}. El handler hace replace.
  subject_template    text NOT NULL,

  -- Kill switch — si false, el handler logs status='skipped' sin enviar.
  activo              boolean NOT NULL DEFAULT true,

  -- Trazas.
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,

  CONSTRAINT notification_definitions_slug_empresa_uk UNIQUE (slug, empresa_id)
);

COMMENT ON TABLE core.notification_definitions IS
  'Catálogo runtime-editable de emails del sistema. Iniciativa '
  'notificaciones-catalogo. Cada handler que envía email lee su slug aquí '
  'antes de mandar (Sprint 2 refactoriza los 6 handlers actuales). '
  'UNIQUE(slug, empresa_id) permite definición global (empresa_id NULL) + '
  'overrides per-empresa con el mismo slug.';

COMMENT ON COLUMN core.notification_definitions.slug IS
  'Identificador estable del email. Valores actuales (Sprint 1 backfill): '
  '`welcome`, `junta_minuta`, `junta_reenviar`, `task_summary_daily`, '
  '`dilesa_estimacion`, `dilesa_sync_report`.';

COMMENT ON COLUMN core.notification_definitions.recipients_extra IS
  'Destinatarios FIJOS siempre añadidos (típicamente BCC al equipo de '
  'soporte). El destinatario principal (TO) sigue siendo derivado por el '
  'handler — ej. el cliente de la junta, el contratista de la estimación.';

COMMENT ON COLUMN core.notification_definitions.subject_template IS
  'Plantilla del subject con placeholders `{var}`. Handler hace replace '
  'con sus propias variables. Ej: "Bienvenido a BSOP, {firstName}".';

COMMENT ON COLUMN core.notification_definitions.activo IS
  'Kill switch sin deploy. Si false → handler escribe log status=skipped '
  'sin enviar. Útil para apagar un email que esté fallando mientras se '
  'investiga la causa.';

CREATE INDEX idx_notif_def_empresa ON core.notification_definitions(empresa_id);
CREATE INDEX idx_notif_def_slug ON core.notification_definitions(slug);

CREATE TRIGGER tg_notif_def_updated_at
  BEFORE UPDATE ON core.notification_definitions
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ── 2. core.notification_log ────────────────────────────────────────────────

CREATE TABLE core.notification_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL en lugar de CASCADE para preservar histórico si alguna vez se
  -- borra una definition. En la práctica casi nunca se borran (se desactivan).
  definition_id         uuid REFERENCES core.notification_definitions(id) ON DELETE SET NULL,
  -- Empresa de CONTEXTO del envío (puede diferir de def.empresa_id si la
  -- def es global pero el send fue per-empresa, ej. task-summary).
  empresa_id            uuid REFERENCES core.empresas(id) ON DELETE SET NULL,

  sent_at               timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL
    CHECK (status IN ('sent','failed','skipped')),
  -- {to: [...], cc: [...], bcc: [...]} — snapshot real del envío.
  recipients            jsonb NOT NULL,
  subject               text,
  -- ID que Resend devuelve, útil para tracing en su dashboard.
  resend_id             text,
  error_message         text,
  -- NULL si el envío vino de un cron sin sesión humana.
  triggered_by_user_id  uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  -- Espacio para data específica del envío (ej. junta_id, estimacion_id).
  -- Útil para drill-down futuro y auditoría.
  context               jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE core.notification_log IS
  'Log append-only de cada envío de email del sistema. Iniciativa '
  'notificaciones-catalogo. Sprint 2 conecta los handlers para escribir '
  'aquí; Sprint 3 UI expone últimos 20 envíos por definition. Sin TTL en '
  'v1 — si en 6 meses crece mucho, agregar policy DELETE WHERE sent_at < '
  'now() - interval ''90 days''.';

COMMENT ON COLUMN core.notification_log.status IS
  '`sent` = Resend aceptó (200 + resend_id). `failed` = Resend rechazó o '
  'fetch falló (error_message poblado). `skipped` = definition.activo = '
  'false al momento del trigger.';

COMMENT ON COLUMN core.notification_log.context IS
  'JSON libre con IDs/data específicos del envío para drill-down '
  '(junta_id, estimacion_id, persona_id, etc.). Sin esquema fijo — cada '
  'handler decide qué guardar.';

CREATE INDEX idx_notif_log_definition ON core.notification_log(definition_id);
CREATE INDEX idx_notif_log_empresa ON core.notification_log(empresa_id);
CREATE INDEX idx_notif_log_sent_at ON core.notification_log(sent_at DESC);
CREATE INDEX idx_notif_log_status ON core.notification_log(status)
  WHERE status != 'sent';  -- partial index — solo nos importa rastrear fallos

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE core.notification_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.notification_log ENABLE ROW LEVEL SECURITY;

-- Definitions: admin global READ/WRITE (sub-slug `settings.notificaciones`
-- se agregará en Sprint 3 cuando exista la UI — por ahora solo admin).
CREATE POLICY notif_def_select_admin
  ON core.notification_definitions
  FOR SELECT
  USING (core.fn_is_admin());

CREATE POLICY notif_def_modify_admin
  ON core.notification_definitions
  FOR ALL
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

-- Log: admin READ. INSERT abierto a `authenticated` para que los handlers
-- escriban (también lo hace service_role bypassing RLS para los crons).
CREATE POLICY notif_log_select_admin
  ON core.notification_log
  FOR SELECT
  USING (core.fn_is_admin());

CREATE POLICY notif_log_insert_authenticated
  ON core.notification_log
  FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated','service_role'));

-- ── 4. Backfill — 6 definiciones iniciales con config de hoy ────────────────
-- Refleja el estado actual del código. Sprint 2 conecta los handlers a leer
-- de aquí; hasta entonces estas rows son solo documentación viva.

INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
VALUES
  (
    'welcome',
    NULL,
    'Bienvenida a nuevo usuario',
    'Email enviado cuando un admin crea un usuario nuevo desde /settings/acceso. '
    'Incluye logo de las empresas asignadas, roles y módulos. Disparado por '
    'sendWelcomeEmailAction tras user creation.',
    'manual',
    '{"ui_location": "/settings/acceso", "button_label": "Crear usuario"}'::jsonb,
    'noreply@bsop.io',
    'BSOP',
    NULL,
    '[]'::jsonb,
    'Bienvenido a BSOP',
    true
  ),
  (
    'junta_minuta',
    NULL,
    'Minuta de junta — terminar',
    'Email enviado a asistentes + consejo de la empresa cuando un admin '
    'cierra una junta. Branding por empresa (header_url) vía '
    'lib/juntas/email.ts. Rate-limited a 5 req/s.',
    'manual',
    '{"ui_location": "/inicio/juntas/[id]", "button_label": "Terminar junta"}'::jsonb,
    'noreply@bsop.io',
    'BSOP',
    NULL,
    '[]'::jsonb,
    'Minuta — {junta_titulo}',
    true
  ),
  (
    'junta_reenviar',
    NULL,
    'Minuta de junta — reenviar',
    'Re-envío manual de una minuta ya cerrada. Mismo template que junta_minuta. '
    'Útil cuando se descubre un asistente faltante o un email rebotó.',
    'manual',
    '{"ui_location": "/inicio/juntas/[id]", "button_label": "Reenviar minuta"}'::jsonb,
    'noreply@bsop.io',
    'BSOP',
    NULL,
    '[]'::jsonb,
    'Minuta (reenvío) — {junta_titulo}',
    true
  ),
  (
    'task_summary_daily',
    NULL,
    'Resumen diario de tareas',
    'Cron diario que manda a cada empleado activo sus tareas pendientes '
    'agrupadas por urgencia (vencidas, hoy, esta semana, más adelante, '
    'sin fecha). Branding por empresa. Rate-limited a 5 req/s. Opcional '
    'TASK_SUMMARY_TEST_TO env var redirige todos los envíos.',
    'cron',
    '{"schedule_cron": "0 13 * * *", "schedule_human": "Diario 07:00 CST (13:00 UTC)", "defined_in": "vercel.json", "endpoint": "/api/cron/daily-task-summary"}'::jsonb,
    'noreply@bsop.io',
    'BSOP',
    NULL,
    '[]'::jsonb,
    'Tus tareas pendientes — {fecha}',
    true
  ),
  (
    'dilesa_estimacion',
    NULL,
    'Estimación DILESA al contratista (PDF)',
    'Email manual al contratista con el PDF de la estimación adjunto. '
    'Disparado desde el detalle de estimación. FROM hardcoded a '
    'facturas@bsop.io porque es el único dominio verificado en Resend '
    'free tier. reply_to apunta a facturas@dilesa.mx para que las '
    'respuestas lleguen a contabilidad.',
    'manual',
    '{"ui_location": "/dilesa/construccion/estimaciones/[id]", "button_label": "Enviar por email"}'::jsonb,
    'facturas@bsop.io',
    'DILESA Facturas',
    'facturas@dilesa.mx',
    '[]'::jsonb,
    'Estimación {codigo} — DILESA',
    true
  ),
  (
    'dilesa_sync_report',
    NULL,
    'Reporte del sync nocturno DILESA Coda→BSOP',
    'GH Actions cron que orquesta los 6 scripts de import de Coda y manda '
    'reporte de éxito/fallo + conteos pre/post + paridad con Coda. Vive '
    'fuera de Vercel (corre como npm en GH runner). FROM configurable '
    'vía SYNC_FROM_EMAIL env. TO via NOTIFY_EMAIL env (típicamente Beto).',
    'cron',
    '{"schedule_cron": "0 9 * * *", "schedule_human": "Diario 03:00 CST (09:00 UTC)", "defined_in": ".github/workflows/dilesa-coda-sync.yml", "script": "scripts/run-dilesa-sync.ts"}'::jsonb,
    'noreply@bsop.io',
    'BSOP Sync',
    NULL,
    '[]'::jsonb,
    '✓ Sync DILESA Coda→BSOP — {fecha}',
    true
  );

-- ── 5. PostgREST reload ─────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
