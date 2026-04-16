# BSOP — Sistema de Operaciones de Negocio

ERP multi-empresa construido en Next.js 15 (App Router) sobre Supabase. Cubre RH, juntas, tareas, administración, punto de venta, inventario, cortes y reservas deportivas para Rincón del Bosque, DILESA y empresas hermanas.

Producción: **https://bsop.io**

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 (App Router, React Server Components) |
| Lenguaje | TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui + Base UI |
| Editor rich-text | TipTap |
| Datos | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Schemas | `core`, `erp`, `rdb`, `dilesa`, `playtomic`, `public` |
| Email | Resend |
| Integraciones | Coda (migración histórica), Playtomic (sync de canchas), Apple Health |
| Tests | Vitest (unit) + Playwright (E2E) |
| Despliegue | Vercel |

---

## Arranque rápido

### 1. Clonar e instalar

```bash
git clone https://github.com/beto-sudo/BSOP.git
cd BSOP
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
# Edita .env.local con los valores del proyecto Supabase
```

Ver [`.env.local.example`](./.env.local.example) para la lista completa de variables requeridas.

### 3. Levantar el dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack si está habilitado) |
| `npm run build` | Build de producción |
| `npm run start` | Correr el build de producción local |
| `npm run lint` | ESLint (Next.js) |
| `npm run test` | Unit tests con Vitest en watch mode |
| `npm run test:run` | Unit tests single run |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run test:e2e` | E2E tests con Playwright |
| `npm run test:e2e:ui` | Playwright en modo UI |
| `npm run test:e2e:anon` | Solo specs anónimas |
| `npm run test:e2e:auth` | Solo specs autenticadas (requiere `.env.test.local`) |
| `npm run audit:ui` | Audit heurístico de la UI |

---

## Estructura del proyecto

Para el overview detallado, ver [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Para el modelo de datos, ver [`SCHEMA_ARCHITECTURE.md`](./SCHEMA_ARCHITECTURE.md) y [`supabase/SCHEMA_REF.md`](./supabase/SCHEMA_REF.md).

```
app/              Páginas y rutas (App Router)
  api/            API routes
  [módulo]/       Módulos de negocio (rdb, dilesa, rh, travel, coda, ...)
components/       Componentes React
  ui/             Primitivos (shadcn/ui)
  layout/         Layout shared
hooks/            Custom React hooks
lib/              Lógica compartida (supabase clients, permissions, i18n, timezone)
  locales/        i18n (es / en)
proxy.ts          Middleware de auth y enforcement de permisos
supabase/         Migraciones SQL, functions y docs del schema
scripts/          Scripts operativos (migraciones de datos, backfills, audits)
tests/            E2E (Playwright); unit tests viven junto al código en `lib/*.test.ts`
docs/             Documentación técnica y arquitectura
  archive/        Archivos históricos retirados del código activo
```

---

## Flujo de trabajo

1. Ramas de feature/fix desde `main` siguiendo la convención `feat/…`, `fix/…`, `refactor/…`, `chore/…`, `docs/…`.
2. Commits convencionales (`feat:`, `fix:`, `refactor:`, etc.) — ver [`CONTRIBUTING.md`](./CONTRIBUTING.md).
3. PR a `main`. Vercel crea un preview deploy automáticamente.
4. Después de validar en el preview, se mergea a `main` y Vercel redespliega producción a **bsop.io**.

Para convenciones detalladas, ver [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Estado de producción

El sistema está **en vivo** y sirve operaciones diarias. Antes de cambios:

- Validar en preview deploy antes de mergear a `main`.
- Ver cambios de schema: siempre a través de migraciones versionadas en `supabase/migrations/`. Nunca editar tablas en producción desde el dashboard.
- RLS está activo en la mayoría de las tablas — ver auditoría con `supabase advisors`.

---

## Licencia

Privado — uso interno.
