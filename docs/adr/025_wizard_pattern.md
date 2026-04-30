# ADR-025 — `<Wizard>` multi-step pattern

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `wizard-pattern`)
- **Related**: [ADR-016](./016_forms_pattern.md), [ADR-018](./018_drawer_anatomy.md), [ADR-022](./022_file_attachments.md), [ADR-008](./008_action_feedback.md)

---

## Contexto

`forms-pattern` (ADR-016) cubre forms single-step. El único wizard en el
repo (`components/rh/empleado-alta-wizard.tsx`, alta de empleado, 3 pasos,
1329 líneas) requiere API materialmente distinta:

- Validación parcial **por paso** antes de avanzar — `<Form>` v1 valida
  todo al submit.
- Beneficiarios dinámicos (1..N) — `useFieldArray` de RHF, no expuesto
  en `<Form>` v1.
- Submit secuencial multi-tabla con rollback best-effort (4-5 inserts +
  N storage uploads). El `onSubmit` único de `<Form>` v1 no encaja con
  pipelines transaccionales.
- File uploads en el último paso. `<FileAttachments>` (ADR-022) hace
  upload+insert inmediato y requiere `entidadId` ya existente — el
  empleado no existe hasta el submit final.
- "Dirty confirm" debe considerar progreso parcial: cerrar a mitad del
  paso 2 perdería los archivos del paso 3 en buffer + beneficiarios
  dinámicos del paso 3.

Forzar este caso al `<Form>` v1 contamina la API simple. Por eso se
spineó como `wizard-pattern` aparte.

A 1 caso real hoy y otros wizards previsibles (alta proveedor con CSF
multi-step, alta socio, alta caso administrativo), el costo de fijar el
pattern temprano es bajo y reduce churn cuando aparezca el segundo.

## Decisión

Pattern de wizards multi-step sobre `react-hook-form` + `zod` con un
wrapper minimal en `components/wizard/`. API declarativa con `<WizardStep>`
en children + hook `useWizard()` para nav helpers.

```tsx
import { z } from 'zod';
import { useZodForm, FormField, FormSection, FormRow } from '@/components/forms';
import {
  Wizard,
  WizardStep,
  WizardStepper,
  WizardActions,
  WizardFileSlot,
} from '@/components/wizard';
import { DetailDrawer } from '@/components/detail-page';
import { Input } from '@/components/ui/input';

const Schema = z.object({
  // step 1
  nombre: z.string().trim().min(1, 'Requerido'),
  rfc: z.string().trim().min(1, 'Requerido'),
  // step 2
  departamento_id: z.string().uuid(),
  // step 3
  primer_empleo: z.boolean(),
});

const STEP1: ReadonlyArray<keyof z.infer<typeof Schema>> = ['nombre', 'rfc'];
const STEP2 = ['departamento_id'] as const;
const STEP3 = ['primer_empleo'] as const;

function NewEmployeeWizard({ open, onOpenChange, ...rest }) {
  const form = useZodForm({ schema: Schema, defaultValues: { ... } });
  const [files, setFiles] = React.useState<Record<string, File | null>>({});

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo empleado"
      size="xl"
    >
      <DetailDrawerContent>
        <Wizard
          form={form}
          onSubmit={async (values) => {
            // Caller-driven mutation pipeline (see W4)
            await runEmployeeAltaPipeline(values, files);
            onOpenChange(false);
          }}
        >
          <WizardStepper />

          <WizardStep id="identidad" label="Identidad" fields={STEP1}>
            <FormSection title="Datos personales">
              <FormRow cols={3}>
                <FormField name="nombre" label="Nombre" required>
                  {(field) => <Input {...field} id={field.id} />}
                </FormField>
                <FormField name="rfc" label="RFC" required>
                  {(field) => <Input {...field} id={field.id} />}
                </FormField>
              </FormRow>
            </FormSection>
          </WizardStep>

          <WizardStep id="puesto" label="Puesto" fields={STEP2}>
            ...
          </WizardStep>

          <WizardStep id="expediente" label="Expediente" fields={STEP3}>
            <WizardFileSlot
              role="ine"
              label="INE"
              required
              file={files.ine ?? null}
              onChange={(f) => setFiles((m) => ({ ...m, ine: f }))}
            />
            ...
          </WizardStep>

          <WizardActions submitLabel="Crear empleado" submittingLabel="Creando..." />
        </Wizard>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
```

### Las 7 reglas (W1–W7)

