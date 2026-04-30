# ADR-027 — "Viendo como" honesto: read-only + override de userId

- **Status**: Accepted
- **Date**: 2026-04-30
- **Authors**: Beto, Claude Code (iniciativa `viendo-como-readonly`)
- **Companion to**: [proxy.ts](../../proxy.ts), [`lib/auth/preview-guard.ts`](../../lib/auth/preview-guard.ts), [`lib/auth/effective-user.ts`](../../lib/auth/effective-user.ts)

---

## Contexto

La feature "Viendo como" permite a un admin ver la app desde la perspectiva de otro usuario. Originalmente era **preview cosmético**: el endpoint `GET /api/impersonate?userId=X` devolvía los permisos efectivos del target, el frontend los ponía en `PermissionsContext`, y el sidebar filtraba con esos permisos. La sesión Supabase **nunca cambiaba**.

Beto descubrió 3 huecos al darle de alta a un usuario nuevo (Maribel) y "verla":

1. **`/inicio` mostraba sus tareas, no las de Maribel.** Los widgets `MisTareasWidget` y `FechasImportantesWidget` usaban `supabase.auth.getUser()` directo → filtraban por `auth.uid()` real (admin), no por el impersonado.

2. **Todos los módulos del panel DILESA seguían accesibles** aunque el sidebar los ocultara. Las pages server-side ejecutaban RLS contra la sesión real (admin) y dejaban pasar todo si conocías la URL.

3. **Audit trail roto si el admin "edita por error"** durante el preview. Si Beto en preview de Maribel pulsa "guardar" en un form, la mutation se ejecuta como Beto admin (saltándose RLS de Maribel) y queda registrada como acción de Beto, sin marca de que estaba en preview.

El banner naranja ("👁️ Viendo como X") sugería algo más fuerte de lo que la feature realmente hacía.

## Decisión

Cerrar el hueco con el **camino B** (preview cosmético + read-only + override de userId para reads "míos"), no con suplantación honesta de sesión Supabase.

### Camino B (elegido)

- **Cookie httpOnly `bsop_preview_as`** marca la sesión de preview, set por `POST /api/impersonate`, borrada por `POST /api/impersonate/stop`. Solo el server la lee.
- **Read-only enforcement** en 3 capas:
  - **`proxy.ts`** rechaza POST/PUT/PATCH/DELETE en `/api/**` con 403 cuando la cookie está set, excepto `/api/impersonate` y `/api/impersonate/stop` (management).
  - **`assertNotInPreview()`** al inicio de cada server action que muta. Throws `PreviewModeError`. Cubre el 100% de las server actions auditadas (~37 funciones).
  - **`useReadOnlyMode()`** hook frontend deshabilita CTAs de creación/edición — feedback visual rápido sin esperar el 403 server.
- **Override de userId para widgets "míos"**: `getEffectiveUser(supabase)` server-side resuelve la identidad efectiva. Los widgets de `/inicio/*` (`MisTareasWidget`, `FechasImportantesWidget`, `app/inicio/juntas/page.tsx`, `TasksModule` con `onlyMine`) lo usan vía `useEffectiveUser()` hook + endpoint `GET /api/me`.
- **Cero DDL.** Cero cambio en RLS. Todo es app + cookie + helpers.

### Camino A (descartado)

Suplantación honesta de sesión Supabase: el server tendría que autenticarse como el target (no trivial sin password) o usar cookies separadas + reescritura de RLS para resolver `effective_user_id` server-side. Audit dual obligatorio (actor real + actor efectivo en cada row mutada).

**Razón del rechazo:** 5–10× más caro y resuelve más de lo que el caso de uso real pide. El admin quiere _sanity-check_ qué ve un usuario, no _operar_ como ese usuario.

## Reglas (V1-V5)

### V1 — Toda mutation server-side debe llamar `assertNotInPreview()`

Aplica a `'use server'` actions y route handlers POST/PUT/PATCH/DELETE en `/api/**`. La regla es defensa en profundidad — `proxy.ts` ya cubre `/api/**`, pero un server action se ejecuta a un path distinto y solo el guard explícito lo cubre.

**Patrón canónico**:

```ts
'use server';
import { assertNotInPreview } from '@/lib/auth/preview-guard';

export async function miMutation(input: MiInput): Promise<MiResult> {
  await assertNotInPreview();
  // ... resto del handler
}
```

**Excepción documentada**: el endpoint `POST /api/impersonate/stop` debe ser invocable durante el preview (es justo el endpoint que lo cierra). Lo mismo para `/api/impersonate` (cambiar de target). Ambos están listados en `PREVIEW_EXEMPT_API_PATHS` en `proxy.ts`.

### V2 — Personal-data reads usan `getEffectiveUser()`, no `auth.getUser()`

