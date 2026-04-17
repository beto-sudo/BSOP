# BSOP — Arquitectura

Complemento de [`SCHEMA_ARCHITECTURE.md`](./SCHEMA_ARCHITECTURE.md) (que cubre el modelo de datos). Este documento describe la arquitectura de la aplicación.

---

## Vista de alto nivel

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router, RSC + Client Components)          │
└────────────┬─────────────────────────────────────────────────────┘
             │ HTTPS
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  proxy.ts (Next middleware)                                      │
│   ├─ Supabase SSR auth (cookies)                                 │
│   ├─ Resolución de permisos (lib/permissions.ts)                │
│   └─ Redirect / 403 si no autorizado                             │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers y Server Components                      │
│   ├─ app/[módulo]/...   → páginas (dominio)                      │
│   └─ app/api/...        → API routes                             │
└────────────┬─────────────────────────────────────────────────────┘
             │                                      │
             ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────────────┐
│  Supabase                │          │  Resend (email)              │
│   ├─ Postgres (schemas)  │          │  Playtomic API               │
│   ├─ Auth                │          │  Apple Health (ingest)       │
│   ├─ Storage             │          │  Coda (migración histórica)  │
│   └─ Edge Functions      │          └──────────────────────────────┘
└──────────────────────────┘
```

---

## Stack

| Capa | Elección | Por qué |
|------|----------|---------|
| Framework | Next.js 15 App Router | RSC, streaming, data fetching server-side, routing por filesystem |
| UI | Tailwind + shadcn/ui + Base UI | Primitivos accesibles + diseño tipado por utilidades |
| Auth | Supabase Auth (cookie-based SSR) | Misma fuente que la DB, RLS integrado |
| Datos | Supabase Postgres | Postgres completo + RLS + realtime + storage en una plataforma |
| Rich text | TipTap | Editor extensible (juntas, documentos, tareas) |
| Estado del servidor | Fetches server-side directos | No hay React Query todavía; candidato a introducir |
| i18n | Custom provider (`lib/i18n.tsx`) | Ligero, suficiente para ES/EN |
| Tests | Vitest + Playwright | Stack estándar de Next |

---

## Organización de código

### `app/` — rutas de Next

Cada subcarpeta que no sea `api/` corresponde a un **módulo de dominio**:

```
app/
  administracion/       Admin cross-empresa (documentos corporativos)
  agents/               Asistentes AI
  api/                  API routes (ver más abajo)
  auth/callback/        OAuth callback
  coda/[slug]/          Vistas compartidas de documentos
  compartir/[token]/    Enlaces públicos / shares
  dilesa/               Módulo empresa DILESA
  family/               Gastos familiares
  health/               Apple Health dashboard
  inicio/               Dashboard inicial (tasks + juntas)
  login/                Login (Google OAuth + magic link)
  rdb/                  Módulo empresa Rincón del Bosque (POS, cortes, inventario)
  rh/                   RRHH multi-empresa (empleados, puestos, departamentos)
  rnd/[id]/             Random / notebooks
  settings/             Configuración (acceso, empresas)
  travel/[slug]/        Viajes y gastos de travel
  usage/                Dashboard de uso de Claude / AI
```

Cada módulo sigue, cuando aplica, el patrón:

```
app/<módulo>/
  page.tsx              Landing / lista
  layout.tsx            Layout específico del módulo (opcional)
  <recurso>/            Sub-recursos (tasks, juntas, cortes, ...)
