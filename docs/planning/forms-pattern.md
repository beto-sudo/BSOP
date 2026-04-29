# Iniciativa — Forms pattern (`<Form>` + validación)

**Slug:** `forms-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
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

| #   | Sprint                                                | Estado | PR   |
| --- | ----------------------------------------------------- | ------ | ---- |
| 1   | Foundation + ADR-016 + golden path tasks              | done   | #300 |
| 2   | tasks (rich create + edit) + juntas adopters          | done   | TBD  |
| 3   | documentos (form-fields + create + detail)            | done   | TBD  |
| 4   | DILESA list pages (terrenos/proyectos/etc.)           | done   | TBD  |
| 5   | Cortes (registrar-mov + voucher-capture)              | done   | #304 |
| 6   | empleado-alta-wizard (eval + spin a `wizard-pattern`) | done   | TBD  |
| 7   | Cierre + INITIATIVES move to Done                     | done   | TBD  |

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

### 2026-04-29 — Sprint 6 + 7 mergeados (cierre)

**Sprint 6 — `empleado-alta-wizard` evaluation**: 1329 líneas, 3 pasos
navegables, ~30 useState, file uploads con storage Supabase, inserción
multi-tabla con rollback best-effort, beneficiarios dinámicos (1..N).
Forzarlo al `<Form>` de v1 contamina la API porque:

- Submit no es único — secuencial multi-tabla con rollback.
- Cada paso valida antes de avanzar, no solo al final.
- Dirty confirm tiene que considerar progreso parcial.
- Beneficiarios dinámicos requieren `useFieldArray` (no expuesto en v1).
- File uploads arrastran `file-attachments` (iniciativa hermana pending).

**Decisión**: spin-out a `wizard-pattern` (ver `docs/planning/wizard-pattern.md`).
`empleado-alta-wizard` queda con su patrón actual hasta que
`wizard-pattern` v1 esté listo. Cuando esa iniciativa arranque, migra
este wizard como golden path.

**Sprint 7 — cierre**: iniciativa `forms-pattern` movida a `done` en
INITIATIVES.md. Outcome:

- Foundation completa en `components/forms/` (Form + FormField +
  FormSection + FormRow + FormActions + useDirtyConfirm + useZodForm).
- ADR-016 con 7 reglas (F1-F7).
- 7 forms migrados a `<Form>` + zod en 5 sprints (PRs #300, #301, #302,
  #303, #304, _este PR_):
  - tasks-create-form (simple + rich) + tasks-edit-form (simple + rich)
  - juntas adopters (junta-detail-module + app/inicio/juntas/[id])
  - documento-form-fields + documento-create-sheet + documento-detail-sheet (edit mode)
  - 4 DILESA list pages (terrenos + proyectos + anteproyectos + prototipos)
  - cortes registrar-movimiento-dialog + voucher-capture-form

Boilerplate eliminado total (estimación): ~50 `useState` per-field +
~12 `setSaving` / `setCreating` ad-hoc + 1 `emptyTaskForm()` helper +
~10 validaciones inline `if (!field) return`.

Holdouts documentados como excepciones permanentes:

- `cortes/abrir-caja-dialog.tsx`: display, no form real.
- `cortes/cerrar-corte-dialog.tsx`: state derivado complejo (breakdown
  efectivo + diferencias + conciliación visual). Migrarlo requiere
  reescritura. Follow-up cuando se toque por feature work.
- `rh/empleado-alta-wizard.tsx`: spin a `wizard-pattern`.

PR: pendiente.

### 2026-04-29 — Sprint 5 mergeado

`components/cortes/`: 2 forms migrados a `<Form>` + zod.

- `registrar-movimiento-dialog.tsx`: schema con `tipo_detalle` requerido +
  `monto` validado (`Number > 0` via `.refine`) + `concepto` requerido.
  La cascada original (cuando cambias `tipo_detalle` se autofila
  `concepto` con el `conceptoDefault` de la opción si está vacío o
  matchea el default previo) preservada via `useRef` + `setValue`/`getValues`
  encapsulado en sub-componente `<TipoMovimientoField>`. Badge dinámico
  "+ entrada"/"– salida" derivado del watch en `<MontoConDireccionField>`.
- `voucher-capture-form.tsx`: schema con `superRefine` para validación
  condicional por `categoria`:
  - `voucher_tarjeta`: requires monto > 0.
  - `comprobante_movimiento`: requires `movimiento_id`.
  - `otro`: nada.
    Sub-componente `<CategoriaSegmentedControl>` para el toggle visual,
    reads/writes via context.

**Skip explícito**:

- `abrir-caja-dialog.tsx`: no es realmente un form — es display de info
  heredada (efectivo inicial calculado externamente, responsable y fecha
  prefilled, único campo editable es Combobox de caja controlado
  externamente). Migrarlo agregaría boilerplate sin valor.
- `cerrar-corte-dialog.tsx`: form de cierre con state derivado complejo
  (breakdown de efectivo por denominación, diferencias, conciliación
  visual). Migrarlo requiere casi reescribirlo. Postergado fuera de v1
  de `forms-pattern`; queda como follow-up cuando se toque el módulo
  por feature work real.

PR: pendiente.

### 2026-04-29 — Sprint 4 mergeado

`app/dilesa/{terrenos,proyectos,anteproyectos,prototipos}/page.tsx`: las
4 list pages tienen un Sheet "Nuevo X" con form de creación. Migrados
todos a `<Form>` + `useZodForm` + `<FormField>` + `<FormActions>`.

Boilerplate eliminado: 27 `useState` per-field reemplazados por 4
`useZodForm` (uno por list page). Validación inline `if (!nombre.trim())
return` removida — vive en zod schema. Required fields:

- `terrenos`: `nombre`.
- `proyectos`: `nombre` + `terreno_id` + `tipo_proyecto_id`.
- `anteproyectos`: `nombre` + `terreno_id`.
- `prototipos`: `nombre` + `terreno_id` + `tipo_prototipo_id`.

`<select>` HTML nativos preservados (no se migró a `<Combobox>` —
fuera de alcance). `<Combobox>` ya usados se mantienen, ahora dentro de
`<FormField>` render-prop con `value={field.value}` / `onChange={field.onChange}`.

Aclaración del scope del sprint: el planning original decía "DILESA
`[id]` inline forms"; la realidad es que los `[id]` pages usan
EditableField/inline-edit (no forms), mientras que los **list** pages
son los que tienen los Sheets con forms. Se actualizó el alcance del
sprint para reflejarlo.

PR: pendiente.

### 2026-04-29 — Sprint 3 mergeado

`components/documentos/`:

- `documento-form-fields.tsx`: refactor para leer/escribir desde
  `useFormContext<DocForm>()`. Drop de `form`/`setForm` props. Cada
  field usa `<FormField>` con render-prop. Lógica de cascadas
  (auto-título de Escritura cuando cambia tipo/notaría/subtipo_meta)
  conservada via `setValue` + `getValues`.
- `documento-create-sheet.tsx`: migrado a `<Form>` + `useZodForm` +
  `<FormActions>`. Schema `DocCreateSchema` (zod) con `tipo` required;
  los demás campos son opcionales en create por el flujo IA.
- `documento-detail-sheet.tsx`: extraído `DocEditSection` sub-componente
  que usa `<Form>` + `useZodForm` para el modo edit. Padre maneja
  `editing` boolean y delete state como antes; `editForm`/`setEditForm`
  /`saving` eliminados.

`emptyForm()` queda en `helpers.ts` porque se usa como `defaultValues`
inicial de los `useZodForm`. `docToForm()` también queda — es el mapper
documento → form values al entrar a edit.

PR: pendiente.

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
