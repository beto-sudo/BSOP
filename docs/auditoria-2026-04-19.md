# Auditoría exhaustiva BSOP — 2026-04-19

**Alcance:** 54 páginas en `app/`, review estático con skills de diseño (critique, a11y-review, design-system, ux-copy).
**Baseline de tokens:** `app/globals.css` — accent `#6c63ff`, radius `0.625rem`, fonts Inter/Geist, dark mode con oklch.

**Leyenda de prioridad:**

- **P0** — bloquea uso, a11y crítica, o copy público en inglés
- **P1** — inconsistencia clara, fricción notable
- **P2** — pulido, nice-to-have

---

## Resumen ejecutivo

**Total hallazgos:** ~110 (35 RDB + 24 DILESA + 29 Inicio/Admin/RH + 22 Personal/Settings)

**Top 5 temas cross-cutting que resuelven el 60% de hallazgos:**

1. **`<html lang="en">` en root** ([app/layout.tsx:22](app/layout.tsx:22)) — afecta TODA la app. Fix: `lang="es-MX"`. 1 línea, máximo impacto.
2. **Login + Landing en inglés** (`"Private access"`, `"Welcome back"`, `"Sign in with..."`). Primera impresión antes del gate de empresas.
3. **`FieldLabel` es `<div>` no `<label htmlFor>`** — pattern replicado en todo RH/Juntas. A11y violation sistémica (WCAG 1.3.1).
4. **Hardcoded status colors** (`bg-blue-500/15`, `text-amber-400`, etc.) duplicados en ~15 archivos. Fix: `lib/status-tokens.ts` con constantes compartidas.
5. **Duplicación Juntas DILESA/RDB** — ~600 líneas espejo. Fix: extraer `<JuntasModule>` como ya se hizo con Documentos/Tasks.

---

## MÓDULO: Shell / Layout global ✅ (pase 1 — 2026-04-19)

Afecta a todas las rutas.

**P0:**

- [x] `<html lang="en">` → `lang="es-MX"` — [app/layout.tsx:22](app/layout.tsx:22)

**P1:**

- [x] Sidebar toggle colapso con `aria-expanded` + `aria-controls="app-sidebar"` — [components/app-shell/sidebar.tsx:123](components/app-shell/sidebar.tsx:123)
- [x] Botón mobile con `aria-expanded` + `aria-controls="app-sidebar"` — [components/app-shell/app-shell.tsx:73](components/app-shell/app-shell.tsx:73)
- [x] Aside principal con `id="app-sidebar"` + `aria-label={t('header.navigation')}` — [components/app-shell/sidebar.tsx:95](components/app-shell/sidebar.tsx:95)
- [x] ImpersonationBanner con `role="status"` + `aria-live="polite"` — [components/app-shell/impersonation-banner.tsx](components/app-shell/impersonation-banner.tsx)
- [x] Quitar fallback hardcoded "Adalberto Santos de los Santos" — [components/app-shell/app-shell.tsx:46](components/app-shell/app-shell.tsx:46)
- [ ] Sin breadcrumbs — cambio de diseño más grande, pendiente para round aparte
- [ ] Mobile menu button con `:focus-visible` más claro (clase explícita en vez de global)

**P2:**

- [ ] Falta skip-to-main link como primer focusable
- [x] ~~`<main>` duplicado~~ — Confirmado: solo existe en shell (línea 114), no hay duplicación

---

## MÓDULO: Login + Landing ✅ (pase 1 — 2026-04-19)

Primera impresión. Lo ve todo el mundo.

**P0 — copy en inglés:**