#### W1 — `<Wizard form>` recibe **un solo** `useForm` con schema unificado

Schema zod único cubre todos los pasos. Cada `<WizardStep>` declara qué
fields valida vía `fields={[...]}`.

```tsx
const form = useZodForm({ schema: UnifiedSchema, defaultValues });

<Wizard form={form} onSubmit={...}>
  <WizardStep id="a" fields={['campo_de_paso_a']}>...</WizardStep>
  <WizardStep id="b" fields={['campo_de_paso_b']}>...</WizardStep>
</Wizard>;
```

> **Por qué**: state cruzado entre pasos (e.g. SDI auto-calc desde el
> sueldo del paso 2 que afecta cálculos derivados, "primer empleo" del
> paso 1 que exenta archivos del paso 3) es el caso real, no el
> excepcional. Un solo form = `formState.isDirty` global +
> `useDirtyConfirm` cero-config + un solo `defaultValues` literal con
> typing inferido. N forms independientes obliga a sync manual y rompe
> dirty tracking unificado.

#### W2 — `<WizardStep>` es declarativo en children, no array de configs

```tsx
<Wizard form={form} onSubmit={...}>
  <WizardStep id="..." label="..." fields={[...]}>
    <FormSection>...</FormSection>
  </WizardStep>
  <WizardStep id="..." label="..." fields={[...]}>
    ...
  </WizardStep>
</Wizard>
```

`<Wizard>` escanea `children` con `React.Children`, extrae `{id, label, fields}`
de cada `<WizardStep>`, y solo renderea el cuerpo del paso activo. Pasos
inactivos no se montan (zero render cost off-screen). El orden visual =
orden de declaración.

> **Por qué**: paralelo a `<FormSection>` v1 (ADR-016 F4) — el caller
> pinta cada paso inline con todo el contexto del closure (helpers
> derivados, watch values, conditional fields). Array de configs `steps={[{render: ...}]}`
> obliga a re-armar render functions y dificulta passing context.
> `<WizardStep>` en sí es un marker component que retorna `null`; el
> wizard pulls `props` y renderea su body.

#### W3 — Validación parcial por paso vía `form.trigger(stepFields)`

"Siguiente" valida solo los `fields` del paso actual:

```tsx
const ok = await form.trigger(currentStep.fields);
if (!ok) {
  setShowErrors(true); // step body reads via useWizard()
  return;
}
goForward();
```

Si `fields` está vacío `[]`, el paso pasa sin validación (útil para
pasos read-only o de revisión). Errores aparecen inline en `<FormField>`
(ADR-016 F2) — el wizard no usa toast/alert para validation.

> **Por qué**: validación end-to-end al submit lleva al user a leer 30
> errores juntos en el primer paso. Validación por paso captura el
> error donde está y lo corrige antes de seguir. `form.trigger()` con
> array de fields es el primitive nativo de RHF — sin reinventar.

#### W4 — Submit pipeline en el caller, **no** en el wizard

`onSubmit(values)` es callback async-friendly: recibe los values typed
después de validar todos los pasos. **El caller implementa la secuencia
de mutations + uploads + rollback.**

```tsx
<Wizard
  form={form}
  onSubmit={async (values) => {
    // Caller owns the entire pipeline:
    const personaId = await insertPersona(values);
    try {
      const empleadoId = await insertEmpleado(personaId, values);
      await insertCompensacion(empleadoId, values);
      await insertBeneficiarios(empleadoId, values.beneficiarios);
      for (const [rol, file] of fileEntries(files)) {
        await uploadAndAttach(empleadoId, rol, file);
      }
    } catch (err) {
      await rollback({ personaId /* ... */ });
      throw err;
    }
  }}
>
```

Antes de invocar `onSubmit`, el wizard hace `form.trigger()` global. Si
hay errores en cualquier paso, navega al **primer paso con error** y
flippea `showErrors=true`.

> **Por qué**: rollback es altamente domain-specific (qué tablas, en
> qué orden, qué storage paths, qué error es transient vs fatal).
> Inventar API genérica de "transactional submit" es accidental
> complexity y arrastra el wrapper a conocer Supabase, schemas, y
> storage. Mantener `<Wizard>` como state machine + validation gate;
> el caller dueño del submit. Mismo razonamiento que `<Form>` v1
> (ADR-016 F7).

#### W5 — `<WizardFileSlot>` para file uploads diferidos; **no** `<FileAttachments>`

