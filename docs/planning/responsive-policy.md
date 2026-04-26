# Iniciativa — Responsive policy

**Slug:** `responsive-policy`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `data-table`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

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
- Convención clara de breakpoints (Tailwind defaults o custom).
- Componentes compartidos saben cómo degradan: `<DataTable>` →
  cards en mobile, drawers full-screen en mobile, etc.
- Para módulos `desktop-only`, copy explícito en mobile: "Este módulo
  está optimizado para desktop. Abrilo en una pantalla más grande."

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditoría: catalogar perfil responsive actual de cada módulo.
- [ ] ADR fijando los 3 perfiles + breakpoints canónicos.
- [ ] Componente `<DesktopOnlyNotice>` para módulos no-mobile.
- [ ] Reglas de degradación de `<DataTable>`, `<ModuleKpiStrip>`,
      `<ModuleFilters>` en mobile.
- [ ] Touch target mínimo (44x44 en mobile).

## Fuera de alcance

- Apps nativas (RN, Capacitor). Solo web.
- PWA installability — feature aparte.

## Métricas de éxito

- Cada módulo tiene perfil declarado en su page o layout.
- Mobile audit (Chrome DevTools) sin overlap ni overflow horizontal
  en ninguno de los módulos `mobile-first` o `responsive`.

## Riesgos / preguntas abiertas

- [ ] ¿Detectar mobile por viewport o user-agent? Viewport es estándar
      pero pierde casos edge (tablet en portrait).
- [ ] Sidebar en mobile — ¿drawer hamburger o tab bar inferior?
- [ ] Coordinar con `module-states` (skeletons en mobile son distintos
      al desktop) y `data-table` (degradación a cards).

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
