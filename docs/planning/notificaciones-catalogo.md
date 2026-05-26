# Iniciativa — Catálogo de notificaciones (emails del sistema)

**Slug:** `notificaciones-catalogo`
**Empresas:** todas (modelo empresa-aware con NULL = global)
**Schemas afectados:** `core` (2 tablas nuevas: `notification_definitions`, `notification_log`)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (4 sprints mergeados, iniciativa cerrada)

## Problema

Hoy hay 6 tipos de email saliendo de BSOP vía Resend y NO hay un lugar
único donde ver qué se manda, cuándo, a quién, ni si la última vez
funcionó. La info vive dispersa en:

- `app/api/welcome-email/route.ts` + `lib/welcome-email.ts`
- `app/api/juntas/terminar/route.ts` + `lib/juntas/email.ts`
- `app/api/juntas/reenviar/route.ts`
- `app/api/cron/daily-task-summary/route.ts` + `lib/task-summary-email.ts`
- `app/api/dilesa/estimaciones/[id]/pdf/route.tsx`
- `scripts/run-dilesa-sync.ts` (GH Actions cron)

Cuando un correo falla o cuando alguien pregunta "¿quién recibe esto?",
hay que abrir 6 archivos. Cero observabilidad. Cero kill switch sin
deploy. Cero forma de agregar un BCC al equipo de soporte sin tocar
código.

## Outcome esperado

- Página admin `/settings/notificaciones` con:
  - Lista de los 6 emails actuales (extensible a futuros).
  - Filtro por empresa (algunos son globales).
  - Drill-down: trigger, FROM, TO, schedule, preview HTML read-only,
    últimos 20 envíos con status/recipientes/error si falló.
  - Edición runtime de: `from_email`, `from_name`, `reply_to`,
    `recipients_extra` (BCC fijo), `subject`, `activo` (kill switch).
  - Botón "Test send" que envía con datos dummy al admin actual.

- Cada handler refactorizado para leer config de DB en lugar de
  hardcoded + escribir log al final de cada envío.

## Alcance v1 cerrado

### Lo que SÍ entra v1

- **6 emails** documentados como `notification_definitions` rows.
- **Editable runtime**: from_email, from_name, reply_to,
  recipients_extra (jsonb), subject (template), activo (bool kill).
- **Log de envíos** en `core.notification_log` con status, recipientes,
  error, resend_id.
- **UI catálogo + detalle + editar + test send**.
- **Empresa-aware**: tabla con `empresa_id` nullable. Algunas
  definiciones son globales (welcome, sync-report). Otras se
  particularizan por empresa (minutas, task-summary, estimaciones).
- **RBAC**: sub-slug nuevo `settings.notificaciones`. Solo admin
  global o quienes tengan ese sub-slug.

### Lo que NO entra v1 (explícito)

- **Editar HTML del template inline** (D1a): el template HTML sigue en
  código (versionado en Git). UI muestra preview read-only. Editar
  requiere PR. Razón: editar HTML desde textarea es peligroso y un
  typo rompe el render para todos.
- **Editar el schedule del cron** (D2a): los crons viven en
  `vercel.json` y `.github/workflows/`. Editar requiere PR + deploy.
  La UI muestra el schedule read-only con texto "para cambiar la
  hora, abrir PR".
- **Test send con datos reales** (D3): el test usa mock data. Para
  emails que necesitan contexto (minuta de junta, estimación
  específica), el test usa fixtures hardcodeadas. Validación real
  sigue siendo correr el flujo normal.

## Modelo conceptual

### `core.notification_definitions`

```sql
CREATE TABLE core.notification_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,                    -- 'welcome', 'junta_minuta', etc.
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  -- NULL = global. UNIQUE(slug, empresa_id) permite tener una row global
  -- y luego overrides per-empresa con el mismo slug.

  nombre text NOT NULL,                  -- "Welcome email"
  descripcion text,                       -- Qué hace y cuándo
  trigger_type text NOT NULL,             -- 'cron' | 'manual' | 'webhook'
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Para cron: {schedule_cron, schedule_human, defined_in}
  -- Para manual: {ui_location, button_label}

  -- Recipientes editables
  from_email text NOT NULL,
  from_name text,
  reply_to text,
  recipients_extra jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Array de objetos: [{email, type: 'cc'|'bcc'|'always'}]

  -- Subject editable (template con vars)
  subject_template text NOT NULL,
  -- Ejemplo: "Bienvenido a BSOP, {firstName}"

  -- Kill switch
  activo boolean NOT NULL DEFAULT true,

  -- Trazas
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),

  UNIQUE(slug, empresa_id)  -- NULL es válido para "global"
);
```