`<FileAttachments>` (ADR-022) requiere `entidadId` pre-existente porque
hace upload+insert inmediato. En un wizard, el id no existe hasta el
submit final.

`<WizardFileSlot>` recolecta `File` por rol en memoria del caller:

```tsx
const [files, setFiles] = React.useState<Record<string, File | null>>({});

<WizardFileSlot
  role="ine"
  label="INE"
  required
  file={files.ine ?? null}
  onChange={(f) => setFiles((m) => ({ ...m, ine: f }))}
/>;
```

UI alineada visualmente a `<FileAttachments>` (40px tile + label +
filename/size + Subir/Quitar). Roles, paths y mime types siguen
**ADR-022 FA2** — el caller usa `buildAdjuntoPath()` en el submit
pipeline para construir el path canónico antes del upload.

`exempt` + `exemptHint` cubren slots condicionales (e.g. "primer empleo"
exenta NSS/IMSS): el slot rendea muted y sin botón Subir cuando
`exempt=true && file == null`.

> **Por qué**: extracción mínima sin tocar `<FileAttachments>`. Si surge
> un segundo wizard con uploads, evaluamos si extraer un modo
> `<FileAttachments mode="deferred">` (refactor con beneficio
> cross-iniciativa) o si `<WizardFileSlot>` standalone es suficiente.
> Hoy con 1 wizard real, el slot standalone es la mínima superficie.

#### W6 — `useDirtyConfirm` integra cross-paso (1 form global = 1 dirty flag)

Como todos los pasos comparten un solo `useForm`, `formState.isDirty` es
global. `useDirtyConfirm` (ADR-016 F6) funciona out-of-the-box para
gatear el cierre del `<DetailDrawer>`:

```tsx
const { requestClose, confirmDialog } = useDirtyConfirm({
  isDirty: form.formState.isDirty,
  onConfirmClose: () => onOpenChange(false),
});

<DetailDrawer
  open={open}
  onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}
  ...
>
  {confirmDialog}
  <DetailDrawerContent>
    <Wizard form={form} onSubmit={...}>...</Wizard>
  </DetailDrawerContent>
</DetailDrawer>
```

> **Por qué**: el pain point real es cerrar el drawer accidentalmente a
> mitad del paso 3 con 5 minutos de captura + archivos en buffer.
> Reusar el hook de forms-pattern evita drift visual + a11y. Como el
> form es uno solo, el flag dirty cubre todos los pasos sin sync manual.

#### W7 — `<DetailDrawer size="xl">` es el container canónico

Wizards viven dentro de un `<DetailDrawer>` (ADR-018) en lugar de
inventar otro shell. `size="xl"` da `sm:max-w-[1000px]` — espacio para
forms con 3 columnas en desktop sin saturar mobile.

Layout:

```tsx
<DetailDrawer
  open={open}
  onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}
  title="Nuevo empleado"
  description="Alta completa en 3 pasos"
  size="xl"
  footer={<WizardActions submitLabel="Crear" submittingLabel="Creando..." />}
>
  {confirmDialog}
  <DetailDrawerContent>
    <Wizard form={form} onSubmit={...}>
      <WizardStepper />
      <WizardStep id="..." fields={[...]}>...</WizardStep>
      ...
    </Wizard>
  </DetailDrawerContent>
</DetailDrawer>
```

Notas:

- `<WizardActions>` puede ir en la prop `footer` del drawer (sticky por
  ADR-018 DD3) o como child final del `<Wizard>`. El primer approach
  mantiene el footer pegado al fondo en pasos largos; el segundo es
  más simple pero scrollea con el body. Default recomendado: footer
  prop del drawer.
- `<WizardStepper>` va dentro del `<Wizard>`, justo después del open.

> **Por qué**: reusar el container ya canonical (ADR-018) en lugar de
> inventar `<WizardShell>`. Print stylesheet, scroll constructive,
> header sticky 4-slot, todo eso ya está resuelto por `<DetailDrawer>`.

### A11y mínimo

- `<form noValidate>` — desactiva validación nativa del browser, zod es
  el único validador.
- `<WizardStepper>` usa `role="list"` + `role="listitem"` y los botones
  de step llevan `aria-current="step"` cuando son el activo.
- Botones de acción usan iconos con `aria-hidden="true"` y label
  textual ("Atrás", "Siguiente", "Crear").
- `<WizardFileSlot>` enlaza `<input type="file">` con `<label htmlFor>`;
  el botón Quitar tiene `aria-label="Quitar archivo de {role}"`.
