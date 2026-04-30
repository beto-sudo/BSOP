# Iniciativa — Wizard pattern (multi-step forms)

**Slug:** `wizard-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-29
**Cerrada:** 2026-04-29
**Última actualización:** 2026-04-29

> Spin-out de `forms-pattern` Sprint 6. La evaluación de
> `empleado-alta-wizard.tsx` (1329 líneas) confirmó que un wizard de N
> pasos requiere API materialmente distinta del `<Form>` de v1, y
> arrastra `file-attachments` (iniciativa hermana — ya cerrada). Se
> separa para no contaminar el API simple de `forms-pattern`.

## Problema

El repo tiene un solo wizard hoy: `components/rh/empleado-alta-wizard.tsx`
(alta de empleado, 3 pasos: identidad → puesto+contrato → expediente).
Es masivo (1329 líneas) y mezcla:

- 3 step state machines (índice de paso, navegación back/next, validación
  por paso antes de avanzar).
- ~30 useState per-field para datos personales, domicilio, contacto
  emergencia, puesto/depto, compensación con SDI auto-calculado, hasta
  N beneficiarios dinámicos.
- File uploads con storage Supabase (foto, INE, CURP, acta, domicilio,
  CSF, IMSS) — varios obligatorios, condicional por "primer empleo".
- Inserción multi-tabla en secuencia con rollback best-effort.

El v1 de `forms-pattern` (ADR-016) cubre forms single-step. Forzar este
wizard al `<Form>` de v1 contamina la API porque:

- El submit final no es un único `onSubmit` — es secuencial (4-5 inserts
  - uploads, cualquiera puede fallar y necesitar rollback).
- Cada paso valida antes de avanzar, no solo al final.
- El "dirty confirm" tiene que considerar progreso parcial: cerrar a
  mitad del paso 2 perdiendo beneficiarios + archivos subidos.
- Beneficiarios dinámicos (1..N) usan `useFieldArray` — feature de RHF
  que `<Form>` v1 no expuso explícitamente.

`<FileAttachments>` (ADR-022) tampoco calza directo dentro del wizard:
requiere `entidadId` ya existente porque hace upload+insert inmediato.
En el wizard el `empleadoId` no existe hasta el submit final, así que
los archivos viven en buffer in-memory hasta entonces.

## Outcome esperado

- Componente `<Wizard>` con N pasos navegables (back/next), cada paso
  con su propia lista de `fields` a validar antes de avanzar.
- Submit final atómico-ish: pre-validación de los N pasos antes de
  invocar `onSubmit`; al primer paso con error, navegar y mostrar
  errors inline.
- Soporte para `useFieldArray` nativo de RHF (beneficiarios, contactos
  múltiples, etc.) — sin wrapper custom.
- File uploads diferidos: slot que recolecta `File` por rol en memoria,
  el caller hace upload+insert en su submit pipeline reusando
  `buildAdjuntoPath()` (FA2 ADR-022).
- Migración del único caso real (`empleado-alta-wizard`) como golden.

## Alcance v1 (cerrado 2026-04-29)

- [x] Decidir API: **`<Wizard form={form}>` con `<WizardStep>` declarativo
      en children + hook `useWizard()` interno**. El caller pinta cada
      paso; el wizard solo es state machine + gate de validación.
- [x] Decidir storage del state inter-pasos: **1 `useForm` global con
      schema unificado**, validación parcial via `form.trigger(stepFields)`
      antes de avanzar. `formState.isDirty` global → `useDirtyConfirm`
      out-of-the-box (W6 ↔ ADR-016 F6).
- [x] `useFieldArray` integration: **sin wrapper custom**, RHF nativo.
      Beneficiarios = ejemplo canónico documentado en ADR.
- [x] Submit pipeline: **`onSubmit(values)` callback en el caller**, igual
      que `<Form>` v1. El wizard pre-valida los N pasos via
      `form.trigger()` global; al primer paso con error, navega y
      `setShowErrors(true)`. **El caller dueño de mutations + rollback.**
- [x] File uploads: **`<WizardFileSlot>` standalone** que recolecta
      `File` por rol en memoria. UI alineada visualmente a
      `<FileAttachments>` (ícono + label + size + remove). El caller hace
      upload+insert en el submit pipeline usando `buildAdjuntoPath()`.
- [x] Stepper UI: `<WizardStepper>` con number + label + estado
      (active/complete/incomplete + count de errores por paso).
- [x] Footer: `<WizardActions>` Atrás/Siguiente/Submit. Auto-detect del
      último paso → submit, step 1 → Atrás disabled, submitting → todos
      disabled + spinner.
- [x] Container: `<DetailDrawer size="xl">` (ADR-018) — el wizard se
      renderea inside.
- [x] Migrar `empleado-alta-wizard` como golden path.

## Fuera de alcance v1

- **Wizards con branching condicional** ("si seleccionas X, sigue al
  paso Y; si no, salta al paso Z"). Patrón lineal solo; branching se
  evalúa cuando aparezca un caso real.
- **Persistencia de progreso** (draft entre sesiones). Postergable.
- **Validación cruzada inter-paso** beyond zod refines locales. Si surge
  necesidad, schema unificado al final.
- **Modo "deferred" en `<FileAttachments>`**. Si surge un segundo wizard
  con uploads, evaluamos si extraer un modo `<FileAttachments mode="deferred">`
  o mantener `<WizardFileSlot>` standalone.
- **Tests unitarios del wrapper** (mismo razonamiento que `forms-pattern`:
  e2e cubre el comportamiento end-to-end; jsdom no instalado).

## Bloqueos

Ninguno. `file-attachments` cerrada (2026-04-30) — `<WizardFileSlot>`
reusa `buildAdjuntoPath()` y los roles canónicos. `forms-pattern`
cerrada (2026-04-29) — `<Wizard>` envuelve `useZodForm` + `<Form>`
internamente. `drawer-anatomy` cerrada (2026-04-30) — container es
`<DetailDrawer size="xl">`.

## Sprints / hitos

### Sprint 1 — Foundation + ADR-025 + golden migration `empleado-alta-wizard`

Single PR contundente:

1. `components/wizard/`:
   - `wizard.tsx` — orquestador `<Wizard>` + hook `useWizard()` (context).
   - `wizard-step.tsx` — `<WizardStep id fields>` declarativo.
   - `wizard-stepper.tsx` — UI de pasos con estado.
   - `wizard-actions.tsx` — footer Atrás/Siguiente/Submit.
   - `wizard-file-slot.tsx` — slot para `File` deferred uploads.
   - `index.ts`.
2. `docs/adr/025_wizard_pattern.md` con reglas W1-W7.
3. Migración golden: `components/rh/empleado-alta-wizard.tsx` reescrito
   sobre la nueva foundation. Reduce ~1329 → ~700 líneas estimadas
   (zero `useState` per-field; `<WizardStep>` por paso).

### Sprint 2 — Closeout

PR pequeño de cierre:

- Mover `wizard-pattern` a `## Done` en `INITIATIVES.md`.
- Bitácora final + outcome en este planning doc.
- Barrido de Reminders en lista `Claude: BSOP` si quedan sub-tareas.

