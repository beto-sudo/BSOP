# ADR-020 — Accessibility baseline (WCAG 2.1 AA)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `a11y-baseline`)
- **Related**: [ADR-006](./006_module_states.md), [ADR-008](./008_action_feedback.md), [ADR-010](./010_data_table.md), [ADR-016](./016_forms_pattern.md), [ADR-017](./017_badge_system.md), [ADR-018](./018_drawer_anatomy.md), [ADR-019](./019_responsive_policy.md)

---

## Contexto

Cero política a11y documentada en BSOP. Riesgo bajo hoy (uso interno, ~10 operadores), pero crece con cada empleado nuevo y crece con el tamaño del producto. Componentes recientes (`<Form>`, `<DetailDrawer>`, `<DataTable>`, `<Badge>`, `<ConfirmDialog>`) ya cablean bastante a11y por default vía shadcn/Radix primitives, pero la convención no está escrita — un dev nuevo no sabe qué baseline esperar.

Audit empírico (no automatizado) sobre el repo:

- ✅ Forms (post ADR-016): `htmlFor` + `aria-invalid` + `aria-describedby` cableados por construcción en `<FormField>`.
- ✅ Drawers (post ADR-018): focus trap nativo de `<Sheet>`/Radix, `<SheetTitle>` + `<SheetDescription>` con aria-labelledby.
- ✅ Tablas (post ADR-010): `<th scope="col">`, sortable headers como `<button>`, `aria-sort` en columnas activas.
- ✅ Confirmaciones (post ADR-008): `<ConfirmDialog>` usa `<AlertDialog>` Radix con focus trap + aria-labelledby.
- ⚠️ Iconos sin texto (`<Trash2 />`, `<Pencil />`) — algunos sin `aria-label` cuando son botones únicos.
- ⚠️ Touch targets `< 44px` en mobile — no auditado masivamente.
- ⚠️ Color como único indicador — `<Badge>` ya rendea label de texto, pero algunos charts/dots solo color.
- ⚠️ Alt text en imágenes — el header de email usa `alt="Membrete..."` pero no auditado en bulk.

ADR-006 (estados) ya menciona `role="alert"` para errores. ADR-008 (feedback) usa toast con role apropiado. ADR-016 (forms) cumple WCAG 1.3.1 (label association). ADR-017 (badges) menciona contrast ratios. Falta el ADR umbrella que diga "WCAG 2.1 AA es el baseline; estas reglas son lo que asumimos".

## Decisión

WCAG 2.1 AA es el baseline mínimo del repo. Las 6 reglas (A1-A6) codifican las convenciones operativas. Audit automatizado (axe-core en CI) queda para Sprint 2 — Sprint 1 (este ADR) fija el contrato y elimina ambigüedad en code review.

### Las 6 reglas (A1–A6)

#### A1 — WCAG 2.1 AA es el baseline; AAA fuera de alcance

Apuntamos a [WCAG 2.1 nivel AA](https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_overview&levels=aaa) en todas las superficies de UI. AAA no se requiere (más estricto, no es estándar para apps internas, costo desproporcionado).

Los success criteria que aplicamos como mínimo:

- **1.3.1 Info and Relationships** (A) — labels, headings, landmarks correctos.
- **1.4.3 Contrast (Minimum)** (AA) — 4.5:1 texto normal, 3:1 texto large.
- **1.4.11 Non-text Contrast** (AA) — 3:1 borders / focus indicators / iconos.
- **2.1.1 Keyboard** (A) — todo interactivo accesible por teclado.
- **2.4.7 Focus Visible** (AA) — focus ring visible siempre.
- **2.5.5 Target Size (Enhanced)** (AAA, lo adoptamos como AA en mobile-first) — 44×44 px touch targets.
- **3.3.1 Error Identification** (A) — errores de form se identifican textualmente, no solo color.
- **4.1.2 Name, Role, Value** (A) — controles tienen aria-\* correctos.

> **Por qué WCAG 2.1 (no 2.2)**: 2.2 (oct 2023) agrega criterios sobre dragging, target spacing, focus appearance que aún no se enforzan en herramientas de audit común. Subir a 2.2 cuando axe-core los soporte en su modo default (futuro).

#### A2 — Contraste 4.5:1 en texto normal, 3:1 en texto large/UI

Tailwind defaults usados en el repo (`text-foreground`, `text-muted-foreground`, etc.) están calibrados sobre la paleta canónica para cumplir 4.5:1 sobre `bg-background` y `bg-card`. Cuando un componente custom invoca colores específicos:

- Verificar contrast con [WebAIM tool](https://webaim.org/resources/contrastchecker/) o Chrome DevTools.
- Tonos de `<Badge>` (ADR-017) — verificados contra `bg-card`/`bg-panel` típicos del app.
- **No bajar texto debajo de `text-[var(--text)]/55`** sin justificación — está en el límite de 4.5:1 sobre `bg-card`.

> **Por qué**: el ratio se mide sobre el fondo real, no el `bg-background`. Un texto `/40` sobre un panel `bg-muted/40` que aplica al 60% de opacidad efectiva, falla.

#### A3 — Focus visible siempre; nunca `outline-none` sin reemplazo

Tailwind `focus-visible:ring-*` reemplaza el outline del browser en componentes shadcn. Cualquier elemento interactivo (button, input, link, custom div con onClick) DEBE mostrar focus:

- shadcn `<Button>`, `<Input>`, `<Combobox>`, `<Sheet>`, `<Dialog>` — focus ring por default.
- Custom `<button>` o `<div role="button">` — agregar `focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:border-ring` o equivalente.
- Nunca `outline-none` sin un `:focus-visible` ring que lo sustituya.

> **Por qué**: keyboard users (incluyendo power users sin discapacidad) navegan via Tab. Sin focus visible, no saben dónde están.

#### A4 — Keyboard nav completo: todo lo que se puede clickear se puede activar con teclado

- `<button>` y `<a>` — Enter / Space (button), Enter (link). Por default OK.
- Custom interactivos (`<div onClick>`, `<span onClick>`) — agregar `role="button" tabIndex={0} onKeyDown={...}` o reemplazar por `<button>`.
- Selects custom (`<Combobox>`) — Radix/shadcn ya soportan Arrow / Enter / Escape.
- Tablas con sort — header es `<button>` (DT del ADR-010 ya cumple).
- Modales / drawers — Focus trap nativo de Radix (cuando se abren, foco va al primer interactivo; ESC cierra).
- Nunca `tabIndex={-1}` en un control que el usuario debe poder navegar.

> **Por qué**: 2.1.1 Keyboard es WCAG A (mínimo absoluto). Cualquier flow que requiera mouse es bloqueante.

#### A5 — `aria-label` / `aria-labelledby` para controles sin texto visible

- Iconos como botones únicos (`<button><Trash2 /></button>`): agregar `aria-label="Eliminar"`.
- `<Combobox>` sin label visible: `aria-label="..."` (la prop ya está expuesta).
- Search inputs con icono pero sin label: `aria-label="Buscar"`.
- `<DesktopOnlyNotice>` (ADR-019): rendea `role="alert"` con texto descriptivo.

> **Por qué**: 4.1.2 Name, Role, Value. Screen readers necesitan saber qué hace cada control. El icono solo no es accessible name.

#### A6 — Color no es el único indicador de estado

Badges, chips, dots, KPIs: el color comunica pero el **texto** o un **icono semántico** es la fuente real de información. WCAG 1.4.1 Use of Color.

- `<Badge tone="success">Aprobado</Badge>` — el label "Aprobado" es la verdad. El verde refuerza.
- Diff badges con + / − (estado positivo/negativo): incluir el signo + o − en el texto, no solo color.
- Validación de form (ADR-016): error muestra `<p role="alert">` con mensaje, no solo input rojo.
- KPIs con delta colorado: incluir el `+` / `−` en el número, no solo color.
- Charts (futuro): patterns/markers además de color (puntos vs cuadrados).

> **Por qué**: ~8% de hombres son daltónicos. Apps que dependen solo de color son inutilizables para ellos. Texto + icono lo arregla.

### Audit y enforcement

- **Code review**: el reviewer chequea las 6 reglas A1-A6 en cada PR de UI. PRs nuevos no aprueban con violations obvias (`outline-none` sin focus, icon button sin aria-label, color-only state).
- **Audit automatizado**: deferred a Sprint 2 — instalar `@axe-core/playwright` y agregar smoke tests sobre rutas representativas (`/inicio`, `/rdb/inventario`, `/dilesa/terrenos`). Bloqueante para "issues críticas" y "serias", warning para "moderadas".
- **Manual audit con tools**: cualquier dev puede correr [axe DevTools](https://www.deque.com/axe/devtools/) o Chrome Lighthouse a11y en local para validar antes de PR.

## Implementación

- **Sprint 1** (este PR): ADR-020 + planning doc + actualización de INITIATIVES. Sin código nuevo. Las reglas A1-A6 codifican lo que ya hacen los componentes recientes; reviewers las usan en code review.
- **Sprint 2** (postergado): instalar `@axe-core/playwright`, agregar `npm run audit:a11y` con 3-5 rutas representativas, integrar al CI (warning-only inicialmente; bloqueante después de fixear baseline).
- **Sprint 3** (postergado): audit manual + fix de gaps existentes (icon buttons sin aria-label, touch targets `< 44px`, charts con color-only).

## Consecuencias

### Positivas

- **Code review tiene check explícito** sobre a11y. Antes era implícito ("se ve OK"); ahora hay rubric concreto.
- **Componentes nuevos heredan baseline** porque shadcn/Radix + las convenciones ADR-006/008/010/016/017/018 ya cumplen.
- **Documentación viva**: el ADR es la referencia para devs nuevos.
- **No requiere refactor masivo**: la mayoría del repo ya cumple por construcción; los gaps se resuelven incremental.

### Negativas

- **Sin enforcement automatizado en v1**: PRs pueden meter regressions hasta que Sprint 2 instale axe-core. Mitigation: code review riguroso.
- **Audit manual de gaps existentes** (icon buttons, etc.) no es automático. Algunos gaps existen hoy y se irán fixeando incrementalmente.

### Cosas que NO cambian

- shadcn/Radix primitives — ya cumplen baseline; no se reemplazan.
- ADRs previos (006, 008, 010, 016, 017, 018) — siguen válidos; este ADR los referencia.
- Política responsive (ADR-019) — independiente; ambas conviven.

## Fuera de alcance v1

- **WCAG AAA** — más estricto, no es estándar para apps internas.
- **Soporte completo de screen readers en flujos OCR / camera capture** — caso edge; documentar como excepción si surge.
- **Audit manual con usuarios con discapacidad** — costoso, postergar.
- **`@axe-core/playwright` integration** — Sprint 2 (postergado).
- **Linter custom** que enforce `aria-label` en icon buttons — postergable; code review lo cubre.

## Referencias

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/?levels=aaa)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- Iniciativa: [docs/planning/a11y-baseline.md](../planning/a11y-baseline.md)
- ADR-016 — `<FormField>` cablea label/aria-invalid/describedby (F3).
- ADR-018 — `<DetailDrawer>` con focus trap nativo (DD2).
- ADR-019 — `<DesktopOnlyNotice>` con `role="alert"` (R3).