- Errores siguen ADR-016 F2 — inline en `<FormField>`, nunca toast.

## Implementación

- **Sprint 1** (este PR): foundation completa — `components/wizard/`
  (`wizard.tsx`, `wizard-step.tsx`, `wizard-stepper.tsx`,
  `wizard-actions.tsx`, `wizard-file-slot.tsx`, `wizard-context.tsx`,
  `index.ts`) + ADR-025 + golden migration `empleado-alta-wizard`.
- **Sprint 2**: closeout — INITIATIVES `* → done`, planning bitácora,
  barrido Reminders.

## Consecuencias

### Positivas

- **Zero `useState` per-field** en el wizard migrado (~30 → 0 en
  `empleado-alta-wizard`). Schema zod = única fuente.
- **Validación typed por paso**: array de `fields` se chequea contra
  `FieldPath<TFieldValues>` en compile-time.
- **`<WizardStepper>`/`<WizardActions>` standalone**: pueden ir donde el
  caller quiera dentro del wizard. Default es renderearlos juntos al
  top y al footer; pero un wizard custom puede partirlos.
- **Cero churn en `<FileAttachments>`**: la iniciativa hermana queda
  intacta. El slot deferred es 100 líneas standalone.
- **`useFieldArray` natively**: beneficiarios dinámicos resueltos con
  el primitive de RHF, sin wrapper. Documentado en este ADR como
  patrón canónico.
- **Reusa `<DetailDrawer>`**: print stylesheet, sticky footer,
  responsive sizing — todo heredado.

### Negativas

- **Una opinión nueva**: caller debe declarar `fields={[...]}` por paso
  manualmente. Si olvida campos, el paso se "salta" sin validar y los
  errores aparecen al final via `form.trigger()` global. Mitigación: el
  primer paso con error recibe nav focus al submit, así el bug no es
  silencioso aunque sí menos eficiente que validation por paso correcta.
- **Caller dueño del submit pipeline**: `<Wizard>` no provee helpers
  para "insert + rollback secuencial". Es la decisión correcta (W4) pero
  significa que cada caller arma su propio pipeline. Helpers compartidos
  pueden vivir en `lib/<dominio>/` cuando aparezca el segundo caso.
- **`<WizardFileSlot>` no upload-aware**: no muestra progress, no hace
  client-side resize, no dedupe. Si la lista de archivos crece a 20+,
  evaluar `<FileAttachments mode="deferred">` (postergado a v2).

### Cosas que NO cambian

- **ADR-016** (`<Form>` + zod + RHF) — sigue siendo el pattern para
  forms single-step. `<Wizard>` lo reusa internamente (FormProvider +
  useForm) pero no lo deprecate.
- **ADR-018** (`<DetailDrawer>`) — wizards viven inside, sin tocar el
  drawer.
- **ADR-022** (`<FileAttachments>`) — sigue siendo el pattern para
  archivos sobre entidades existentes. `<WizardFileSlot>` cubre el
  caso deferred (entidad aún no existe).
- **ADR-008** (action feedback) — toast/banner/`<ConfirmDialog>` siguen
  siendo el pattern post-mutation. Validación pre-submit es inline en
  `<FormField>`.

## Fuera de alcance v1

- **Branching condicional** ("si seleccionas X, sigue al paso Y; si no,
  Z"). Patrón lineal solo. Si surge caso real, evaluamos `nextStep`
  callback en `<WizardStep>`.
- **Persistencia de drafts** entre sesiones. Si surge necesidad,
  ortogonal vía hook `useWizardAutoSave(form, key)`.
- **Validación cruzada inter-paso** beyond zod refines locales. Si
  surge, schema unificado al final + `form.trigger(['stepBField1', 'stepAField2'])`.
- **Modo `deferred` en `<FileAttachments>`**. Postergado hasta segundo
  wizard con uploads.
- **Tests unitarios del wrapper**. Mismo razonamiento que ADR-016: e2e
  cubre el comportamiento end-to-end; jsdom no instalado.

## Referencias

- Componentes: [components/wizard/](../../components/wizard/)
- Iniciativa: [docs/planning/wizard-pattern.md](../planning/wizard-pattern.md)
- ADR-016 — `<Form>` + RHF + zod (single-step base).
- ADR-018 — `<DetailDrawer>` (container).
- ADR-022 — `<FileAttachments>` (entidad existente; `<WizardFileSlot>`
  cubre el caso deferred).
- ADR-008 — action feedback (toast/banner/confirm).