## Decisiones registradas

### 2026-04-29 · Spin-out de forms-pattern Sprint 6

`forms-pattern` v1 cubre single-step. `empleado-alta-wizard` (único caso
real) requiere API materialmente distinta y arrastra `file-attachments`.
Se separa para no contaminar el API simple de v1.

### 2026-04-29 · API declarativa con `<WizardStep>` en children + 1 form global

Tres alternativas evaluadas:

1. `<Wizard steps={[{id, fields, render}, ...]} />` con array de configs.
2. `<WizardStep id fields>...</WizardStep>` declarativo en children + hook.
3. Hook `useWizard()` con render manual de pasos.

Elegida #2 porque:

- Paralelo a `<FormSection>` v1 (ADR-016 F4) — el caller pinta cada paso
  inline, sin re-armar render functions.
- El context interno centraliza state machine; el caller solo declara
  estructura.
- Pasar context (e.g. `persona.primer_empleo` afecta qué archivos son
  obligatorios en step 3) es trivial — el caller tiene closure sobre
  todo el state del form.

State storage: **1 `useForm` global**. Razón: SDI auto-calc cruza pasos
(compensación afecta cálculos derivados); `formState.isDirty` global =
`useDirtyConfirm` cero-config; `form.trigger(fieldNames)` valida parcial
sin sync manual entre N forms.

### 2026-04-29 · Submit pipeline en el caller, no en el wizard

`<Wizard>` no orquesta mutations. El callback `onSubmit(values)` recibe
los values typed después de validar los N pasos. El caller implementa
la secuencia de inserts + storage + rollback (igual que hoy).

Razón: rollback es altamente domain-specific. Inventar API genérica
de "transactional submit" es accidental complexity y arrastra el
wrapper a conocer cosas que no debe (Supabase, schemas, storage).

### 2026-04-29 · `<WizardFileSlot>` standalone vs refactor `<FileAttachments>`

`<FileAttachments>` requiere `entidadId` pre-existente (upload+insert
inmediato). En un wizard, ese id no existe hasta el submit final.

Dos alternativas:

A. Slot standalone `<WizardFileSlot>` que recolecta `File` por rol en
memoria; el caller hace upload+insert en submit pipeline.
B. Extender `<FileAttachments>` con `mode="deferred"` que devuelve
`File[]` por rol al caller en lugar de uploadear inmediato.