```

### `app/api/` — API routes

| Ruta | Método | Propósito | Auth |
|------|--------|-----------|------|
| `auth/google/route.ts` | GET | Redirect a Google OAuth | Anónimo |
| `health/ingest/route.ts` | POST | Ingesta de datos de Apple Health | Token (`HEALTH_INGEST_TOKEN`) |
| `impersonate/route.ts` | GET | Admin: ver la plataforma como otro usuario | Admin |
| `juntas/terminar/route.ts` | POST | Cerrar junta + enviar email resumen | Session |
| `usage/*` | GET | Dashboard de uso Claude/AI | Session |
| `welcome-email/route.ts` | POST | Enviar email de bienvenida a usuario nuevo | Service role |

### `components/`

Tres capas:

1. **`ui/`** — primitivos shadcn/ui (`button`, `table`, `sheet`, `popover`, …). No saben de dominio.
2. **`layout/`** — layout compartido (headers, sidebars).
3. **`shared/`** — componentes de aplicación reutilizables, agnósticos de dominio pero conscientes del patrón de uso (`row-actions.tsx`, `confirm-dialog.tsx`). Ver [UI Standards](#ui-standards).
4. **Raíz** — componentes de dominio grandes (`app-shell.tsx`, `health-dashboard-view.tsx`, `travel-expense-tracker.tsx`, `trip-*.tsx`, `presence-bar.tsx`, etc.). Refactor pendiente para separar en subcarpetas por dominio.

### `lib/`

Lógica compartida, framework-agnostic donde sea posible.

| Archivo | Rol |
|---------|-----|
| `supabase.ts`, `supabase-browser.ts`, `supabase-server.ts`, `supabase-admin.ts` | Factories de clientes según contexto |
| `permissions.ts` | RBAC: `fetchUserPermissions`, `canAccessModulo`, `ROUTE_TO_MODULE` |
| `i18n.tsx` | Provider de i18n (`lib/locales/en.json`, `es.json`) |
| `timezone.ts` | Helpers de parseo/formato con timezone (crítico para cortes) |
| `health.ts` | Utilidades del módulo Health |
| `welcome-email.ts` | Generación del email de bienvenida |
| `utils.ts` | Utilidades genéricas (`cn`, etc.) |

### `hooks/`

| Hook | Rol |
|------|-----|
| `use-presence.ts` | Sincroniza presencia en realtime |
| `use-sortable-table.ts` | Ordenamiento de tablas |

### `proxy.ts` — middleware

Se ejecuta en cada request antes del renderizado:
1. Hidrata la sesión de Supabase desde cookies.
2. Determina el módulo objetivo según la ruta (`ROUTE_TO_MODULE`).
3. Consulta permisos en `core.permisos_rol` + `core.permisos_usuario_excepcion`.
4. Redirige o deja pasar.

---

## Autenticación y permisos

**Stack de auth**: Supabase Auth con cookies SSR. `@supabase/ssr` maneja la sincronización entre cliente y servidor.

**Modelo de permisos** (vive en schema `core`):

- `usuarios` — identidades (enlazadas a `auth.users` de Supabase).
- `empresas` — catálogo de empresas (Rincón del Bosque, DILESA, ...).
- `usuarios_empresas` — qué usuarios pertenecen a qué empresa y con qué rol.
- `roles` — `administrador`, `operador`, `viewer`, …
- `modulos` — 22 módulos registrados (ej. `rdb_tasks`, `dilesa_rh`, `administracion_documentos`).
- `permisos_rol` — matriz rol×módulo con permisos (`read`, `write`).
- `permisos_usuario_excepcion` — overrides por usuario (raro).

**Resolución en runtime** (`lib/permissions.ts`):

1. `fetchUserPermissions(usuarioId, empresaId)` → lista de módulos accesibles.
2. `canAccessModulo(permisos, modulo, action)` → boolean.
3. Aplicado tanto en `proxy.ts` (gateway) como en `components/require-access.tsx` (client-side guard).

**RLS en DB**: todas las tablas operativas tienen RLS habilitada. Policies restringen por `empresa_id` y por permiso del usuario consultante.

---

## Datos

Ver [`SCHEMA_ARCHITECTURE.md`](./SCHEMA_ARCHITECTURE.md) para el mapa completo.

Resumen:

| Schema | Rol |
|--------|-----|
| `core` | Auth + acceso (plataforma) |
| `erp` | Multi-empresa (todas las entidades compartidas) |
| `rdb` | Lógica exclusiva de Rincón del Bosque (Waitry POS) |
| `dilesa` | (Reservado) lógica exclusiva de DILESA |
| `playtomic` | Sync de canchas deportivas |
| `public` | Salud personal, usage tracking |

**Migraciones**: todas en `supabase/migrations/`, nombradas con timestamp.

---

## Despliegue

- **Producción**: `main` → Vercel auto-deploy → **bsop.io**.
- **Preview**: cualquier rama con PR abierto → Vercel crea URL temporal.
- **Staging**: rama `staging` (cuando aplique) tiene su propia URL preview persistente.
- **Supabase**: un solo proyecto productivo. Cambios de schema vía migraciones commiteadas; correrlas en Supabase antes de mergear.

---

## Integraciones externas

| Sistema | Propósito | Dónde se usa |
|---------|-----------|--------------|
| Resend | Emails transaccionales | `/api/welcome-email`, `/api/juntas/terminar`, `app/settings/acceso/actions.ts` |
| Playtomic | Sync de reservas de canchas | `supabase/functions/playtomic-sync/` |
| Apple Health | Ingesta de datos de salud | `/api/health/ingest` + shortcut iOS del usuario |
| Coda | Migración histórica (read-only) | `scripts/migrate_dilesa_*.ts` (retirados después de migrar) |
| Google OAuth | Login | `/api/auth/google` + `/auth/callback` |

---

## Observabilidad

- Logs de runtime: Vercel runtime logs.
- Logs de DB: Supabase dashboard (query analyzer + audit logs).
- Advisors de seguridad: `supabase advisors` (correr periódicamente).

---

## Decisiones pendientes / deuda técnica

Ver [`docs/AUDIT_2026-04-16.md`](./docs/AUDIT_2026-04-16.md) para el estado actual, priorización y plan de acción. Puntos abiertos al momento de escribir este documento:

- Generación de types de Supabase (`supabase gen types`) no ejecutada — reemplazar los `.schema('x' as any)`.
- ESLint + Prettier + Husky no configurados aún.
- Cobertura de tests baja (<5%). Prioridad de tests: `lib/permissions`, API routes.
- Componentes >700 líneas candidatos a trocearse.
- Duplicación estructural entre módulos RDB ↔ DILESA — candidato a patrón parametrizable.
- `'use client'` aplicado de más — oportunidad de RSC.
- Sin rate limiting en APIs públicas.

---

## UI Standards

Estos estándares aplican a **toda pantalla de tipo lista/tabla** del proyecto, independiente del módulo o empresa. El objetivo: consistencia visual, accesibilidad, y una única definición del comportamiento destructivo.

### Row actions (editar · activar/desactivar · eliminar)

Componente canónico: **`components/shared/row-actions.tsx`**.

Renderiza un kebab menu (`⋮`) en la última columna de la tabla con, en este orden:

1. **Editar** (o "Ver / editar" si el row se navega a detalle).
2. **Toggle Activo / Inactivo** — side-effect directo (sin confirmación) porque es reversible.
3. **Eliminar** — destructivo, siempre pasa por `ConfirmDialog` (AlertDialog shadcn).

Contrato del componente:

```tsx
<RowActions
  ariaLabel={`Acciones para ${row.nombre}`}
  onEdit={{ onClick: () => openEdit(row) }}
  onToggle={{ activo: row.activo, onClick: () => handleToggleActivo(row) }}
  onDelete={{
    onConfirm: () => handleSoftDelete(row),
    confirmTitle: `¿Eliminar "${row.nombre}"?`,
    confirmDescription: 'Esta acción se puede revertir desde la base de datos.',
  }}
/>
```

Cualquier prop puede omitirse si la acción no aplica (por ejemplo, tablas de solo lectura omiten `onEdit` y `onDelete`). El menú se colapsa automáticamente.

Notas de implementación:

- `stopPropagation` interno para que el row permanezca clickeable (navegación a detalle) sin disparar el menú.
- `aria-label` obligatorio — identifica la fila para lectores de pantalla.
- Nunca usar `window.confirm` ni `alert` para acciones de fila. Usar `ConfirmDialog` + `useToast`.

### Confirmación destructiva (`components/shared/confirm-dialog.tsx`)

Envuelve `AlertDialog` de shadcn. Soporta `onConfirm` sincrónico o `async` — mientras resuelve, el botón Confirmar queda en loading. Props:

```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="¿Eliminar ...?"
  description="..."
  confirmLabel="Eliminar"
  cancelLabel="Cancelar"
  variant="destructive"
  onConfirm={async () => { ... }}
/>
```

### Notificaciones (`components/ui/toast.tsx`)

Wrapper sobre `@base-ui/react/toast`. Expuesto vía `useToast()`:

```tsx
const toast = useToast();
toast.add({ title: 'Departamento eliminado', type: 'success' });
toast.add({ title: 'No se pudo eliminar', description: err.message, type: 'error' });
```

`ToastProvider` está montado una sola vez en `components/providers.tsx` (envuelve a `PermissionsProvider`). **No** se debe instanciar localmente.

### Soft-delete (convención de datos)

Toda tabla operativa de dominio usa `deleted_at timestamptz NULL` en lugar de `DELETE` físico:

- **Eliminar** = `UPDATE ... SET deleted_at = NOW() WHERE id = ?`.
- **Leer listas** = `.is('deleted_at', null)` en el query.
- **Índice partial** recomendado:
  `CREATE INDEX <tabla>_deleted_idx ON <schema>.<tabla> (empresa_id) WHERE deleted_at IS NULL;`

Tablas ya convertidas: `erp.empleados`, `erp.personas`, `erp.departamentos`, `erp.puestos`, `erp.documentos`. Pendientes (pendientes de auditar): tablas de `rdb.*` y `dilesa.*` de alto volumen.

Dos razones para preferir soft-delete frente a `DELETE`:

1. Cualquier FK histórica (reportes, nómina, auditoría) deja de romperse.
2. Reversible en segundos sin restore de backup.

### Activo vs eliminado — cuándo usar cuál

| Estado | Columna | UI | Significado |
|--------|---------|----|-------------|
| Activo | `activo = true`, `deleted_at IS NULL` | Fila normal | Aparece en selectores y reportes. |
| Inactivo | `activo = false`, `deleted_at IS NULL` | Fila tenue / badge `Inactivo` | Fuera de uso operativo pero consultable. |
| Eliminado | `deleted_at IS NOT NULL` | No aparece | Fuera de listados. Recuperable manualmente. |

### Smoke test sugerido (Playwright)

Ubicación propuesta: `tests/e2e/rh-row-actions.spec.ts`. Cubre por empresa (`/rh`, `/rdb/rh`, `/dilesa/rh`) y por recurso (`departamentos`, `puestos`, `empleados`) los tres caminos: editar-cancelar, toggle activo, eliminar-con-confirm. Ver tarea #9.

---

## Glosario

- **Corte** — cierre operativo de un turno/día en RDB.
- **Junta** — reunión con acta, participantes y tareas derivadas.
- **Requisición** — solicitud interna de compra.
- **Empresa** — entidad de negocio (Rincón del Bosque, DILESA, ...).
- **Módulo** — unidad de funcionalidad sujeta a permiso (ej. `rdb_cortes`, `dilesa_rh`).
