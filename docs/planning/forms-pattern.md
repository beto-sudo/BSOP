# Iniciativa — Forms pattern (`<Form>` + validación)

**Slug:** `forms-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-29

## Problema

Cada formulario del repo arma validación, layout, manejo de errores y
estados (dirty / saving / disabled) de cero. Auditoría rápida:

- `components/documentos/documento-form-fields.tsx`
- `components/documentos/documento-create-sheet.tsx`
- `components/tasks/tasks-create-form.tsx`
- `components/tasks/tasks-edit-form.tsx`
- `components/rh/empleado-alta-wizard.tsx` (multi-step)
- Forms inline en pages de DILESA `[id]` (proyectos, prototipos, etc.)
- Form de captura de cortes (abrir/cerrar caja).

Síntomas visibles:

- Validación: a veces zod, a veces validación manual con `if (!field)`,
  a veces solo validación de submit.
- Error display: a veces span rojo debajo del input, a veces toast,
  a veces alert nativo (regla T2 de ADR-008 ya prohíbe esto pero hay
  holdouts).
- Layout: 1 columna vs 2 columnas vs grid varía sin regla.
- "Guardando..." button state: implementado en algunos, ausente en
  otros, copy distinto cada vez.
- Dirty tracking: si el usuario cierra el sheet/dialog con cambios
  sin guardar, algunos preguntan, otros se cierran y pierden datos.

## Outcome esperado

- Componente `<Form>` con react-hook-form + zod como base.
- `<FormField>` con label + input + error display tipado.
- Layout helpers (`<FormSection>`, `<FormRow>`, `<FormActions>`) para
  consistencia visual.
- Estados estándar: `dirty`, `submitting`, `disabled` por construcción.
- Confirmación de "descartar cambios" si `dirty=true` al cerrar drawer/
  sheet/dialog (integrado con `<ConfirmDialog>` de ADR-008).
- Convención de copy para botones: "Guardar" / "Guardando..." /
  "Cancelar". Disabled visible (opacity + cursor-not-allowed) sin
  ambigüedad.

## Alcance v1 (cerrado 2026-04-28 — ver ADR-016)

- [x] Decidir librería: **react-hook-form** (estándar industria, integra
      con shadcn/base-ui inputs vía `Controller`, ~12kb gzipped).
- [x] Schema layer: **zod** (ya en deps `^4.3.6`).
- [x] Componentes: `<Form>`, `<FormField>`, `<FormSection>`,
      `<FormRow>`, `<FormActions>` en `components/forms/`.
- [x] `useZodForm` helper que encapsula `useForm + zodResolver` con
      typing limpio.
- [x] `useDirtyConfirm` integrado con `<ConfirmDialog>` (ADR-008).
- [x] ADR-016 codificando las 7 reglas (F1-F7).
- [x] Golden path: `tasks-create-form` simple variant migrado en Sprint 1.
- [ ] Migración del resto de forms — Sprints 2-6.

## Fuera de alcance v1

- **Multi-step wizards**. `empleado-alta-wizard` evaluado en Sprint 6;
  si encaja sin churn entra, si no sale como `wizard-pattern`.
- **Form builders dinámicos**. No hay caso real hoy.
- **Auto-save / draft persistence**. Postergable.
- **File inputs como parte del form schema** — vive en
  `file-attachments` (iniciativa hermana).
- **Tests unitarios del wrapper** — repo no tiene testing-library;
  e2e + uso del componente cubren el comportamiento.
- **Server actions como convención forzada** — `<Form>` soporta server
  actions, pero el repo es 95% client-side fetch hoy y no se migra como
  parte de esta iniciativa.

## Métricas de éxito

- 100% de forms nuevos usan `<Form>` + zod + RHF.
- Cero `useState` ad-hoc para `dirty` / `submitting` en forms migrados.
- Zero validación manual con `if (!field)` o `alert()`.
- Cerrar drawer/sheet con cambios sin guardar pregunta antes (en
  forms migrados).

## Sprints / hitos

| #   | Sprint                                       | Estado  | PR   |
| --- | -------------------------------------------- | ------- | ---- |
| 1   | Foundation + ADR-016 + golden path tasks     | done    | #300 |
| 2   | tasks (rich create + edit) + juntas adopters | done    | TBD  |
| 3   | documentos (form-fields + create-sheet)      | next    | —    |
| 4   | DILESA `[id]` inline forms                   | pending | —    |
| 5   | Cortes (abrir/cerrar caja)                   | pending | —    |
| 6   | empleado-alta-wizard (eval + migrate o spin) | pending | —    |
| 7   | Cierre + INITIATIVES move to Done            | pending | —    |

## Decisiones registradas

### 2026-04-28 · ADR-016 — `<Form>` + RHF + zod (Sprint 1)

Codificado en [ADR-016](../adr/016_forms_pattern.md). Las 7 reglas:

- **F1** — `react-hook-form` + `zod` como base, `useZodForm` como entry point.
- **F2** — Errores **debajo del input**, nunca toast/alert/banner (refuerza ADR-008 T2).
- **F3** — `<FormField>` cablea label + control + error + a11y por construcción (render-prop pattern).
- **F4** — Layout via `<FormSection>` + `<FormRow>` (mobile-first, 1 col mobile / N cols `sm:`+).
- **F5** — `<FormActions>` estandariza copy (`Cancelar`/`Guardar`/`Guardando...`) + auto-detect `isSubmitting`.
- **F6** — `useDirtyConfirm` integrado con `<ConfirmDialog>` para gate de drawer/sheet close cuando dirty.
- **F7** — `<Form>` agnostic a server actions vs client mutations; el callback `onSubmit` decide.

### 2026-04-28 · Tests unitarios pospuestos

Repo no tiene `@testing-library/react` ni `jsdom`. Los tests existentes son
node-only (lógica pura). Sprint 1 entrega sin tests de componente; los e2e
de Playwright + el uso real cubren el comportamiento. Si surge regresión,
se evalúa instalar testing-library en una iniciativa aparte.

### 2026-04-28 · Multi-step wizards fuera de v1

`empleado-alta-wizard` es el único caso real hoy. Sprint 6 evalúa si encaja
en el pattern; si requiere API materialmente distinta, sale como
`wizard-pattern` aparte para no contaminar la API simple del v1.

## Bitácora

### 2026-04-29 — Sprint 2 mergeado

`tasks-create-form.tsx` rich variant migrado a `<Form>` + zod
(`RichCreateSchema` con required `prioridad`/`asignado_a`/`fecha_compromiso`

- `superRefine` para `motivo_bloqueo` cuando estado='bloqueado').
  `tasks-edit-form.tsx` simple + rich variants migrados (schema con
  `porcentaje_avance` + `motivo_bloqueo` condicional + reset on
  `selectedTask` change). API del dispatcher unificada — ambos componentes
  ahora reciben `onCreate(values)` / `onSave(values)` y manejan su propio
  state internamente.

`components/tasks/tasks-module.tsx` simplificado: `createForm`,
`editForm`, `creating`, `saving`, `emptyTaskForm()` eliminados — el form
maneja todo. `handleCreate`/`handleUpdate` ahora reciben `formValues` y
hacen el insert/update directo.

Adopters de juntas refactorizados:

- `components/juntas/junta-detail-module.tsx`: `handleAddTask` ahora
  recibe `formValues`. `taskForm`/`addingTask` state eliminados.
  Validación inline removida (vive en zod).
- `app/inicio/juntas/[id]/page.tsx`: idem. Bug colateral fixed:
  validación previa pedía `fecha_vence` que el rich form nunca llenaba
  (el rich captura `fecha_compromiso`); ahora el insert escribe ambos en
  sync con `fechaPrincipal`.

`emptyTaskForm()` removido de `tasks-shared.tsx` — ningún caller lo
necesita ya. Cada form pone sus defaults locales por construcción.

PR: pendiente.

### 2026-04-28 — Sprint 1 mergeado

Foundation completo en `components/forms/`:

- `form.tsx` — `<Form>` + `useZodForm` helper.
- `form-field.tsx` — render-prop con a11y por construcción.
- `form-section.tsx` — heading + body con divider opcional.
- `form-row.tsx` — grid responsive mobile-first.
- `form-actions.tsx` — submit/cancel con auto-detect de submitting.
- `use-dirty-confirm.tsx` — hook + `<ConfirmDialog>` para gate de close.
- `index.ts` — barrel export.

Deps agregadas: `react-hook-form` ^7.74.0, `@hookform/resolvers` ^5.2.2.

ADR-016 publicado con las 7 reglas (F1-F7).

Golden path: `components/tasks/tasks-create-form.tsx` simple variant
migrado a `<Form>` + `useZodForm` + `<FormField>`. Rich variant queda
intacta para Sprint 2 (dispatcher acepta `onCreate(values?)` para
mantener ambos paths funcionando). Module padre simplificado: validación
deja de vivir inline en `handleCreate`.

PR: pendiente (creado tras update de INITIATIVES.md).
