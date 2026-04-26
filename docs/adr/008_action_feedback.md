# ADR-008 — Convención de feedback post-acción (toast / banner / confirm)

- **Status**: Accepted
- **Date**: 2026-04-26
- **Authors**: Beto, Claude Code (iniciativa `action-feedback`)
- **Related**: [ADR-006](./006_module_states.md)

---

## Contexto

Auditoría sobre el árbol de `app/` y `components/`:

- **Toast** ya está montado: `<ToastProvider>` en [providers.tsx](../../components/providers.tsx) sobre `@base-ui/react/toast`, con 5 tipos (`success`, `error`, `warning`, `info`, `default`) y soporte para acciones (Undo).
- **Confirm destructivo** ya existe: [components/shared/confirm-dialog.tsx](../../components/shared/confirm-dialog.tsx) con `<AlertDialog>`, soporte async, loading, auto-close.
- **Pero** ~15 archivos usan `window.confirm()` en vez de `<ConfirmDialog>`, y otros tantos hacen `alert(\`Error: ${err.message}\`)` en lugar de un toast.
- Cada módulo decide ad-hoc cuándo es toast vs banner vs nada. Cuando un dev nuevo (humano o agente) llega, inventa el patrón de cero.

ADR-006 fijó el `<ErrorBanner>` para errores de **fetch** (cargar datos). Pero quedó implícito qué hacer con errores de **mutación** (guardar, eliminar, archivar) — que son una situación distinta: el usuario hizo click, espera respuesta inmediata, y necesita confirmación de que pasó algo.

## Decisión

Convención fija sobre 3 mecanismos. Cada uno tiene un rol claro y no compiten.

```
┌────────────────────────┬────────────────────────────────────────────────────┐
│ Toast (efímero)        │ Feedback de mutación: "se guardó", "falló al X"   │
│ ErrorBanner (R10)      │ Error de fetch persistente, con Reintentar        │
│ ConfirmDialog          │ Antes de acción destructiva (eliminar, anular)    │
└────────────────────────┴────────────────────────────────────────────────────┘
```

Wrapper ergonómico nuevo `useActionFeedback()` ([hooks/use-action-feedback.ts](../../hooks/use-action-feedback.ts)) sobre `useToast()`:

```tsx
const feedback = useActionFeedback();

try {
  await save();
  feedback.success('Puesto actualizado');
} catch (e) {
  feedback.error(e); // infiere e.message automáticamente
}

// Soft-delete con undo:
feedback.undoable({
  title: 'Departamento eliminado',
  undo: () => restore(id),
});
```

### Las 5 reglas (T1–T5)

#### T1 — Toast = feedback de mutación; ErrorBanner = error de fetch

Si el usuario hace click y la operación falla → `feedback.error(e)` (toast). Si la página intenta cargar datos y falla → `<ErrorBanner>` con `onRetry`.

> **Por qué**: el toast es efímero (5s) — perfecto para "tu acción se completó". El banner es persistente — perfecto para "no podemos mostrar nada hasta resolver esto". Mezclarlos (toast para fetch error, banner para mutación) confunde: el usuario ve el toast y no sabe que el módulo entero está roto, o ve el banner y no sabe si su click ya tuvo efecto.

#### T2 — `<ConfirmDialog>` antes de destructivos. NO `window.confirm`

Eliminar, anular, archivar, desactivar, restablecer — cualquier acción que no se pueda Ctrl-Z trivialmente — pasa por `<ConfirmDialog>` con `confirmVariant="destructive"`. `window.confirm()`, `window.alert()`, `window.prompt()` están **prohibidos** en código de aplicación.

> **Por qué**: `window.confirm` no respeta el theme, no soporta async (la mutación corre síncronamente o no), no es estilizable, no es testeable, no soporta i18n. El componente compartido sí — y el copy queda consistente entre módulos.

#### T3 — Copy del title como pregunta; description como efecto secundario

Title: `"¿{Acción} {entity}?"` ("¿Eliminar departamento?", "¿Archivar el terreno 'Lote-12'?").
Description: explicación de qué pasa después, especialmente si hay reversibilidad o cascada ("Esta acción marca el registro como eliminado. Se puede restaurar desde auditoría.").

Si la acción es completamente irreversible, decirlo en la description ("Esta operación no se puede deshacer.").

> **Por qué**: el title como pregunta cierre obliga al usuario a procesarla como decisión, no como información. La description completa el modelo mental — sin ella, el usuario duda.

#### T4 — Toast con Deshacer (5s) cuando la op es revertible

