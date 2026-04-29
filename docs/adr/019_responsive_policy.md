# ADR-019 — Responsive policy (mobile-first / desktop-only / responsive)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `responsive-policy`)
- **Related**: [ADR-006](./006_module_states.md), [ADR-010](./010_data_table.md), [ADR-018](./018_drawer_anatomy.md)

---

## Contexto

El repo BSOP corre en 4 contextos físicos:

- **Operación de campo / piso** (Inventario captura, marbete impreso, conciliación) — celular o tablet en horizontal, Wi-Fi inestable.
- **Oficina admin** (Cortes, Productos, Compras) — desktop con monitor 24"+.
- **Director / móvil** (Inicio dashboards, Tasks personales, Juntas) — celular en cualquier momento.
- **Print** (Marbete, Documento, Cortes) — impresora monocroma, A4.

Hoy cada módulo decide su comportamiento responsive sin convención. Algunos componentes (`<DataTable>` ADR-010) tienen tablas que en mobile rompen layout; otros tienen drawers full-width. Cuando alguien abre el módulo equivocado en su celular, la experiencia varía entre "funciona", "funciona feo" y "no se puede usar".

ADR-006 cubrió empty/loading/error states. ADR-010 cubrió tablas (con `density` toggle pero no degradación a cards). ADR-018 cubrió drawers (con `size` semántico pero no fallback a bottom-sheet). Falta una capa policy que diga, módulo por módulo, qué se espera.

## Decisión

Cada módulo se declara con uno de **3 perfiles responsive**:

```
mobile-first  → optimizado para celular; desktop también funciona pero el celular es first-class.
desktop-only  → diseñado para desktop; en celular muestra <DesktopOnlyNotice>.
responsive    → degrada gracefully entre breakpoints; ambas vistas son funcionales aunque distintas.
```

Convención de declaración: el page o layout del módulo agrega un comentario JSDoc al inicio:

```tsx
/**
 * @module Cortes (RDB)
 * @responsive desktop-only
 */
```

En desktop-only, el page rendea `<DesktopOnlyNotice>` para mobile y oculta el contenido real con `sm:hidden`/`sm:block`:

```tsx
return (
  <>
    <DesktopOnlyNotice module="Cortes" />
    <div className="hidden sm:block">{/* ... módulo real ... */}</div>
  </>
);
```

### Las 5 reglas (R1–R5)

#### R1 — 3 perfiles canónicos

- **`mobile-first`** — el celular es el dispositivo de uso real. Default Tailwind: cualquier styling sin breakpoint asume mobile; `sm:`+ son enhancements para desktop. Touch targets ≥ 44px. Inputs grandes. Bottom sheets en lugar de drawers laterales (futuro). Casos: Inventario captura, Marbete impreso (excepción print), Tasks personales en `/inicio`.
- **`desktop-only`** — el módulo asume teclado + mouse + monitor amplio. En `< sm:` se muestra `<DesktopOnlyNotice>`. Sin attempt de degradar el listado/dashboard a cards. Casos: Cortes, Conciliación, Productos admin, Settings → Acceso, Settings → Empresas.
- **`responsive`** — el módulo degrada entre breakpoints. Tablas se vuelven cards, filtros se colapsan a drawer, KPIs se apilan. Casos: Inicio, Juntas listing, RH personal listing, Tasks listing.

> **Por qué 3 (no más, no menos)**: cubrir el repo con menos pierde matiz (un dashboard responsive es distinto a uno mobile-first). Con más, el equipo invoca perfiles ad-hoc ("¿esto es responsive o tablet-friendly?"). 3 es suficiente para ubicar cada módulo en un slot claro.

#### R2 — Breakpoints canónicos: Tailwind defaults