- [x] "Private access" → "Acceso privado" — [app/login/login-card.tsx:20](app/login/login-card.tsx:20)
- [x] "Welcome back" → "Bienvenido de vuelta" — [app/login/login-card.tsx:23](app/login/login-card.tsx:23)
- [x] "Sign in with your Google account..." → "Entra con tu cuenta de Google..." — [app/login/login-card.tsx:25](app/login/login-card.tsx:25)
- [x] "This Google account is not authorized" → "Esta cuenta de Google no está autorizada" — [app/login/login-card.tsx:31](app/login/login-card.tsx:31)
- [x] "Sign in with Google" → "Entrar con Google" — [app/login/login-card.tsx:57](app/login/login-card.tsx:57)
- [x] "Only approved accounts..." → "Solo las cuentas autorizadas..." — [app/login/login-card.tsx:61](app/login/login-card.tsx:61)
- [x] ~~"Private access" en landing~~ — El agente se equivocó. Landing está en español.

**P0 — a11y:**

- [x] Botón Google con `aria-label="Entrar con Google"` + `role="alert"` en banner de error — [app/login/login-card.tsx:36](app/login/login-card.tsx:36)
- [x] ~~Debe ser `<button>`~~ — `<a href>` con `focus:ring-2` es válido para redirect GET (hallazgo sobreestimado)

**P1:**

- [x] ~~Falta `<main>` landmark en landing~~ — Confirmado: `app-shell.tsx:114` provee `<main>` a `/`; login-card ya tiene el suyo (línea 5)
- [ ] Error banner amber hardcoded → migrar a shadcn `<Alert variant="destructive">` (P2, pulido)
- [ ] Links a empresas sin `:focus-visible` ring explícito ([app/page.tsx:65-102](app/page.tsx:65)) — pendiente para pase de tokens

---

## MÓDULO: Compartir público ✅ (pase 1 — 2026-04-19)

Único entry point externo. Lo ven personas fuera del sistema.

**P0:**

- [x] Custom UI para token inválido/expirado — [app/compartir/[token]/not-found.tsx](app/compartir/[token]/not-found.tsx) (nuevo): branding BSOP + copy español + guía al usuario
- [x] `<main>` landmark en TripShareView — [components/trip-share-view.tsx:33](components/trip-share-view.tsx:33)
- [x] `rel="noopener noreferrer"` en todos los links externos — [components/trip-share-view.tsx](components/trip-share-view.tsx) (replace_all)
- [x] Emoji de status (✅⏳≈◌) con `aria-hidden="true"` — [components/trip-share-view.tsx:283](components/trip-share-view.tsx:283)
- [x] ~~Sin branding visible~~ — Confirmado: ya tenía logo + tag "Viaje compartido" (hallazgo sobreestimado)

**P1:**

- [ ] `trip.status` en badge (línea 59) puede mostrar valor crudo del enum — verificar mapping o agregar fallback amigable
- [ ] Copy "Ver en Maps" vs "Maps" inconsistente entre itinerario y restaurantes (P2)

---

## MÓDULO: Inicio (`/inicio/*`)

### `app/page.tsx` (landing de empresas)

**P1:**

- [ ] `text-white` hardcoded en greeting (rompe dark mode si var cambia) — [app/page.tsx:39](app/page.tsx:39)

### `app/inicio/juntas/page.tsx`

**P0:**

- [ ] Input de búsqueda sin `<label>` asociado — línea 315-320
- [ ] `handleRemoveParticipant` destructivo sin confirm — línea 679-683

**P1:**

- [ ] `SortableHead` sin `aria-pressed` para estado sorted — línea 374-416
- [ ] Campos `Título *` y `Fecha y hora *` con asterisco en texto plano (debería ser `<span aria-label="required">`)
- [ ] Skeleton sin `aria-busy="true"` — línea 344-351
- [ ] `ESTADO_CONFIG` con hardcoded colors — línea 62-69

### `app/inicio/juntas/[id]/page.tsx`

**P0:**

- [ ] Editor Tiptap sin `<label>` — línea 1047-1074
- [ ] Delete participant sin confirm — línea 1244-1250

**P1:**

- [ ] Editor toolbar sin `aria-pressed`/`aria-label` — línea 193-266
- [ ] Botón "Terminar junta" en verde (confuso, es destructivo) — línea 938-953
- [ ] Task updates section sin `aria-live`
- [ ] Asistencia toggle solo con `title`, falta `aria-label` — línea 1220-1242