### `core.notification_log`

```sql
CREATE TABLE core.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid REFERENCES core.notification_definitions(id) ON DELETE SET NULL,
  -- ON DELETE SET NULL para no perder histórico si se borra una definición.
  -- (En la práctica casi nunca se borrarán, solo se desactivan.)
  empresa_id uuid REFERENCES core.empresas(id),
  -- Empresa de contexto del envío (puede diferir del def.empresa_id si la
  -- def es global pero el send fue per-empresa, ej. task-summary).

  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,                  -- 'sent' | 'failed' | 'skipped'
  recipients jsonb NOT NULL,             -- {to: [...], cc: [...], bcc: [...]}
  subject text,
  resend_id text,                         -- ID que Resend devuelve para tracing
  error_message text,                     -- NULL si status=sent
  triggered_by_user_id uuid REFERENCES auth.users(id),
  -- NULL si vino de cron sin sesión humana.

  context jsonb NOT NULL DEFAULT '{}'::jsonb
  -- Espacio para data específica del envío (ej. para minutas: junta_id;
  -- para estimaciones: estimacion_id). Útil para drill-down futuro.
);
```

### RLS

- `notification_definitions` SELECT: admin global o sub-slug
  `settings.notificaciones`.
- `notification_definitions` UPDATE: mismo.
- `notification_log` SELECT: mismo.
- `notification_log` INSERT: cualquiera autenticado + service_role (los
  handlers usan service_role en cron, anon en server actions).

## Sprints

### Sprint 1 — Schema + helper + backfill

- Migración `core.notification_definitions` + `core.notification_log`
  con RLS canónica.
- Backfill: INSERT inicial de los 6 emails actuales con su config
  hardcoded de hoy (slug + empresa_id + recipients vacíos +
  subject = literal de hoy + activo = true).
- Helper `lib/notifications/`:
  - `getDefinitionBySlug(slug, empresa_id?)` — lee definition.
    Maneja override per-empresa con fallback a global.
  - `writeLog(definition_id, ...)` — escribe log.
  - Types compartidos (`NotificationDefinition`, `NotificationLog`).

### Sprint 2 — Refactor 6 handlers

Para cada uno de los 6 handlers:

1. Leer definition al inicio. Si `activo === false` → skip + log con
   `status='skipped'`.
2. Aplicar overrides editables: from/reply_to/recipients_extra/subject.
3. Mantener HTML body en código (no editable).
4. Después del send: escribir log con status + recipients + resend_id.

Orden de risk-progression:

- Primero: sync (poco impacto si rompe, solo un email a admin).
- Después: welcome, task-summary, estimaciones.
- Al final: minutas (las más críticas — clientes externos las leen).

### Sprint 3 — UI catálogo read-only

- Sub-slug RBAC nuevo `settings.notificaciones` + sync 4 lugares.
- Page `/settings/notificaciones`:
  - Lista de definitions agrupada por trigger_type.
  - Filtro por empresa.
  - Drill-down con: descripción, trigger, schedule (si cron), recipientes
    actuales (computed: from + recipients_extra + lógica del handler),
    preview HTML (renderiza con datos dummy), últimos 20 logs.

### Sprint 4 — UI edit + test send + closeout

- Form de edición (from/from_name/reply_to/recipients_extra/subject/
  activo) con `<Form>` canónico (ADR-016).
- Server action update + audit trail (`updated_by`).
- Botón "Test send" que llama endpoint `POST /api/notifications/test-send`
  con el slug. Endpoint usa fixtures dummy y manda al admin actual.
- Closeout.

## Decisiones registradas

- **2026-05-26** (D1a): HTML del template en código, no editable inline.
  UI muestra preview read-only. Razón: editar HTML desde UI es
  peligroso y un typo rompe a todos los recipientes.
- **2026-05-26** (D2a): schedule del cron read-only (en vercel.json /
  GH Actions). Razón: cambiar el schedule requiere deploy igual; no
  vale la pena duplicar el storage.
- **2026-05-26** (D3): test send con datos dummy hardcodeados al admin
  actual. Razón: simplifica la implementación y elimina el riesgo de
  spam accidental a clientes reales.