Elegida A en v1: extracción mínima, no toca `<FileAttachments>`. Si
surge un segundo wizard con uploads, evaluamos B (refactor con
beneficio cross-iniciativa).

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

### 2026-04-29 · Promoción a `planned` y arranque de Sprint 1

Beto autorizó el alcance v1 cerrado arriba y los 2 sprints. Arranca
Sprint 1 con foundation `components/wizard/` + ADR-025 + golden
migration `empleado-alta-wizard` en un solo PR.

### 2026-04-29 · Sprint 1 mergeado — PR #342

Foundation + ADR + golden migration en un solo PR contundente.

- **Foundation `components/wizard/`** (6 piezas):
  - `wizard.tsx` — `<Wizard>` orquestador con `useMemo` sobre
    `React.Children` para extraer steps; nav helpers via context.
  - `wizard-step.tsx` — marker component que retorna `null`; `<Wizard>`
    pulls `props.children` y los renderea inline cuando active.
  - `wizard-stepper.tsx` — UI de pasos con `role="list"` + `role="listitem"`
    - `aria-current="step"`; conteo de errores por paso visitado.
  - `wizard-actions.tsx` — Atrás/Siguiente/Submit con auto-detect del
    estado del wizard (isFirstStep, isLastStep, submitting).
  - `wizard-file-slot.tsx` — slot deferred que recolecta `File` en
    memoria; UI alineada visualmente a `<FileAttachments>` (40px tile
    - label + filename/size + Subir/Quitar); flag `exempt` para roles
      condicional-`primer_empleo`.
  - `wizard-context.tsx` — context interno + `useWizard()` hook público.

- **ADR-025** con 7 reglas W1-W7 codificadas. Las decisiones
  registradas en este planning doc se cristalizaron como reglas
  citables desde futuros PRs.

- **Golden migration** `components/rh/empleado-alta-wizard.tsx`:
  - Schema zod unificado con `superRefine` para validaciones cruzadas
    (NSS exento si `primer_empleo`; periodo de prueba requerido solo
    si tipo_contrato es `prueba`/`capacitacion_inicial`; mínimo 1
    beneficiario Art. 501 LFT).
  - Cero `useState` per-field (~30 → 0).
  - Beneficiarios via `useFieldArray` nativo de RHF (W2 evidence).
  - Archivos via `<WizardFileSlot>` con `exempt` flag (W5 evidence).
  - SDI auto-calc cruza pasos vía `form.watch('sueldo_mensual')` +
    `setValue` (W1 evidence).
  - `useDirtyConfirm` con `formState.isDirty || filesDirty` (sumamos
    files al flag dirty porque viven fuera del schema, W6 evidence).
  - Submit pipeline preserva el rollback multi-tabla original; reusa
    `buildAdjuntoPath()` cuando `empresaSlug` está disponible.
  - Caller único `components/rh/personal-module.tsx` actualizado para
    pasar `empresaSlug` typed (`'rdb' | 'dilesa' | 'ansa' | 'coagan'`).

- **Verificación**: typecheck + lint (0 errors) + 401 tests + format
  todos verdes en local; CI verde en `Lint / Typecheck / Unit tests`
  - `Vercel` deployment + `Vercel Preview Comments`.

### 2026-04-29 · Sprint 2 — Closeout

PR de cierre. Mueve `wizard-pattern` a `## Done` en `INITIATIVES.md`,
actualiza el roadmap UI numerado para marcar la iniciativa cerrada, y
agrega esta entrada de bitácora.

Reminders en lista `Claude: BSOP`: `remindctl list "Claude: BSOP"
--json` no devolvió ningún pendiente vivo asociado a sub-tareas de
`wizard-pattern` (la iniciativa se ejecutó en una sola sesión sin
fragmentar TodoWrite a Reminders persistentes). No hay barrido que
hacer.

## Outcome

Pattern de wizards multi-step canónico para BSOP. 1 caso real
migrado (alta de empleado RDB+DILESA, vía `<EmpleadoAltaWizard>`
shared), 7 reglas W1-W7 documentadas en ADR-025. Cuando aparezca el
segundo wizard (probable: alta proveedor con CSF multi-step, alta
socio, alta caso administrativo), la API ya está fija y el segundo
caller cuesta ~5-10 líneas de boilerplate (schema + steps array +
caller-driven submit pipeline).

`empleado-alta-wizard.tsx` queda como golden de referencia para el
siguiente caller — incluye los patrones difíciles (validación
cruzada via `superRefine`, archivos exentos condicional, SDI cruzando
pasos, rollback multi-tabla con storage cleanup).