### `app/inicio/tasks/page.tsx`

- Wrapper delegado, revisar a nivel de `<TasksModule>` en `components/`

---

## MÓDULO: RDB (`/rdb/*`) — 19 páginas

### `app/rdb/page.tsx` (dashboard)

**P0:**

- [ ] Iconos de rango de fechas (CalendarRange, TrendingUp) sin `aria-label`

**P1:**

- [ ] Gráficos de línea sin `role="img"` ni descripción alternativa
- [ ] `MXN_FULL` formatea `maximumFractionDigits: 0` en un lugar y con decimales en otro → unificar

### `app/rdb/admin/juntas/page.tsx`

**P0:**

- [ ] Sheet de crear junta: validación con `alert()` genérico → inline errors
- [ ] Botones-ícono sin `aria-label` en filtros

**P1:**

- [ ] Search de participantes sin debounce (lento con 100+ usuarios)
- [ ] Empty state sin diferenciación visual vs loading
- [ ] Status badge sin `aria-describedby`

### `app/rdb/admin/juntas/[id]/page.tsx`

**P0:**

- [ ] Editor toolbar sin `aria-label`/`aria-pressed`
- [ ] Dialog "Eliminar junta" sin double-confirm
- [ ] Modal participantes: input de búsqueda sin `aria-label`

**P1:**

- [ ] Fecha sin timezone explícito (off-by-one riesgo)
- [ ] Copy inconsistente: "Participantes" vs "Asistentes"

### `app/rdb/cortes/page.tsx`

**P1:**

- [ ] `efectivo_contado` vs `efectivo_esperado` sin indicador visual de discrepancia (rojo si no coinciden)
- [ ] Status "abierto"/"cerrado" sin `aria-label` explicativo
- [ ] Falta "Ver detalle" en filas

### `app/rdb/inventario/page.tsx`

**P0:**

- [ ] Columnas "entrada"/"salida" sin `aria-label`

**P1:**

- [ ] Búsqueda SKU case-sensitive + sin empty state
- [ ] Filtros sin estado visual claro (aplicado vs default)
- [ ] "Saldo actual" sin indicador de baja rotación (<5 en rojo)

### `app/rdb/ordenes-compra/page.tsx`

**P0:**

- [ ] Checkboxes en tabla sin `aria-label`
- [ ] "Enviar al proveedor" sin confirmación (envía email)

**P1:**

- [ ] `{proveedor?.nombre}` sin fallback ("undefined" visible)
- [ ] Status "Sin proveedor" sin CTA "Asignar"
- [ ] Columnas numéricas sin `tabular-nums`

### `app/rdb/productos/page.tsx`

**P0:**

- [ ] Input de búsqueda sin `aria-label`
- [ ] Botones "Editar" sin `aria-label` contextual por fila

**P1:**

- [ ] Validación con `alert()` → inline error
- [ ] Drawer edición sin título "Editar: <producto>"
- [ ] Filtro "Activo: Todos" sin reflejar estado

### `app/rdb/requisiciones/page.tsx`

**P0:**

- [ ] Inputs cantidad/unidad sin `aria-label`
- [ ] "Aprobar requisición" sin confirmación
- [ ] Status "Convertida a OC" sin link a la OC

**P1:**

- [ ] `MOCK_DRAFT_ITEMS` estático (lógica incompleta o confusa)
- [ ] Combobox producto case-sensitive

### `app/rdb/proveedores/page.tsx`

**P1:**

- [ ] Detail drawer read-only sin botón "Editar"
- [ ] RFC sin máscara

### Wrappers puros (riesgo: blanco silencioso si módulo no monta)

- `app/rdb/admin/documentos/page.tsx`
- `app/rdb/admin/tasks/page.tsx`
- `app/rdb/playtomic/page.tsx`
  **P0 común:** agregar error boundary + fallback UI

---

