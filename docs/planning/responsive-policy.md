# Iniciativa — Responsive policy

**Slug:** `responsive-policy`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-26
**Cerrada:** 2026-04-29
**Última actualización:** 2026-04-29

## Problema

Algunos módulos son inherentemente mobile-first (RDB Inventario captura
con código de barras, Marbete impreso, Conciliación en piso) y otros
son desktop-only (Cortes financiero, Productos admin, dashboards). Hoy
cada módulo decide sin regla — y cuando alguien abre el módulo equivocado
en su teléfono, la experiencia varía entre "funciona", "funciona feo" y
"no se puede usar".

## Outcome esperado

- Cada módulo declara su perfil responsive: `mobile-first`,
  `desktop-only`, o `responsive` (degrada gracefully).
- Convención clara de breakpoints (Tailwind defaults).
- Componente `<DesktopOnlyNotice>` para módulos desktop-only.
- Detección por viewport (CSS), no user-agent.
- Componentes compartidos agnósticos al perfil.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-019)

- [x] 3 perfiles canónicos: `mobile-first` / `desktop-only` / `responsive`.
- [x] Tailwind defaults como breakpoints (sin custom).
- [x] `<DesktopOnlyNotice>` en `components/responsive/`.
- [x] Detección por viewport (CSS-driven, no UA-sniffing).
- [x] Componentes compartidos agnósticos al perfil — el page decide.
- [x] ADR-019 con 5 reglas (R1-R5).
- [x] ~~Adopción incremental~~ — Beto autorizó sprint dedicado de barrido
      el 2026-04-29: los 70 pages del repo recibieron `@responsive` JSDoc
      en un solo PR + `<DesktopOnlyNotice>` en los 37 desktop-only que
      rendean contenido visual.

## Decisiones tomadas al cerrar alcance

- **3 perfiles (no más, no menos)**: cubre el repo con matiz suficiente sin
  invocar perfiles ad-hoc.
- **Tailwind defaults** en lugar de breakpoints custom: cero refactor masivo.
- **Comentario JSDoc `@responsive`** en lugar de file convention o folder
  layout: cero churn estructural; declarar es 1 línea.
- **CSS-driven detection** en lugar de UA-sniffing: estable bajo SSR, rotación
  de tablet, navegadores in-app.
- **Sin migración inmediata** — adopción incremental tipo ADR-010 DT8. PRs
  nuevos respetan; pages viejos se actualizan al tocarlos.
- **Sin `<MobileFirstNotice>` o `<ResponsiveNotice>`**: solo desktop-only
  necesita el opt-out visual; los otros 2 perfiles son default por
  construcción.

## Fuera de alcance v1

- **Bottom sheet en mobile** (drawer side-bottom).
- **Touch target audit masivo**.
- **PWA installability**.
- **Native apps** (RN, Capacitor).
- **eslint-rule custom** que enforce el JSDoc `@responsive` — si se vuelve
  necesario, se agrega.

## Métricas de éxito

- Cada PR nuevo que toca un page declara su `@responsive` perfil.
- Mobile audit (Chrome DevTools `< sm`) en módulos `mobile-first`/`responsive`:
  cero overflow horizontal, cero overlap.
- `<DesktopOnlyNotice>` visible en módulos desktop-only abiertos en mobile.

## Sprints / hitos

| #   | Sprint                                                            | Estado | PR    |
| --- | ----------------------------------------------------------------- | ------ | ----- |
| 1   | Foundation + ADR-019 + DesktopOnlyNotice                          | done   | (pre) |
| 2   | Barrido completo de adopción — 70 pages clasificados (B aprobado) | done   | TBD   |

## Decisiones registradas

### 2026-04-29 · ADR-019 — Responsive policy (Sprint 1)

Codificado en [ADR-019](../adr/019_responsive_policy.md). Las 5 reglas:

- **R1** — 3 perfiles canónicos: `mobile-first` / `desktop-only` / `responsive`.
- **R2** — Breakpoints canónicos: Tailwind defaults (sm/md/lg/xl/2xl).
- **R3** — `<DesktopOnlyNotice>` para módulos `desktop-only`; visible solo en `< sm`.
- **R4** — Detección por viewport (CSS-driven), no user-agent.
- **R5** — Componentes compartidos heredan el perfil del page padre, no se autodetectan.

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/responsive/desktop-only-notice.tsx` — `<DesktopOnlyNotice>` con copy estándar + `role="alert"` + Monitor icon de lucide.
- `components/responsive/index.ts` — barrel export.
- ADR-019 con 5 reglas (R1-R5).

Sin migración masiva inicialmente: la adopción del comentario JSDoc
`@responsive` y de `<DesktopOnlyNotice>` se diseñó como incremental.

### 2026-04-29 — Sprint 2 (barrido completo) — _este PR_

Beto autorizó (opción "B" sobre la "A" de adopción incremental) un sprint
dedicado para clasificar todos los pages en una sola pasada y dejar la
iniciativa cerrada hoy.

**Clasificación final (70 pages):**

- **`mobile-first`** (6) — todos los pages bajo
  `app/rdb/inventario/levantamientos/**`. Captura física en piso/almacén
  desde celular (alta levantamiento, captura mobile, diferencias,
  reporte).
- **`desktop-only`** (38) — Cortes, Inventario Stock + Movimientos,
  Productos (Catálogo + Recetas + Auditoría + Análisis), OC,
  Requisiciones, Proveedores (RDB+DILESA), Ventas, Playtomic, todo el
  backbone DILESA Inmobiliario (Proyectos + Prototipos + Anteproyectos +
  Terrenos, listings + detail), todos los listings de RH (Personal +
  Departamentos + Puestos en RDB+DILESA+cross), Documentos admin
  (RDB+DILESA+cross), Personas Físicas, Settings (Acceso + Empresas +
  redirect).
- **`responsive`** (26) — root + login, todo `/inicio/*` (dashboard +
  Tasks + Juntas), Health, Family, Tasks/Juntas admin de RDB+DILESA,
  Empleado detail + contrato + finiquito (RDB+DILESA+cross), R&D, todas
  las landings (`/dilesa`, `/rdb`, `/rh`).

**Implementación:**

- 70/70 pages tienen `@responsive` JSDoc.
- 37/38 pages desktop-only tienen `<DesktopOnlyNotice>` montado +
  contenido envuelto en `hidden sm:block`. La excepción es
  `/settings/page.tsx` (redirect puro, no rendea UI visual).
- Cero churn en componentes shared — el patch es 100% page-level (R5
  honored).

**Verificación:** typecheck + lint + format check + test:run todos
verdes en local.
