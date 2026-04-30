# Iniciativa — "Viendo como" honesto: read-only + override de userId

**Slug:** `viendo-como-readonly`
**Empresas:** todas (cross-empresa, afecta a la feature global de impersonación)
**Schemas afectados:** ninguno (no hay DDL; trabajo es app + cookie + helpers)
**Estado:** done (cerrada 2026-04-30)
**Dueño:** Beto
**Creada:** 2026-04-30
**Cerrada:** 2026-04-30
**Última actualización:** 2026-04-30 (Sprints 1-3 mergeados en el día — PRs #362, #363, _este PR_).

## Problema

La feature "Viendo como" es hoy un **preview cosmético** que solo cambia el filtrado del sidebar. La sesión real de Supabase nunca cambia, así que:

1. **`/inicio` muestra los datos del admin real, no del usuario impersonado.** [`MisTareasWidget`](../../components/inicio/mis-tareas-widget.tsx) y otros widgets de `/inicio/*` llaman `createSupabaseBrowserClient()` y filtran por `auth.uid()`, que sigue siendo Beto. Reportado por Beto en sesión 2026-04-30 viendo como Maribel.
2. **Cualquier módulo es accesible si conoces la URL.** El sidebar oculta entradas, pero las pages server-side ejecutan RLS contra la sesión real (admin) y dejan pasar todo. Lo que Beto observó al entrar al panel DILESA con todos los módulos disponibles.
3. **Audit trail roto si el admin "edita por error" durante el preview.** Hoy nada bloquea escrituras: si Beto en preview de Maribel pulsa "guardar" en un form, la mutation se ejecuta como Beto admin (saltándose RLS de Maribel) y queda registrada como acción de Beto, sin marca de que estaba en preview.

El banner naranja sugiere algo más fuerte de lo que la feature realmente hace.

## Outcome esperado

Cerrar el hueco con el **camino B** (preview cosmético + read-only + override de userId para widgets "míos"), no con suplantación honesta de sesión:

- **Read-only enforcement**: mientras `impersonating !== null`, ninguna mutation pasa — frontend deshabilita CTAs y server middleware rechaza con 403.
- **Override de userId para widgets "míos"**: las páginas de `/inicio/*` y similares respetan un `effective_user_id` distinto al `auth.uid()` real cuando el caller es admin con cookie de preview activa. Lo demás sigue mostrando los datos de la empresa real.
- **Banner claro**: copy actualizado refleja la realidad — "Vista previa: solo lectura. Las acciones están deshabilitadas hasta salir del modo."
- **Cero cambio en RLS, cero cambio en schemas DB**. Todo el trabajo es app + cookie httpOnly + helpers + audit en mutations.

Lo que esta iniciativa **no resuelve** (camino A, fuera de alcance):

- Suplantación honesta de sesión Supabase (requeriría cookies separadas + RLS dual o reescritura de policies + audit dual).
- Vistas de "como vería Maribel cualquier módulo X" para módulos no-personales (catálogos, reportes, listings). Esos siguen mostrando los datos reales de la empresa.

## Alcance v1

### Sprint 1 — Read-only enforcement + cookie de preview

- [ ] **Cookie httpOnly `bsop_preview_as`** seteada por endpoint nuevo `POST /api/impersonate/start` (valida admin + acepta `userId`, devuelve permisos como hoy + setea cookie). El GET actual queda deprecado / soporta backwards compat hasta migrar el cliente.
- [ ] **Endpoint `POST /api/impersonate/stop`** que borra la cookie.
- [ ] **Frontend `PermissionsContext`** ([components/providers.tsx](../../components/providers.tsx)): `startImpersonate` y `stopImpersonate` cambian a llamar los endpoints POST en vez de manipular state local únicamente. La cookie sobrevive recargas → preview persiste por refresh.
- [ ] **Server-side guard `lib/auth/preview-guard.ts`** con `assertNotInPreview()` que lanza 403 si la cookie `bsop_preview_as` está seteada. Lo invocan todas las server actions y route handlers que mutan datos (POST/PUT/PATCH/DELETE).
- [ ] **Auditoría de mutations**: barrer `app/**/route.ts` y `app/**/actions.ts` y meter el guard en todos los handlers de mutation. Inventariar primero, instrumentar después; la lista vive en este doc como Decisión registrada.
- [ ] **Frontend hook `useReadOnlyMode()`** que devuelve `true` si `impersonating !== null`. Componentes de form/edición lo respetan: deshabilitan submits + muestran tooltip "Salí del modo vista previa para editar".
- [ ] **Banner [components/app-shell/impersonation-banner.tsx](../../components/app-shell/impersonation-banner.tsx)**: actualizar copy a "Solo lectura — las acciones de edición están deshabilitadas".
- [ ] **Tests**: unit para `assertNotInPreview()`, integration para `/api/impersonate/start|stop` (cookie set/unset), un par de tests E2E confirmando que un POST a una mutation falla con 403 cuando la cookie está activa.

### Sprint 2 — Override de userId para widgets "míos"

- [ ] **Helper `lib/auth/effective-user.ts`** con `getEffectiveUserId(supabase)`:
  - Si caller no es admin → su propio `auth.uid()` (cookie ignorada).
  - Si caller es admin Y cookie `bsop_preview_as` presente → `userId` de la cookie (validado contra `core.usuarios.activo`).
  - Si caller es admin sin cookie → su `auth.uid()`.
- [ ] **Refactor `MisTareasWidget`** ([components/inicio/mis-tareas-widget.tsx](../../components/inicio/mis-tareas-widget.tsx)) para usar `getEffectiveUserId()` en la query de tareas.
- [ ] **Auditar `app/inicio/**/\*.tsx`** y refactorizar todo widget que filtre por `auth.uid()` real:
  - `/inicio/page.tsx` (greeting + nombre del usuario impersonado, no admin)
  - `/inicio/tasks/page.tsx`
  - `/inicio/juntas/page.tsx` (si filtra por participante)
  - `FechasImportantesWidget` (cumpleaños propios? o son globales? — auditar al ejecutar)
- [ ] **`Header > displayName`** ([components/app-shell/app-shell.tsx](../../components/app-shell/app-shell.tsx)) muestra el nombre del usuario impersonado mientras dure el preview, no el del admin (consistente con el banner).
- [ ] **Hook `useEffectiveUser()`** client-side para los pocos widgets que sigan siendo cliente puro.

### Sprint 3 — Closeout + ADR

- [ ] **ADR-027** (o el siguiente) documentando la decisión: por qué camino B sobre A, qué se cubre y qué no, contrato del helper, semántica de la cookie, regla de "agregar `assertNotInPreview()` a toda mutation nueva".
- [ ] Bitácora final en este doc.
- [ ] Mover fila a `## Done` en INITIATIVES.md.
- [ ] Barrer Reminders relacionados en `Claude: BSOP`.

## Fuera de alcance

- **Camino A (suplantación honesta de sesión)**: no se implementa ahora. Si en el futuro la operación lo amerita, sub-iniciativa propia.
- **Vistas read-as-Maribel para módulos no-personales**: `/dilesa/proyectos`, `/rdb/ventas`, etc. siguen mostrando datos reales de la empresa. El admin en preview solo ve "qué entradas tiene Maribel en el sidebar" + "qué vería Maribel en sus widgets personales". Si Beto necesita "ver lo que Maribel ve en X módulo de catálogo", eso requiere camino A.
- **Audit trail dual** (actor real + actor efectivo en cada row mutada): dado que en camino B nadie muta durante el preview (read-only), no aplica. Si más adelante se relaja para permitir mutations específicas durante preview, requeriría columna `actor_efectivo_id` cross-tablas → sub-iniciativa.
- **Mobile**: el shell ya gatea preview a admin desktop; no hay rollout móvil para impersonación.

## Métricas de éxito

- Beto activa "Viendo como Maribel" → `/inicio` muestra **las tareas y fechas de Maribel**, no las suyas.
- Cualquier intento de mutation durante preview (botón pulsado por error, form submit accidental, request directo a `POST /api/...`) responde 403 y no escribe nada.
- El sidebar sigue filtrándose como hoy.
- Accesar `/dilesa/admin/tasks` directo por URL durante preview de Maribel **muestra la página** pero todos los CTAs de edición están deshabilitados (el sidebar ya no la lista, pero la URL es accesible).
- El admin sale del modo (`stopImpersonate`) → cookie borrada, todo vuelve a normal.
- CI verde en cada sprint; smoke con cuentas Beto + Maribel confirma el comportamiento.

## Riesgos / preguntas abiertas

- **Mutations que no se vean fácilmente en el barrido**: `app/api/**/route.ts` con HTTP methods POST/PUT/PATCH/DELETE están claros, pero acciones server-only embebidas en pages (`'use server'` actions) son más fáciles de olvidar. Sprint 1 debe inventariarlas todas con grep antes de instrumentar.
- **Server actions del `next-cache` invalidation flow**: si una action revalida cache y luego falla con 403, ¿queda el cache en mal estado? Verificar que el `assertNotInPreview()` corre **antes** de cualquier side effect.
- **`MisTareasWidget` y similares hoy son client components**: el override de userId server-side requiere convertirlos (o exponer endpoint) — decidir el approach al ejecutar Sprint 2 (probable: server component + island client para refrescar).
- **Cookie httpOnly + auth state**: `supabase.auth.onAuthStateChange` no se entera de cambios en cookies de app. Si Beto cierra sesión durante preview, hay que limpiar la cookie explícitamente en el listener (ya hay logic de `setImpersonating(null)` ahí — extender para llamar `/api/impersonate/stop`).
- **¿Beto puede impersonar a otro admin?** El endpoint actual permite (incluye fallback `isAdmin: true` si target es admin). Mantener — es legítimo "ver el menú de Marcela admin".

## Bitácora

- **2026-04-30** — Promovida a `planned`. Beto reportó en sesión que viendo como Maribel veía sus propias tareas en `/inicio` y todos los módulos accesibles en el panel DILESA. Investigación confirmó que el "Viendo como" es preview cosmético: solo cambia el filtrado del sidebar; sesión Supabase, RLS y queries siguen ejecutándose como el admin real. Beto eligió **camino B** (preview + read-only + override de userId para widgets "míos") sobre camino A (suplantación honesta de sesión) por costo: 5–10× menos trabajo y resuelve el caso de uso real. Beto autorizó modo autónomo: CC genera y mergea PRs hasta cerrar.
- **2026-04-30** — Sprint 1 mergeado (PR #362). Read-only enforcement end-to-end: cookie httpOnly `bsop_preview_as` + endpoints `POST /api/impersonate` (con cookie set) y `POST /api/impersonate/stop` (clear) + `proxy.ts` rechaza POST/PUT/PATCH/DELETE en `/api/**` con 403 cuando la cookie está set + `assertNotInPreview()` al inicio de ~37 mutations en 5 server actions (cortes, levantamientos, productos, requisiciones, acceso) + `useReadOnlyMode()` hook frontend + banner copy actualizado. Tests: `lib/auth/preview-guard.test.ts` (8 tests). 842 tests pass.
- **2026-04-30** — Sprint 2 mergeado (PR #363). Override de userId server-side: `lib/auth/effective-user.ts` con `getEffectiveUser(supabase)` + endpoint `GET /api/me` + hook `useEffectiveUser()` cliente. Refactor de `MisTareasWidget`, `FechasImportantesWidget`, `app/inicio/page.tsx` (greeting), `app/inicio/juntas/page.tsx` y `TasksModule` (cuando `onlyMine`) para resolver identidad efectiva. Header se mantiene con nombre del actor real (banner ya comunica el contexto). Tests: `lib/auth/effective-user.test.ts` (8 tests). 850 tests pass.
- **2026-04-30** — Sprint 3 cierre (este PR). [ADR-027](../adr/027_viendo_como_readonly.md) codifica V1-V5: (V1) toda mutation server-side llama `assertNotInPreview()`; (V2) personal-data reads usan `getEffectiveUser`; (V3) cookie httpOnly + sameSite=lax + path=/; (V4) caller no admin nunca puede previewear (verificación dual cliente + server); (V5) salir del preview siempre limpia la cookie. Iniciativa cerrada el mismo día que la promoción — 3 sprints en un día.

## Decisiones registradas

- **2026-04-30** — Camino B sobre camino A. _Razón:_ el caso de uso real es "admin sanity-checks de qué ve un usuario", no "operar como ese usuario". Camino A requeriría reescritura de RLS + audit dual + cookies separadas; camino B se hace con cookie httpOnly + helper + middleware + refactor acotado de widgets `/inicio/*`. _Aplica a:_ todo el alcance de esta iniciativa.
- **2026-04-30** — La cookie `bsop_preview_as` es httpOnly, scope `/`, solo seteable por endpoints `/api/impersonate/start|stop`. _Razón:_ evita que JS del cliente la manipule directamente (defense in depth). El client lo único que hace es llamar los endpoints; el state visible en `PermissionsContext` se sincroniza desde el response de `/start`.
- **2026-04-30** — Read-only abarca **todas** las mutations, incluyendo las del propio admin sobre datos suyos. _Razón:_ la confusión está en quién es el actor. Si admin en preview de Maribel pulsa "guardar" en su propia OC, debería estar pensando "esto lo está haciendo Maribel" — y como Maribel no debe poder, falla. La forma correcta es salir del preview primero. Trade-off aceptable.
- **2026-04-30** — Widgets de `/inicio/*` resuelven el override en server (server components + un endpoint o helper directo); no se hace solo client-side via fetch. _Razón:_ hoy son client components que llaman supabase-browser con `auth.uid()` real. El refactor a server component (o endpoint que respete la cookie) es el cambio mínimo que hace que el dato sea correcto. Detalle del approach se decide al ejecutar Sprint 2.