- **2026-05-26** (D4): empresa-aware con UNIQUE(slug, empresa_id) y
  empresa_id nullable = global. Razón: la mayoría de emails son
  per-empresa, pero algunos (welcome, sync) son globales. UNIQUE
  permite override per-empresa de un email global en el futuro.
- **2026-05-26** (D5): RBAC sub-slug nuevo `settings.notificaciones`
  (no reusa el de `settings.acceso` o `settings.empresas` porque el
  scope es distinto y queremos permitir que el equipo de marketing
  edite emails sin tener acceso a usuarios o empresas).
- **2026-05-26** (D6): tabla `notification_log` con ON DELETE SET NULL
  hacia definitions, para preservar histórico si se borra una
  definición. En práctica las definiciones casi nunca se borran (se
  desactivan).

## Bitácora

- **2026-05-26** — Promovida tras audit de los 6 emails reales + Q&A
  con Beto. Planning doc + fila INITIATIVES.md.
- **2026-05-26** — Sprint 1 mergeado (PR #543): migración
  `20260526155000` con 2 tablas en `core` + RLS admin-only + 6 rows
  backfill. Helper `lib/notifications/` con `getDefinitionBySlug`
  FAIL-OPEN, `writeNotificationLog`, `renderSubject`,
  `splitRecipientsExtra` + 9 unit tests. Aplicada a prod tras
  aprobación verbal de Beto.
- **2026-05-26** — Sprint 2 mergeado (PR #545): refactor de los 6
  handlers (sync, welcome, task-summary cron, dilesa-estimacion,
  juntas terminar + reenviar) para leer config del catálogo +
  escribir log. FAIL-OPEN si DB no responde. Helpers reforzados con
  try/catch para sobrevivir a clientes mock en tests.
- **2026-05-26** — Sprint 3 mergeado (PR #547): UI catálogo
  read-only en `/settings/notificaciones`. Migración
  `20260526200000` agregó sub-slug RBAC `settings.notificaciones` +
  4 lugares de sync (nav-config, ROUTE_TO_MODULE, permissions.test,
  nav test). Page admin-gated con lista agrupada por trigger_type +
  filtro por empresa + DetailDrawer con config + últimos 20 logs.
- **2026-05-26** — Sprint 4 mergeado (PR #548): server action
  `updateDefinitionAction` editando from/reply_to/recipients_extra/
  subject/activo. API `POST /api/notifications/test-send` que manda
  correo dummy SOLO al admin clicker. UI con form editable + editor
  de recipientes (add/remove/cambiar tipo) + botones Guardar / Test
  send con feedback de status.
- **2026-05-26** — Iniciativa cerrada. Pendiente: Beto valida cada
  correo end-to-end via la nueva UI (test send + envío real).

## Riesgos / open topics

- **R1 (alto)**: Sprint 2 toca handlers de producción críticos
  (minutas a clientes externos, estimaciones a contratistas). Una
  regresión silenciosa rompe comunicación con stakeholders. Mitigación:
  refactor uno por uno, empezando por sync (bajo impacto). Cada
  handler conserva un fallback "si fail al leer config, usa hardcoded".
- **R2**: el log puede crecer rápido (task-summary manda N emails por
  día × 365 = miles/año). Sin paginación / TTL puede pesar. v1 no
  incluye TTL — si en 6 meses pesa mucho, agregar policy de
  `DELETE WHERE sent_at < now() - interval '90 days'` o particionar.
- **R3**: Sprint 4 botón "test send" puede ser explotable como vector
  de spam si no se rate-limita. Mitigación: solo admin, solo manda al
  email del usuario que clickeó (no permite ingresar destinatario),
  rate limit 5/min por admin.
- **R4**: definitions globales vs per-empresa — la lógica de fallback
  ("si no hay row con empresa_id=X usa la global con NULL") puede ser
  confusa. Cubrir con tests del helper.

## Métricas de éxito

1. Beto puede contestar "¿se mandó el cron de tareas hoy?" mirando
   `/settings/notificaciones` sin abrir Vercel logs ni GitHub Actions.
2. Beto puede agregar un BCC fijo al equipo de soporte para ver todos
   los correos de minutas, sin tocar código.
3. Beto puede desactivar un email roto en 1 click (kill switch) y
   reactivarlo cuando se arregle.
4. Cero regresiones en los 6 emails post-refactor (verificación: cada
   uno se prueba manualmente con un test send antes de mergear Sprint
   2).
