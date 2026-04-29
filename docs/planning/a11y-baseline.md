# Iniciativa — Accessibility baseline (WCAG 2.1 AA)

**Slug:** `a11y-baseline`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-29

## Problema

Cero documentado sobre accesibilidad. Riesgo bajo hoy (uso interno, base
de usuarios chica), pero crece con cada empleado nuevo. Costo de
corrección crece con el tamaño del producto: mejor fijar baseline ahora
que cuando haya 50 módulos.

## Outcome esperado

- Baseline WCAG 2.1 AA documentado y testeable.
- Componentes shadcn/Radix + convenciones ADR-006/008/010/016/017/018
  cumplen el baseline by default.
- Audit automatizado (axe-core) en CI bloqueando regresiones críticas.
- Convenciones explícitas en code review.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-020)

- [x] WCAG 2.1 AA como baseline mínimo (no AAA).
- [x] 6 reglas codificadas (A1-A6) en ADR-020.
- [x] Audit empírico (no automatizado) confirma que los componentes
      recientes ya cumplen baseline; gaps identificados (icon buttons,
      touch targets, charts color-only).
- [x] Convenciones explícitas para code review.
- [ ] Audit automatizado con `@axe-core/playwright` — Sprint 2.
- [ ] Fix de gaps incrementalmente — Sprint 3.

## Decisiones tomadas al cerrar alcance

- **WCAG 2.1 (no 2.2)**: 2.2 agrega criterios sobre dragging y focus
  appearance que axe-core aún no enforza en default. Subir a 2.2 cuando
  el tooling lo soporte (futuro).
- **Audit automatizado deferred a Sprint 2**: requiere instalar
  `@axe-core/playwright`, escribir tests de smoke para 3-5 rutas
  representativas, decidir bloqueante vs warning-only. Sprint 1 fija el
  contrato; Sprint 2 lo enforza.
- **Sin refactor masivo**: la mayoría del repo ya cumple por construcción
  via shadcn/Radix. Los gaps específicos (icon button sin aria-label,
  charts color-only) se fixean incrementalmente al tocarlos.

## Fuera de alcance v1

- **WCAG AAA**.
- **Screen reader full support** en OCR/camera flows.
- **Manual audit con usuarios con discapacidad**.
- **`@axe-core/playwright` integration** — Sprint 2.
- **Linter custom** que enforce `aria-label` en icon buttons — postergable.

## Métricas de éxito

- axe-core (cuando esté en CI) reporta 0 issues críticas o serias en
  módulos auditados.
- Keyboard-only walkthrough completo de 3 módulos clave sin bloqueo.
- Contraste mínimo 4.5:1 en todo texto (verificado puntualmente con tool).

## Sprints / hitos

| #   | Sprint                                      | Estado    | PR  |
| --- | ------------------------------------------- | --------- | --- |
| 1   | ADR-020 con baseline + 6 reglas             | done      | TBD |
| 2   | `@axe-core/playwright` + audit script en CI | postponed | —   |
| 3   | Fix de gaps incrementales                   | postponed | —   |

## Decisiones registradas

### 2026-04-29 · ADR-020 — A11y baseline (Sprint 1)

Codificado en [ADR-020](../adr/020_a11y_baseline.md). Las 6 reglas:

- **A1** — WCAG 2.1 AA como baseline; AAA fuera de alcance.
- **A2** — Contraste 4.5:1 texto normal, 3:1 texto large/UI.
- **A3** — Focus visible siempre; nunca `outline-none` sin reemplazo.
- **A4** — Keyboard nav completo: todo clickeable es activable con teclado.
- **A5** — `aria-label` / `aria-labelledby` para controles sin texto visible.
- **A6** — Color no es el único indicador de estado.

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

ADR-020 publicado. Sprint 1 cierra el contrato (qué cumplimos como
baseline) sin código nuevo. Las reglas A1-A6 codifican convenciones que
ya aplican los componentes recientes (forms-pattern, badge-system,
drawer-anatomy, etc.).

Sprint 2 (postponed) instalará `@axe-core/playwright` para audit
automatizado en CI. Sprint 3 (postponed) fixea gaps específicos
identificados en el audit empírico (icon buttons sin aria-label, etc.).

PR: pendiente.
