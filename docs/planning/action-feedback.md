# Iniciativa — Action Feedback (toast + confirm destructive)

**Slug:** `action-feedback`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26 (alcance v1 cerrado al arrancar)

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

- **Fase 1 — hook + ADR + 3 migraciones golden.** ⏳ **En curso (PR abierto).** Salida: `useActionFeedback` (`hooks/use-action-feedback.ts`) + ADR-008 con 5 reglas (T1-T5) + migración de 3 holdouts de `window.confirm` (terrenos/[id], prototipos/[id], proyectos/[id] de DILESA) + checks en `ui-rubric.md` Section 10. Próximo hito: Beto smoke + merge.
- **Fase 2 — adopción incremental.** ⏸️ Sin PR único. Cada toque futuro a un archivo con `window.confirm`/`alert` lo migra; los nuevos PRs no se aprueban con esos patterns. Mientras tanto, ~12 holdouts conviven con la convención hasta que se les toque por otro motivo.

## Decisiones registradas

- **2026-04-26 (CC) — Aprovechar infra existente, no recrear.** Auditoría inicial encontró `<ToastProvider>` + `useToast()` ya montados sobre `@base-ui/react/toast` (5 tipos, soporte para acciones), y `<ConfirmDialog>` en `components/shared/` ya funcional con async + loading + auto-close. El alcance v1 NO crea componentes nuevos; aprovecha lo existente con un wrapper ergonómico (`useActionFeedback`) y documenta la convención (ADR-008).
- **2026-04-26 (CC) — Wrapper completo (`success/error/info/warning/undoable`) sobre `useToast`, no solo `error`.** Beto eligió Opción C sobre B: el wrapper completo. La justificación tras evaluar el churn: `feedback.success(title)` ahorra ~25 caracteres vs `toast.add({title, type:'success'})`, marginal por línea pero valioso para uniformidad — el code review tiene un check binario "¿usa el wrapper o `toast.add` directo?". `feedback.error(err)` con inferencia de `Error.message` es el ahorro real (eliminó ~30 sitios donde se repetía `e instanceof Error ? e.message : '...'`).
- **2026-04-26 (CC) — `actionProps` shape correcto descubierto al implementar.** El JSDoc del wrapper `toast.tsx` mostraba un ejemplo incorrecto: `action: { label, onClick }`. La signatura real de `@base-ui/react/toast` es `actionProps: ButtonHTMLAttributes` — el label va como `children`, el handler como `onClick`. El hook `useActionFeedback` abstrae eso: la API pública del wrapper sigue siendo `{label, onClick}` y se traduce internamente. JSDoc de `toast.tsx` corregido en este PR.
- **2026-04-26 (CC) — `<ConfirmDialog>` se queda donde está, no se renombra.** Evaluado renombrar a `<ConfirmDestructive>` para alinear con el doc original; descartado: ya está en uso por algunos módulos, renombrarlo es churn sin valor. El componente ya usa `confirmVariant="destructive"` por default — su nombre genérico no hace daño.
- **2026-04-26 (CC) — Migrar solo 3 holdouts en este PR (DILESA terrenos/prototipos/proyectos `[id]`), no los ~12.** Los 3 son virtually idénticos ("¿Archivar X?" + soft-delete + redirect), perfecto para sentar el patrón sin churn. El resto se migran por construcción cuando se les toque.
- **2026-04-26 (CC) — Cierre de `filters-url-sync` se bundlea en este PR.** Mismo approach que cierre de `module-states` en el PR anterior: minimiza ediciones a INITIATIVES.md (regla 1 del CLAUDE.md, hotspot reduction).

## Bitácora

- **2026-04-26 (CC)** — Fase 1 implementada. Branch `feat/ui-action-feedback`. Hook nuevo `hooks/use-action-feedback.ts` con API `{ success, error, info, warning, undoable }`, error con inferencia automática de `Error.message`. ADR-008 (`docs/adr/008_action_feedback.md`) creado con 5 reglas (T1-T5). JSDoc de `components/ui/toast.tsx` actualizado para reflejar el shape real de `actionProps` y recomendar `useActionFeedback` como entry point preferido. Migración de 3 holdouts: `app/dilesa/terrenos/[id]/page.tsx`, `app/dilesa/prototipos/[id]/page.tsx`, `app/dilesa/proyectos/[id]/page.tsx` — los 3 reemplazan `window.confirm` + `alert(...)` por `<ConfirmDialog>` + `feedback.error(err, {title})` + `feedback.success(...)`. `docs/qa/ui-rubric.md` Section 10 actualizada con 4 checks específicos a la convención. INITIATIVES.md: `action-feedback` proposed → in_progress; `filters-url-sync` movida a `## Done`.
