# Iniciativa — Forms pattern (`<Form>` + validación)

**Slug:** `forms-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `data-table` (ya done).** Alcance v1
> detallado se cierra cuando arranque su turno.

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

Adicional: `proveedores-csf-ai` está `planned` (Sprint 1) y va a
traer formulario nuevo de captura de proveedores con OCR de CSF. Si
sale antes que `forms-pattern`, va a inventar otro form ad-hoc que
después haya que migrar. Si sale después, nace con el pattern correcto.

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

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Decidir librería: react-hook-form (estándar) vs Conform vs
      formik. RHF probablemente, ya familiar.
- [ ] Schema layer: zod (estándar para tipado + runtime validation).
- [ ] Componentes: `<Form>`, `<FormField>`, `<FormSection>`,
      `<FormRow>`, `<FormActions>`.
- [ ] Hook `useDirtyConfirm()` integrado con `<ConfirmDialog>` para
      confirmación de descartar cambios.
- [ ] Migrar 2-3 forms existentes como golden path: - probable: `tasks-create-form` (form simple) - probable: `empleado-alta-wizard` (multi-step → ver si v1 lo
      cubre o queda fuera) - probable: form de captura de proveedor de
      `proveedores-csf-ai` cuando llegue
- [ ] ADR documentando la decisión (probable ADR-011).

## Fuera de alcance

- Wizards / multi-step forms si demuestran requerir API distinta.
  Decidir al arrancar — si `empleado-alta-wizard` encaja sin churn,
  va; si no, sale aparte como `wizard-pattern`.
- Form builders dinámicos (campos definidos en runtime). No hay caso
  hoy.
- Auto-save / draft persistence. Postergable.
- File inputs como parte del form schema — eso vive en
  `file-attachments` (iniciativa hermana).

## Métricas de éxito

- 100% de forms nuevos usan `<Form>` + zod + RHF.
- Cero `useState` ad-hoc para `dirty` / `submitting` en forms migrados.
- Zero validación manual con `if (!field)` o `alert()`.
- Cerrar drawer/sheet con cambios sin guardar pregunta antes (en
  forms migrados).

## Riesgos / preguntas abiertas

- [ ] **Coordinación con `proveedores-csf-ai`.** Idealmente
      `forms-pattern` arranca antes para que el form de proveedores
      nazca con el pattern. Si `proveedores-csf-ai` arranca primero,
      retro-migrar ese form en el PR de adopción de `forms-pattern`.
- [ ] **Multi-step (wizard)** — incluir o no en v1. Si se incluye,
      la API se complica. Decisión al arrancar.
- [ ] **Server actions vs client mutations** — Next.js App Router.
      Definir si el `<Form>` soporta ambos modos o si se queda con
      client-side fetch (consistente con el resto del repo hoy).
- [ ] **Coexistencia con shadcn `<Form>`** — shadcn ya provee un
      `<Form>` minimal. ¿Wrappear o reemplazar? Probable wrappear
      para no perder los primitives existentes.
- [ ] **A11y de errores de validación** — `aria-invalid`,
      `aria-describedby` en cada FormField. Integrar con
      `a11y-baseline` cuando arranque.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