Cualquier widget o page que muestre **datos del usuario logueado** ("mis tareas", "mis juntas", "mis cumpleaños", greeting) debe resolver la identidad vía `useEffectiveUser()` (cliente) o `getEffectiveUser()` (server).

**No aplica** a:

- Listas a nivel empresa (catálogos, ventas, OC, etc.) → siguen usando el caller real para no romper RLS.
- `Header > displayName` → muestra el actor real; el banner naranja comunica el contexto del preview.
- Server actions de mutación → usan el caller real (las mutations están bloqueadas por V1 de cualquier manera).
- `currentEmpleadoId` en `TasksModule` cuando es para crear/editar tareas → es el actor real.

### V3 — Cookie `bsop_preview_as` es httpOnly + sameSite=lax + path=/

Solo seteable por endpoints autenticados (`POST /api/impersonate`, `POST /api/impersonate/stop`). Nunca seteable desde JS del cliente. La razón es defense-in-depth: si un attacker logra inyectar JS en el contexto del admin, no puede leer ni manipular la cookie.

`secure: true` solo en producción (development sirve via http://localhost).

### V4 — Caller no admin nunca puede previewear

Verificación doble: `startImpersonate` en el cliente checa `realPermissions.isAdmin` antes de llamar el endpoint. El endpoint `POST /api/impersonate` valida server-side via `core.usuarios.rol = 'admin'`. Si el caller deja de ser admin a mitad de sesión, la cookie sobrevive pero el `getEffectiveUser` ignora cookies cuando caller no es admin → fallback automático al caller.

### V5 — Salir del preview SIEMPRE limpia la cookie

`stopImpersonate` en el cliente llama `POST /api/impersonate/stop` además de limpiar el state local. El listener de `onAuthStateChange` también lo llama en logout. La cookie queda invalidada en cualquier escenario de cierre.

## Consecuencias

**Ganancia**:

- Audit trail íntegro: durante un preview, ninguna mutation puede atribuirse erróneamente al admin "actuando como X".
- `/inicio` muestra datos correctos del impersonado — el caso de uso original.
- Zero migrations, zero DB churn — toda la feature es app-level.
- Bajo costo de mantenimiento: el patrón es un import + una línea por mutation nueva.

**Trade-offs aceptados**:

- **Vistas no-personales no cambian**. Beto en preview de Maribel sigue viendo `/dilesa/proyectos` con los proyectos reales de DILESA (los que vería el admin). Si en el futuro Beto necesita "ver lo que Maribel ve en X catálogo", eso requiere camino A — sub-iniciativa propia.
- **Read-only es global**: durante el preview, el admin tampoco puede mutar datos suyos accidentalmente. Trade-off aceptable: la confusión está en quién es el actor; salir del preview primero es el flujo correcto.
- **Cookie httpOnly = el cliente no puede leerla** para verificar si está en preview. El estado visible vive en `PermissionsContext` (`impersonating !== null`), que se sincroniza desde el response de `POST /api/impersonate`. Si la cookie y el estado de cliente desincronizan (ej. cookie expira pero el cliente cree que sigue en preview), la única forma de recuperar es `stopImpersonate` o refresh.

**Lo que esta ADR no cubre**:

- Audit log dual (actor real + actor efectivo en columnas separadas) — innecesario en V1 porque nadie muta durante preview. Si un futuro relax permite mutations selectivas durante preview, requiere columna `actor_efectivo_id` cross-tablas.
- TTL de la cookie. Por ahora la cookie no expira automáticamente; vive hasta que `stop` la borre o el browser la limpie. Si se requiere auto-expirar, agregar `maxAge` al cookie set.
- Mobile: el shell ya gatea preview a admin desktop; no hay rollout móvil para impersonación.

## Alternativas consideradas

- **Camino A (suplantación honesta)** — descartada por costo. Ver §Decisión.
- **Helper compartido `requireAuth()` que incluya `assertNotInPreview()`** — descartado: acopla auth con preview, hace que no quede claro qué chequea cada función. Mejor mantener helpers separados con responsabilidades claras (V1 lo hace explícito en cada handler).
- **Middleware único en `proxy.ts` que cubra TODO** (incluyendo server actions) — el matcher del proxy actual cubre toda la app, pero server actions son POSTs a paths arbitrarios y devolver JSON 403 rompería el cliente RSC. El throw de `assertNotInPreview()` lo maneja Next.js correctamente.

## Referencias

- Iniciativa [`viendo-como-readonly`](../planning/viendo-como-readonly.md).
- PRs: #361 (promoción), #362 (Sprint 1: read-only), #363 (Sprint 2: override de userId), _este PR_ (Sprint 3: ADR + closeout).
