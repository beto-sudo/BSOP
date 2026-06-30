-- ╭─ 20260630230337_notif_empleado_alta_baja ─╮
-- Aviso informativo de alta / baja de personal al comité — continuación
-- (Fase 2) de la iniciativa `notificaciones-catalogo`. Reemplaza el correo
-- que Coda mandaba al dar de alta / baja a un empleado:
--   · ALTA → el comité pasa a darle la bienvenida personalmente (+ recordatorio
--            de crear accesos si aplica).
--   · BAJA → recordatorio de revocar usuarios y accesos de la persona.
--
-- Componentes:
--   1. `erp.empleados.notif_alta_at` / `notif_baja_at` — idempotencia del
--      disparo automático (mismo patrón notif_*_at que ya usan las ventas). El
--      botón "Reenviar aviso" del expediente ignora el timestamp.
--   2. Definiciones en `core.notification_definitions` (slugs `empleado_alta`
--      y `empleado_baja`) — UNA POR EMPRESA (DILESA + RDB), porque cada empresa
--      decide a quién avisa. Hoy ambas → comite@dilesa.mx (recipient `always`,
--      editable runtime en /settings/notificaciones sin deploy). from/subject/
--      kill switch también editables.
--
-- Aditiva pura. Robusta a Preview branches: el seed hace JOIN a core.empresas
-- (datos de referencia presentes en Preview) + ON CONFLICT (slug, empresa_id)
-- DO NOTHING — empresa_id es NOT NULL aquí, así que el UNIQUE sí protege.

BEGIN;

ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS notif_alta_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_baja_at timestamptz;

COMMENT ON COLUMN erp.empleados.notif_alta_at IS
  'Último envío del aviso de ALTA de personal al comité. Idempotencia del '
  'disparo automático al crear el empleado; el reenvío manual lo actualiza.';
COMMENT ON COLUMN erp.empleados.notif_baja_at IS
  'Último envío del aviso de BAJA de personal al comité. Idempotencia del '
  'disparo automático al registrar la baja; el reenvío manual lo actualiza.';

-- ── empleado_alta (DILESA + RDB) ─────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'empleado_alta',
  e.id,
  'Alta de personal — aviso al comité (' || upper(e.slug) || ')',
  'Aviso interno al comité cuando se registra el alta de un nuevo empleado. '
  'Incluye datos del ingreso (puesto, departamento, fecha, tipo de contrato) '
  'e invita a darle la bienvenida personalmente + recordatorio de crear '
  'accesos. Disparo automático al completar el alta + botón Reenviar en el '
  'expediente. Prueba con [PRUEBA] al correo del usuario autenticado.',
  'manual',
  '{"ui_location": "/<empresa>/rh/personal — wizard de alta", "button_label": "Aviso de alta"}'::jsonb,
  'noreply@bsop.io',
  coalesce(e.nombre_comercial, e.nombre),
  'comite@dilesa.mx',
  '[{"email": "comite@dilesa.mx", "type": "always"}]'::jsonb,
  'Nueva alta de personal — {nombre} ({puesto})',
  true
FROM core.empresas e
WHERE e.slug IN ('dilesa', 'rdb')
ON CONFLICT (slug, empresa_id) DO NOTHING;

-- ── empleado_baja (DILESA + RDB) ─────────────────────────────────────────
INSERT INTO core.notification_definitions
  (slug, empresa_id, nombre, descripcion, trigger_type, trigger_config,
   from_email, from_name, reply_to, recipients_extra, subject_template, activo)
SELECT
  'empleado_baja',
  e.id,
  'Baja de personal — aviso al comité (' || upper(e.slug) || ')',
  'Aviso interno al comité cuando se registra la baja de un empleado. Sirve de '
  'recordatorio para dar de baja sus usuarios y accesos (correo, sistemas, '
  'grupos de Workspace, accesos físicos, equipo). Incluye datos de la baja '
  '(puesto, antigüedad, fecha, motivo). Disparo automático al registrar la '
  'baja + botón Reenviar en el expediente. Prueba con [PRUEBA] al correo del '
  'usuario autenticado.',
  'manual',
  '{"ui_location": "/<empresa>/rh/personal/[id] — diálogo de baja", "button_label": "Aviso de baja"}'::jsonb,
  'noreply@bsop.io',
  coalesce(e.nombre_comercial, e.nombre),
  'comite@dilesa.mx',
  '[{"email": "comite@dilesa.mx", "type": "always"}]'::jsonb,
  'Baja de personal — {nombre} ({puesto})',
  true
FROM core.empresas e
WHERE e.slug IN ('dilesa', 'rdb')
ON CONFLICT (slug, empresa_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
