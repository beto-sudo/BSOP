# Contributing

Guía para trabajar en BSOP. Este proyecto está **en producción** (bsop.io) — todo cambio pasa por PR y preview deploy antes de mergear a `main`.

---

## Setup local

1. Requisitos: Node 20+ y npm 10+.
2. Clona e instala (ver [`README.md`](./README.md#arranque-rápido)).
3. Copia `.env.local.example` → `.env.local` y completa las variables.
4. `npm run dev`.

Si vas a correr E2E tests, copia también `.env.test.local.example` → `.env.test.local` y configura un usuario de prueba.

---

## Branching

Siempre partir de `main` actualizado.

| Prefijo | Uso |
|---------|-----|
| `feat/` | Funcionalidad nueva |
| `fix/` | Corrección de bug |
| `refactor/` | Cambio que no altera comportamiento |
| `chore/` | Mantenimiento, tooling, build, deps |
| `docs/` | Solo documentación |
| `test/` | Solo tests |
| `perf/` | Mejora de performance |

Nombre de rama: `<prefijo>/descripcion-corta-en-kebab-case`.

Ejemplos:
- `fix/rdb-cortes-timezone-drift`
- `feat/juntas-recordatorio-email`
- `chore/eslint-prettier-husky`

---

## Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/).

```
<tipo>(<scope opcional>): <descripción corta imperativa>

<cuerpo opcional explicando el porqué, no el qué>

<footer opcional: refs, breaking changes, co-autores>
```

Tipos permitidos: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `build`, `ci`, `revert`.

**Buenos ejemplos del historial**:

```
feat: add CSF fiscal fields to core.empresas + update empresas settings UI
refactor: consolidate ROUTE_TO_MODULE into lib/permissions.ts
fix: CSF viewer uses signed URLs for private storage bucket
```

Reglas prácticas:
- **Imperativo, no pasado** — "add feature", no "added feature".
- **≤ 72 caracteres** en la línea de asunto.
- **Un solo tema por commit** cuando sea razonable.
- En el cuerpo, explica el **porqué** (el diff ya muestra el qué).

---

## Flujo de PR

1. Crea rama desde `main` actualizado.
2. Haz tus cambios con commits convencionales.
3. Antes de abrir PR, localmente:
   - `npm run lint`
   - `npm run test:run`
   - Si tocaste E2E-relevant flows, `npm run test:e2e`.
4. Push y abre PR contra `main`.
5. Vercel genera un **preview deploy** automáticamente — pega la URL en el PR.
6. Valida en el preview antes de pedir merge.
7. Merge: usa **squash** salvo que haya razón explícita para preservar el historial.
8. Borra la rama remota al mergear.

### Qué incluye un buen PR

- Título que resume el cambio (mismo estilo que commit convencional).
- Body con **qué** cambió, **por qué** y **cómo probarlo**.
- Screenshots/GIFs si tocaste UI.
- Referencias a issues/tickets si aplica.
- Lista de **riesgos** si el cambio toca algo crítico (auth, permissions, payments, cortes).

---

## Reglas de código

- **TypeScript strict**. No uses `any` salvo con comentario justificando por qué.
- **Nombres en español para dominio de negocio** (empresas, juntas, cortes, pedidos, requisiciones) — consistente con el schema de DB. Nombres en inglés para infraestructura/librerías.
- **Schemas de Supabase**: siempre usa el cliente correcto (`supabase-browser`, `supabase-server`, `supabase-admin`). Nunca uses el service role key en cliente.
- **Fechas/timestamps**: la DB devuelve UTC. Siempre parsea con timezone apropiada — ver `lib/timezone.ts`. No uses `new Date(str)` crudo sin considerar zona.
- **RLS**: asume que está activo. Si una query falla por permisos, revisa la policy antes de escalar a `supabase-admin`.

---

## Base de datos

- Todos los cambios de schema van por **migración versionada** en `supabase/migrations/`.
- Nombra con timestamp: `YYYYMMDDHHMMSS_descripcion.sql`.
- **Nunca** edites tablas directamente en el dashboard de producción.
- Actualiza [`SCHEMA_ARCHITECTURE.md`](./SCHEMA_ARCHITECTURE.md) y [`supabase/SCHEMA_REF.md`](./supabase/SCHEMA_REF.md) cuando agregues/muevas/borres tablas o columnas.
- Antes de merger a `main`, corre la migración en un branch de Supabase o staging y valida.

---

## Seguridad

- **Nunca commitees secretos.** `.env.local`, `.env.auth`, `.git-credentials` y `*.key`/`*.pem` ya están en `.gitignore`.
- Si accidentalmente se commitea un secret:
  1. **Rótalo inmediatamente** en el proveedor (Supabase, Resend, Coda, etc.).
  2. Abre issue para scrub de historial con `git filter-repo`.
- Para tokens personales de GitHub usados por herramientas (ej. Claude Cowork), guárdalos en `.env.auth` (gitignored).

---

## Testing

- **Unit tests**: junto al código en `lib/*.test.ts`, corridos por Vitest.
- **E2E tests**: en `tests/e2e/`, corridos por Playwright.
- Todo PR que toque lógica crítica (permisos, auth, cálculos de cortes, pagos) debería incluir tests.
- La cobertura actual es baja — estamos creciéndola de manera dirigida. Si tu cambio justifica un test, agrégalo.

---

## Convenciones de archivos

- Componentes React: `PascalCase.tsx`.
- Utilities/lib: `kebab-case.ts`.
- Páginas de App Router: `page.tsx`, `layout.tsx`, `route.ts` (nombres fijos de Next).
- Tests: `<archivo>.test.ts` junto al código (unit) o en `tests/e2e/` (E2E).

---

## Dudas

Abre un issue o pregunta en el canal del equipo. Este documento es vivo — actualízalo cuando cambie el proceso.