## MÓDULO: DILESA (`/dilesa/*`) — 9 páginas

### `app/dilesa/page.tsx`

**P1:**

- [ ] Hardcoded `bg-blue-500/10`, `bg-violet-500/10` en objetos `color` (línea 12-42)

### `app/dilesa/admin/juntas/page.tsx`

**P0:**

- [ ] Error visible sin `aria-live` ni retry button — línea 397
- [ ] Validación con `alert()` genérico — línea 274
- [ ] `FieldLabel` renderiza `<div>` en lugar de `<label htmlFor>` — línea 119-124

**P1:**

- [ ] `ESTADO_CONFIG` hardcoded colors — línea 59-66 (duplicado en RDB)
- [ ] Input búsqueda sin `aria-label` — línea 339
- [ ] `datetime-local` sin fallback accesible — línea 581
- [ ] Empty state genérico — línea 414

### `app/dilesa/admin/juntas/[id]/page.tsx`

**P0:**

- [ ] Editor toolbar sin `aria-label`/`aria-pressed` — línea 273-286
- [ ] Dialog "Eliminar junta" sin double-confirm — línea 1831

**P1:**

- [ ] Combobox sin `aria-expanded`/`aria-controls` — línea 207-262
- [ ] Validación silenciosa en Sheet `guardar` — línea 237

### `app/dilesa/rh/empleados/[id]/page.tsx`

**P0:**

- [ ] "Dar de baja" dialog sin segunda confirmación — línea 624-671
- [ ] Error "Empleado no encontrado" sin `role="alert"` — línea 337

**P1:**

- [ ] Hardcoded destructive colors en status inactivo — línea 375
- [ ] Inputs `type="date"` sin `aria-label` claro — líneas 475, 549, 633
- [ ] Botón "Dar de baja" con clases custom → usar `variant="destructive"` shadcn — línea 387-393
- [ ] Compensación condicional sin hint "Solo admin" — línea 575-621

### Wrappers

- `app/dilesa/admin/documentos/page.tsx`, `app/dilesa/admin/tasks/page.tsx`, `app/dilesa/rh/departamentos/page.tsx`, `app/dilesa/rh/empleados/page.tsx`, `app/dilesa/rh/puestos/page.tsx` — **sin hallazgos**, revisar módulos.

---

## MÓDULO: RH genérico (`/rh/*`)

### `app/rh/empleados/[id]/page.tsx`

**P0:**

- [ ] "Dar de baja" sin warning prominente — línea 294-302
- [ ] `<InfoRow>` sin semántica `<dl>/<dt>/<dd>` — línea 98-105

**P1:**

- [ ] Inputs sin `id` + labels sin `htmlFor` — línea 336-400
- [ ] Avatar con inicial sin contexto accesible — línea 318-319
- [ ] Hardcoded `bg-red-500/5` → usar `destructive` token — línea 431

**P2:**

- [ ] "Ex-empleado" badge sin `aria-label`

---

## MÓDULO: Personales y Auxiliares

### `app/family/page.tsx`

**P0:**

- [ ] "Coming soon" + "This area will group..." en inglés — líneas 9-10
- [ ] PlaceholderSection sin semántica accesible

### `app/travel/page.tsx`

**P0:**

- [ ] Hardcoded `emerald-400/20`, `white/8`, `white/4` — líneas 24-60
- [ ] Iconos decorativos sin `aria-hidden="true"` — líneas 75, 82, 94, 105

### `app/rnd/page.tsx`

**P0:**

- [ ] Tone maps hardcoded (memberTone, badgeTone, priorityTone) — líneas 12-30
- [ ] `animate-pulse` sin `prefers-reduced-motion` — líneas 232, 315

**P2:**

- [ ] Copy mix en/es: "Latest", "Archive", "Members", "Agent architecture", "Task history"

### `app/rnd/[id]/page.tsx`

**P0:**

- [ ] Tone maps hardcoded — líneas 11-36
- [ ] Matrix scoring sin `role="grid"` — líneas 237-272
- [ ] `animate-pulse` sin reduce-motion — línea 143