Se respetan los breakpoints default de Tailwind (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`). El umbral de "mobile" es `< sm` (< 640px); de "tablet" es `sm:` a `md:`; "desktop" es `md:`+.

> **Por qué**: Tailwind defaults están en todos los componentes existentes; cambiar la escala obliga a refactor masivo sin valor. Cuando surja un caso real (e.g. necesitamos un breakpoint para tablet vertical 768px), se evalúa.

#### R3 — `<DesktopOnlyNotice>` para módulos `desktop-only`

Componente en `components/responsive/desktop-only-notice.tsx`. Visible solo en `< sm` (`sm:hidden`); muestra ícono + módulo + copy estándar ("Este módulo está optimizado para desktop. Abrilo en una computadora o gira tu tablet a horizontal.").

```tsx
<DesktopOnlyNotice module="Cortes" />
<div className="hidden sm:block">{/* módulo real */}</div>
```

> **Por qué**: copy + look consistente vs cada módulo escribiendo su propio mensaje. Cambiar el copy/look se hace en un lugar.

#### R4 — Detección por viewport (CSS), no user-agent

`sm:hidden` / `sm:block` (CSS). Sin `useEffect(() => check user-agent)`. Esto significa:

- El SSR funciona idéntico para todos los user-agents.
- Si el usuario rota su tablet de portrait a landscape, el módulo aparece sin reload.
- Edge cases (tablet en portrait que pasa el threshold) se respetan: si ≥ 640px, ve el módulo.

> **Por qué**: viewport es la métrica que importa visualmente. UA-sniffing rompe en tablets, navegadores in-app (Slack), responsive devtools. CSS-driven es estable.

#### R5 — Componentes compartidos heredan el perfil del page padre

`<DataTable>`, `<DetailPage>`, `<DetailDrawer>`, `<Form>` no se autodetectan como mobile-first o desktop-only — el padre lo decide vía Tailwind utilities estándar (`hidden sm:flex`, `flex sm:hidden`, etc.). Si el padre es desktop-only, los componentes no necesitan degradación; si es mobile-first o responsive, el padre activa los Tailwind responsive utilities donde aplica.

> **Por qué**: meter detección dentro de cada componente compartido lo hace impredecible (un `<DataTable>` que se autoderrumba a cards puede no ser lo que el caller quiere). Mantener los componentes "agnósticos al perfil" deja la decisión donde tiene contexto: el page padre.

### A11y mínimo

- `<DesktopOnlyNotice>` rendea un `role="alert"` con texto descriptivo, accesible a screen readers.
- Touch targets en perfiles `mobile-first` siguen WCAG 2.5.5 (≥ 44×44 px). El `<Button>` shadcn ya cumple por default; inputs/checkboxes pueden necesitar `min-h-[44px]` explícito.
- Cuando el page se oculta con `hidden sm:block`, el screen reader igual lo skipea (CSS `display: none`). El `<DesktopOnlyNotice>` queda como única superficie en mobile.

## Implementación

- **Sprint 1** (este PR): foundation — `components/responsive/desktop-only-notice.tsx` + index. ADR-019. Sin migración masiva: cada módulo se declara cuando se toque por feature work futuro.
- **Sprint 2+** (post-cierre de iniciativa): adopción incremental. PRs nuevos que tocan un page deben:
  1. Agregar el comentario JSDoc `@responsive` con uno de los 3 perfiles.
  2. Si es `desktop-only`, montar `<DesktopOnlyNotice>` y envolver el módulo en `hidden sm:block`.
  3. Si es `mobile-first` o `responsive`, smoke test en Chrome DevTools (`< sm` viewport) sin overflow horizontal.

## Consecuencias

### Positivas

- **Cada módulo tiene perfil declarado** en su archivo, leíble por code review y por el dev que llega.
- **Cero módulos con experiencia rota en mobile sin advertencia** — `<DesktopOnlyNotice>` cubre el caso.
- **Decisión binaria en code review**: ¿el page tiene `@responsive`? ¿el comportamiento matches el perfil?
- **No requiere refactor masivo**: la regla aplica a PRs nuevos; los pages viejos se actualizan al tocarlos.

### Negativas

- **Sin migración inmediata** — la mayoría de los pages no tienen el comentario hoy. La adopción es incremental, similar a `<DataTable>` (ADR-010 DT8).
- **Convención de comentario JSDoc** no se enforza con linter automático en v1. Si se vuelve necesario, se agrega un eslint-rule custom (out of scope).

### Cosas que NO cambian

- Tailwind breakpoints — defaults siguen.
- Componentes compartidos (`<DataTable>`, `<DetailDrawer>`, etc.) — agnósticos al perfil (R5).
- Print stylesheet — vive en componentes (ADR-018 DD5, futuro `print-pattern`).

## Fuera de alcance v1

- **Bottom sheet en mobile** (drawer side-bottom). Si surge necesidad real, se evalúa como extensión de `<DetailDrawer>`.
- **Sidebar mobile** (hamburger / tab bar). El `<AppShell>` ya maneja el sidebar collapse en `< md:` — mantener.
- **Touch target audit masivo**. PRs nuevos lo respetan; los pages viejos no se auditan en bulk.
- **PWA installability** — feature aparte.
- **Native apps** (RN, Capacitor) — fuera de scope.

## Referencias

- Componente: [components/responsive/desktop-only-notice.tsx](../../components/responsive/desktop-only-notice.tsx)
- Iniciativa: [docs/planning/responsive-policy.md](../planning/responsive-policy.md)
- ADR-006 — estados (empty/loading/error).
- ADR-010 — `<DataTable>` (no degrada a cards en v1; futuro).
- ADR-018 — `<DetailDrawer>` (no bottom-sheet en v1).