Cuando la mutación es soft-delete o tiene un equivalente trivial de revert (`restore(id)`, toggle de `activo`), preferir `feedback.undoable({title, undo})` en lugar de un confirm previo. Esto invierte el flujo:

- **Confirm previo**: bloquea la acción, requiere dos clicks. Apropiado para cosas con efectos en cascada o que llevan tiempo (envíos, generación de reportes, eliminaciones con FK cascade).
- **Toast con Deshacer**: la acción ocurre inmediatamente; si el usuario se arrepiente, click en "Deshacer" antes de que pase el timeout (5s). Apropiado para soft-deletes y toggles.

`<ConfirmDialog>` y `feedback.undoable` no son intercambiables — son patterns para flujos distintos. El caller decide.

> **Por qué**: el confirm para soft-delete es fricción innecesaria — el dato no se pierde, se puede restaurar. El usuario que rara vez se arrepiente paga el costo cada vez. El toast con Deshacer es el balance correcto.

#### T5 — Errores de mutación → `feedback.error(err)`. Inferencia automática.

Patrón viejo:

```tsx
if (err) {
  alert(`Error al archivar: ${err.message}`); // o toast.add({type:'error', ...})
  return;
}
```

Patrón nuevo:

```tsx
if (err) {
  feedback.error(err, { title: 'No se pudo archivar el terreno' });
  return;
}
```

`feedback.error` infiere `description` de `err.message` (o `String(err)` si no es Error). El caller solo aporta el title contextual ("No se pudo archivar el terreno") — no se preocupa de unwrap.

> **Por qué**: el `e instanceof Error ? e.message : 'Error desconocido'` se repite ~30 veces en el repo. Centralizarlo elimina drift y permite mejorar la inferencia (e.g. detectar errores de Supabase con `.code` específico) en un solo lugar.

### A11y mínimo

- Toast usa el viewport portal de `@base-ui/react/toast` con `role="status"` (success/info/warning) o `role="alert"` (error) implícitos por type.
- `<ConfirmDialog>` hereda a11y de `<AlertDialog>` de @base-ui (focus trap, Escape para cerrar, aria-labelledby).

## Implementación

- **PR de creación + adopción** (este PR): `useActionFeedback` hook + ADR-008 + migración de 3 holdouts (terrenos[id], prototipos[id], proyectos[id]) + update `ui-rubric.md` Section 10.
- **Adopción incremental**: cada futura mutación nueva usa `useActionFeedback`. Los `window.confirm`/`alert` restantes se migran cuando se toque cada archivo por otro motivo — no se abre PR de "migrar todos los confirms" por churn.

## Consecuencias

### Positivas

- Code review tiene checks binarios: ¿usa `feedback.error(e)` o `alert()`? ¿usa `<ConfirmDialog>` o `window.confirm`? ¿usa `feedback.undoable` o un confirm de soft-delete?
- Errores de mutación quedan tipo-seguros: el `e instanceof Error ? ... : ...` se elimina del call site.
- El ADR distingue T1/T2/T3/T4/T5 — cada situación tiene una respuesta clara.
- Audit visual del módulo (rúbrica QA) gana 4 checks específicos en Section 10.

### Negativas

- Migrar TODOS los holdouts de una sola vez es churn — se pospone a adopción incremental. Mientras tanto, el repo tiene 12+ archivos con `window.confirm`. Aceptado: cada toque futuro los limpia, y los nuevos PRs no se aprueban con `window.confirm`.
- `useActionFeedback` agrega un layer encima de `useToast`. Devs experimentados pueden seguir usando `useToast` directo si necesitan algo que el wrapper no expone — el wrapper no es restrictivo, solo ergonómico.

### Cosas que NO cambian

- ADR-006 R10 sobre `<ErrorBanner>` — sigue siendo el mecanismo para errores de fetch. T1 lo confirma.
- `<ConfirmDialog>` en `components/shared/confirm-dialog.tsx` — se queda donde está, no se renombra ni mueve.
- `<ToastProvider>` y la infra base-ui — sin cambios.

## Referencias

- Hook nuevo: [hooks/use-action-feedback.ts](../../hooks/use-action-feedback.ts)
- Componente existente: [components/shared/confirm-dialog.tsx](../../components/shared/confirm-dialog.tsx)
- Toast wrapper: [components/ui/toast.tsx](../../components/ui/toast.tsx)
- Iniciativa: [docs/planning/action-feedback.md](../planning/action-feedback.md)
- PR de implementación: `feat/ui-action-feedback`