### `app/agents/page.tsx`

**P0:**

- [ ] Función `statusTone()` con hardcoded colors — líneas 42-47
- [ ] Copy en inglés: "Delegations", "Sessions", "Active / recent agents", "Task history"

**P1:**

- [ ] Tabla sin `<caption>` ni `aria-describedby` — líneas 348-389

### `app/coda/page.tsx` y `app/coda/[slug]/page.tsx`

**P0:**

- [ ] Copy inglés: "Documents audited", "God tables", "KPI suggestions", "Top risk tables"
- [ ] Tablas sin `<caption>`

### `app/usage/page.tsx`

**P0:**

- [ ] Hardcoded `text-amber-300`, `text-emerald-300`, `text-white/40`
- [ ] Tablas sin caption/descripciones

**P1:**

- [ ] Copy inglés: "Cache hit rate", "Recent sessions", "Daily cost trend"

---

## MÓDULO: Settings

### `app/settings/empresas/page.tsx`

**P0:**

- [ ] ImageUploader usa `alert()` para errores — línea 131
- [ ] "Guardado" en verde hardcoded (`text-green-400`) — líneas 190, 557

**P1:**

- [ ] Chevron expandible sin `aria-expanded` — líneas 685-698
- [ ] Input file oculto sin CTA visible clara

### `app/settings/acceso/page.tsx`

**P0:**

- [ ] Emoji "🔒" sin alt text — línea 66
- [ ] Posible info disclosure si `SUPABASE_SERVICE_ROLE_KEY` falta — línea 42-46 (mensaje user-facing muestra "Error de configuración")
- [ ] Revisar confirmación en revocar acceso (dentro de AccesoClient)

---

## Refactor cross-cutting (orden sugerido)

1. **`lib/status-tokens.ts`** — extraer `JUNTA_ESTADO_CONFIG`, `TASK_ESTADO_CONFIG`, `EMPLEADO_ESTADO_CONFIG`. Reemplazar ~15 ocurrencias hardcoded. **Pequeño (1h).**

2. **`components/ui/field-label.tsx`** — cambiar de `<div>` a `<label htmlFor>` + vincular `id` en `<Input>`. **Pequeño, alto impacto a11y (1-2h).**

3. **Toolbar del editor Tiptap** — agregar `aria-label` + `aria-pressed` a todos los botones. Centralizado en `components/editor/editor-toolbar.tsx`. **Mediano (2h).**

4. **`<ConfirmDialog>` primitive** — wrapper sobre shadcn `AlertDialog` con props `title/description/destructive`. Reemplazar todas las acciones destructivas. **Mediano (2-3h, ~10 call sites).**

5. **Error boundary + fallback** para wrappers (`admin/documentos`, `admin/tasks`, `playtomic`) que evita blanco silencioso. **Pequeño (1h).**

6. **`<JuntasModule>`** — extraer de DILESA/RDB a `components/junta/juntas-module.tsx`. Sigue el pattern ya usado para Documentos/Tasks. **Grande (2-3 días).**

7. **Localización global** — pasar texto inglés de login/landing/rnd/agents/coda/usage a español. **Mediano, puede ir por partes (3-4h).**

---

## Módulos bien ✅

Estos wrappers delegados no tuvieron hallazgos directos (pendiente revisar los componentes en `components/`):

- `app/administracion/documentos/page.tsx`
- `app/dilesa/admin/documentos/page.tsx`, `app/dilesa/admin/tasks/page.tsx`, `app/dilesa/rh/*`
- `app/rdb/admin/documentos/page.tsx`, `app/rdb/admin/tasks/page.tsx`
- `app/rh/*` (wrappers), `app/rh/page.tsx`
- `app/health/page.tsx`, `app/travel/[slug]/page.tsx`, `app/settings/page.tsx`

---

_Próxima sesión: trabajar un módulo a la vez, palomeando items al ir commiteando._
