# Iniciativa — Action Feedback (toast + confirm destructive)

**Slug:** `action-feedback`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `filters-url-sync`.** Alcance v1 detallado
> se cierra cuando arranque su turno.

## Problema

Cada módulo decide por su cuenta cómo dar feedback después de una
mutación: a veces toast, a veces banner inline, a veces nada y el
usuario no sabe si su acción tuvo efecto. Igual con confirmaciones
destructivas (eliminar, desactivar, anular) — algunos módulos
preguntan, otros no, y el copy varía.

Síntomas:

- Posición y duración de toasts inconsistente.
- "¿Estás seguro?" con copy distinto entre módulos.
- Sin pattern de "undo" donde tendría sentido (ej. desactivar producto).
- Errores de mutación a veces caen a `console` sin feedback al user.

## Outcome esperado

- Toast pattern único (sonner u shadcn toast) con convención de copy,
  posición, duración por tipo (success / error / info).
- `<ConfirmDestructive>` componente compartido para acciones
  irreversibles, con copy parametrizado por entidad.
- "Undo" donde la operación lo permita (soft-delete que se puede
  revertir en N segundos).
- Cero `alert()` o feedback ad-hoc en módulos.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Decidir librería: sonner (ya común en shadcn) vs alternativa.
- [ ] Helper `toast.success/error/info(message)` con defaults.
- [ ] `<ConfirmDestructive entity action onConfirm>` modal compartido.
- [ ] Convención: toast para no-destructivo, modal para destructivo.
- [ ] Migrar 2-3 mutaciones existentes como prueba (probable:
      eliminar movimiento de inventario, anular venta, desactivar
      producto).

## Fuera de alcance

- Sistema de notificaciones persistente (notif center). Eso es feature.
- Feedback en tiempo real (websockets, presencia). Out of scope.

## Métricas de éxito

- Toda mutación visible al usuario tiene feedback (toast o modal).
- Cero `alert()` / `confirm()` nativos en el código.
- Copy de "¿Estás seguro?" reusa el componente compartido.

## Riesgos / preguntas abiertas

- [ ] ¿Toast en mobile? Posición y safe-areas.
- [ ] ¿Stacking de múltiples toasts simultáneos?
- [ ] Coexistencia con `<ErrorBanner>` de `module-states` — toast es
      efímero, banner es persistente. Definir cuándo cada uno.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
