# Iniciativa — Accessibility baseline (WCAG 2.1 AA)

**Slug:** `a11y-baseline`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `responsive-policy`.** Alcance v1 detallado
> se cierra cuando arranque su turno.

## Problema

Cero documentado sobre accesibilidad. Riesgo bajo hoy (uso interno, base
de usuarios chica), pero crece con cada empleado nuevo (operadores con
distintas capacidades, uso prolongado que exige buena ergonomía visual,
posible obligación legal a futuro). Costo de corrección crece con el
tamaño del producto: mejor fijar baseline ahora que cuando haya 50
módulos.

## Outcome esperado

- Baseline WCAG 2.1 AA documentado y testeable.
- `<ModulePage>`, `<DataTable>`, `<EmptyState>`, etc. cumplen el
  baseline by default.
- Audit script (`npm run audit:a11y` con axe-core o similar) corre en
  CI y bloquea PRs con regresiones críticas.
- Convenciones explícitas: contrast ratios, focus visible, keyboard
  nav, labels, ARIA.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] ADR fijando WCAG 2.1 AA como baseline mínimo.
- [ ] Audit baseline con axe DevTools sobre módulos clave.
- [ ] Reglas: contraste 4.5:1 en texto normal, focus visible
      siempre, todo elemento interactivo navegable por teclado.
- [ ] Convención de aria-label / aria-labelledby para componentes
      compartidos.
- [ ] Script `audit:a11y` en CI sobre rutas representativas.
- [ ] Capacitación / referencia rápida en `docs/qa/a11y-rubric.md`.

## Fuera de alcance

- WCAG AAA (más estricto, no es estándar internacional para apps
  internas).
- Soporte completo de screen readers en flujos OCR / camera (caso
  edge — documentar como excepción).
- Audit manual con usuarios con discapacidad — costoso, postergar.

## Métricas de éxito

- axe-core reporta 0 issues críticas o serias en módulos auditados.
- Keyboard-only walkthrough completo de 3 módulos clave sin bloqueo.
- Contraste mínimo 4.5:1 en todo texto (verificado con tool).

## Riesgos / preguntas abiertas

- [ ] ¿Algunos componentes shadcn/radix ya cumplen baseline o hay que
      ajustarlos?
- [ ] Tablas grandes con `<DataTable>` — ¿navegación por teclado entre
      celdas o solo entre filas?
- [ ] Modales y drawers — focus trap correcto.
- [ ] Color como único indicador de estado (badges) — agregar texto o
      icono.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
