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
3. **Raíz** — componentes de dominio grandes (`app-shell.tsx`, `health-dashboard-view.tsx`, `travel-expense-tracker.tsx`, `trip-*.tsx`, `presence-bar.tsx`, etc.). Refactor pendiente para separar en subcarpetas por dominio.

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

## Glosario

- **Corte** — cierre operativo de un turno/día en RDB.
- **Junta** — reunión con acta, participantes y tareas derivadas.
- **Requisición** — solicitud interna de compra.
- **Empresa** — entidad de negocio (Rincón del Bosque, DILESA, ...).
- **Módulo** — unidad de funcionalidad sujeta a permiso (ej. `rdb_cortes`, `dilesa_rh`).
