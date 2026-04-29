# Access guards audit — 2026-04-30

> Audit de cobertura de `<RequireAccess>` (ADR-024) sobre todas las
> pages del repo. Ejecutado al cerrar `access-denied-ux` Sprint 2.
>
> Si emerge un drift futuro (page nueva sin guard), regenerar este
> documento corriendo el grep abajo y agregando la fila.

## Cobertura por dominio (al 2026-04-30)

| Dominio                 | Pages | Guard | Notas                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx` (root)   | 1     | n/a   | Redirect → `/inicio`. No requiere guard.                                                                                                                                                                                                                                                          |
| `app/login/`            | 1     | n/a   | Page de auth, debe ser pública.                                                                                                                                                                                                                                                                   |
| `app/health/`           | 1     | ✅    | `<RequireAccess>` directo.                                                                                                                                                                                                                                                                        |
| `app/family/`           | 1     | ✅    | `<RequireAccess empresa="familia">`.                                                                                                                                                                                                                                                              |
| `app/personas-fisicas/` | 1     | ✅    | `<RequireAccess empresa="personas_fisicas">`.                                                                                                                                                                                                                                                     |
| `app/rnd/`              | 2     | ✅    | Guards via module shared.                                                                                                                                                                                                                                                                         |
| `app/inicio/`           | 3     | ⚠️    | Dashboard personal del usuario logueado — no tiene `<RequireAccess>` por diseño (sin permiso específico requerido). El `useEffect` con `getUser()` falla silencioso si no hay sesión. **Acción**: adopción incremental cuando `auth-required` pattern emerja como necesidad (Sprint 3 postponed). |
| `app/dilesa/`           | ~22   | ✅    | Page-level (`/dilesa/page.tsx`) tiene `<RequireAccess empresa="dilesa">`. Pages thin dentro delegan al module shared (e.g. `<EmpleadoDetailModule>` tiene su propio `<RequireAccess>`).                                                                                                           |
| `app/rdb/`              | ~13   | ✅    | Idem patrón DILESA. `<CortesView>` tiene `<RequireAccess empresa="rdb" modulo="rdb.cortes">`.                                                                                                                                                                                                     |
| `app/rh/`               | 4     | ✅    | Cross-empresa RH legacy; pages root redirigen a sub-pages que delegan a modules con guard.                                                                                                                                                                                                        |
| `app/settings/`         | 4     | ✅    | `<RequireAccess adminOnly>` o vía module. `/settings` redirige a `/settings/acceso`.                                                                                                                                                                                                              |
| `app/administracion/`   | 1     | ✅    | Documentos cross-empresa; module compartido con guard.                                                                                                                                                                                                                                            |
| `app/api/**`            | n/a   | RLS   | Server endpoints — defendidos por Supabase RLS, no UI guards.                                                                                                                                                                                                                                     |

**Total**: 68 pages. Cobertura efectiva: 100% (excepto `/inicio/*` por
diseño explícito; ver §Excepciones).

## Excepciones documentadas

### `/inicio/*` (dashboard personal)

`/inicio/page.tsx`, `/inicio/tasks/page.tsx`, `/inicio/juntas/page.tsx`
y `/inicio/juntas/[id]/page.tsx` no usan `<RequireAccess>` porque el
contenido es **personal del usuario logueado**, no específico de
empresa/módulo. El acceso se gobierna por:

- Las queries Supabase con `auth.getUser()` filtran por usuario actual.
- RLS en `erp.tasks`, `erp.juntas`, etc. restringe lectura al user.
- Si no hay sesión, las queries devuelven empty/error y el page rendea
  empty state — pero no muestra `<AccessDenied>`.

**Riesgo**: low. Sin sesión, la app no es funcional independientemente
de qué page se abra. El user reaches `/login` por flow normal (sidebar

> account menu > sign out, o session expira y un fetch falla).

**Si el riesgo crece** (e.g. compartir links de `/inicio/tasks/<id>`
entre usuarios sin sesión), agregar un wrapper `<RequireAuth>` que
verifique solo `auth.getUser() != null` sin permission check. Sprint 3
de `access-denied-ux` lo cubriría si surge.

## Patrón canónico de cobertura

3 niveles, en orden de preferencia:

1. **Page-level** (preferido cuando aplica):

   ```tsx
   export default function Page() {
     return (
       <RequireAccess empresa="rdb" modulo="rdb.cortes">
         <SomeView />
       </RequireAccess>
     );
   }
   ```

2. **Module-level** (cuando page es thin/delegado):

   ```tsx
   // page.tsx
   export default function Page() {
     return <EmpleadoDetailModule empresaSlug="dilesa" />;
   }
   // module.tsx
   export function EmpleadoDetailModule({ empresaSlug }) {
     return (
       <RequireAccess empresa={empresaSlug}>
         <Inner ... />
       </RequireAccess>
     );
   }
   ```

3. **View-level** (cuando page wrappea view component):
   ```tsx
   // app/rdb/cortes/page.tsx
   export default function CortesPage() {
     return <CortesView />;
   }
   // cortes-view.tsx
   export function CortesView() {
     return (
       <RequireAccess empresa="rdb" modulo="rdb.cortes">
         {/* ... */}
       </RequireAccess>
     );
   }
   ```

Cualquiera de los 3 cumple el contrato — el `<AccessDenied>` muestra el
`required` line correcto según los props. Code review chequea que el
guard exista en al menos uno de los 3 niveles.

## Cómo correr el audit manual

```bash
# Pages sin RequireAccess (directo en el archivo)
grep -L "RequireAccess\|isAdmin\|requireAuth" \
  $(find app -type f -name "page.tsx") 2>/dev/null \
  | grep -v "/login/\|app/page.tsx\|/health/" \
  | head -40

# Para cada hit del comando anterior, verificar:
#   1. ¿La page solo redirige? (`redirect(...)`) → OK, no requiere guard
#   2. ¿La page rendea un module/view que tiene <RequireAccess> dentro? → OK
#   3. ¿La page rendea contenido directo sin guard? → REVISAR
```

## Follow-up futuros (Sprint 3+)

- **Audit automatizado en CI**: lint custom o test que regrese fail si
  una page nueva en `app/<empresa>/**` o `app/settings/**` no tiene
  `<RequireAccess>` ni delega a module con guard.
- **`<RequireAuth>` componente**: para `/inicio/*` y similares que
  necesitan solo "usuario logueado".
- **Integrar `<RequestAccessButton>` con sistema de tickets**: cuando
  exista (Linear/Slack/email triage).
