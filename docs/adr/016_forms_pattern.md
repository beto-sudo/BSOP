# ADR-016 — `<Form>` + `react-hook-form` + `zod`

- **Status**: Accepted
- **Date**: 2026-04-28
- **Authors**: Beto, Claude Code (iniciativa `forms-pattern`)
- **Related**: [ADR-006](./006_module_states.md), [ADR-008](./008_action_feedback.md), [ADR-009](./009_detail_page.md), [ADR-010](./010_data_table.md), [ADR-011](./011_shared_modules_cross_empresa.md)

---

## Contexto

Cada formulario del repo arma validación, layout, manejo de errores y estados (`dirty` / `submitting` / `disabled`) de cero. Auditoría rápida del antes:

- `components/tasks/tasks-create-form.tsx` (simple + rich) — `useState` per-field, validación inline `if (!field.trim())`.
- `components/tasks/tasks-edit-form.tsx` — misma forma.
- `components/documentos/documento-form-fields.tsx` + `documento-create-sheet.tsx` — props controlados + validación manual.
- `components/rh/empleado-alta-wizard.tsx` — multi-step manual con `useState` por paso.
- Forms inline en pages de DILESA `[id]` (proyectos, prototipos, etc.).
- Form de captura de cortes (abrir/cerrar caja).

Síntomas observables:

- **Validación inconsistente**: a veces zod, a veces `if (!field)`, a veces solo en submit. Mensaje de error varía (toast vs span vs `alert()` — ADR-008 T2 ya prohíbe `alert()` pero hay holdouts).
- **Layout drift**: 1 columna vs 2 columnas vs grid sin regla; spacing dispar.
- **Submit state ad-hoc**: `creating` / `saving` / `submitting` cada uno con su propio `useState`. Copy del botón ("Guardando...", "Creando...", "Guardar tarea") inconsistente.
- **Dirty tracking ausente**: cerrar el sheet con cambios sin guardar pierde datos sin advertir. ~12 lugares afectados según audit rápido.
- **A11y desigual**: algunos forms tienen `htmlFor` + `aria-invalid`, otros no.

ADR-006 ya fijó estados (empty/loading/error). ADR-008 fijó action feedback (toast vs banner vs confirm). ADR-009 fijó detail pages. ADR-010 fijó tablas. Forms es la última pieza visual sin convención.

A 25+ forms en el repo y `proveedores-csf-ai` Sprint 1 ya `planned` (trae form nuevo de captura), el costo de seguir reinventando crece linealmente. Es el momento de cerrarlo.

## Decisión

Pattern de formularios sobre `react-hook-form` + `zod` con un wrapper minimal en `components/forms/`. API declarativa con render-props para cada input.

```tsx
import { z } from 'zod';
import { Form, FormField, FormRow, FormActions, useZodForm } from '@/components/forms';
import { Input } from '@/components/ui/input';

const Schema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(255),
  fecha_vence: z.string().default(''),
});

function CreateTaskDialog({ onCreate, onClose }) {
  const form = useZodForm({
    schema: Schema,
    defaultValues: { titulo: '', fecha_vence: '' },
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        await onCreate(values);
      }}
    >
      <FormField name="titulo" label="Título" required>
        {(field) => (
          <Input
            {...field}
            id={field.id}
            aria-invalid={field.invalid || undefined}
            aria-describedby={field.describedBy}
          />
        )}
      </FormField>

      <FormRow cols={2}>
        <FormField name="fecha_vence" label="Fecha límite">
          {(field) => <Input {...field} id={field.id} type="date" />}
        </FormField>
      </FormRow>

      <FormActions submitLabel="Crear tarea" submittingLabel="Creando..." onCancel={onClose} />
    </Form>
  );
}
```

### Las 7 reglas (F1–F7)

#### F1 — `react-hook-form` + `zod` como base, `useZodForm` como entry point

`zod` ya está en `dependencies` (^4.3.6); se agrega `react-hook-form` (^7.74.0) + `@hookform/resolvers` (^5.2.2). Schema en zod es la single source of truth para forma + validación + mensaje de error.

`useZodForm` encapsula `useForm({ resolver: zodResolver(schema), ... })` con un cast localizado para puentear el typing entre zod v4 y `@hookform/resolvers` v5. Caller solo escribe schema + defaultValues:

```tsx
const form = useZodForm({ schema, defaultValues, mode: 'onTouched' });
```

Default mode es `'onTouched'`: errors aparecen después de que el field perdió foco, no on-mount ni on-keystroke. Override con `mode` si el form lo amerita.

> **Por qué**: `react-hook-form` es la opción de facto en React (>5M weekly), uncontrolled-by-default (zero re-renders entre keystrokes), integra trivial con shadcn/base-ui inputs vía `Controller`. zod como schema layer da typing automático (`z.infer`) + runtime validation con mensajes en español, sin duplicar shapes.

#### F2 — Errores se renderizan **debajo del input**, nunca en toast/alert/banner

Validación de campo es feedback **localizado**: el usuario debe ver el error pegado al input que lo causó. `<FormField>` rendea `<p role="alert" class="text-destructive">` debajo del control cuando hay `fieldState.error`.

Toast/banner/`alert()` están reservados para feedback **post-mutation** (ADR-008 T2). Validación pre-submit nunca usa toast. `<FormField>` no provee API para hacerlo.

> **Por qué**: el toast desaparece a los ~5s, el `alert()` rompe flujo, el banner top-of-form aleja el error del input. Inline error es lo que el usuario espera y lo que enfoca correctamente con screen readers (`role="alert"` en el span de error).

#### F3 — `<FormField>` cablea label + control + error + a11y por construcción

API render-prop:

```tsx
<FormField name="titulo" label="Título" required description="Texto de ayuda opcional">
  {(field) => (
    <Input
      {...field}
      id={field.id}
      aria-invalid={field.invalid}
      aria-describedby={field.describedBy}
    />
  )}
</FormField>
```

Internamente envuelve `<Controller>` de RHF y provee:

- **`field.id`** — string estable (`f-{useId}-{name}`). Bind al input + a `<FieldLabel htmlFor>`.
- **`field.invalid`** — `boolean`, derivado de `fieldState.error`. Bind a `aria-invalid`.
- **`field.describedBy`** — string opcional. Apunta al span de error (cuando inválido) y al span de `description` (cuando existe). Bind a `aria-describedby`.
- `field.value`, `field.onChange`, `field.onBlur`, `field.name`, `field.ref` — passthrough estándar de RHF.

`<FieldLabel>` (de `components/ui/`) pone el `*` cuando `required`, con `<span class="sr-only"> (obligatorio)</span>` para screen readers (ya existía).

> **Por qué**: si cada caller arma la a11y a mano, drift es inevitable. Un solo wrapper que enchufa todo correctamente convierte la a11y mínima en default. Render-prop (vs HOC vs slot) se eligió porque deja al caller usar el primitive de input que necesite (Input, Combobox, Textarea, custom) sin que `<FormField>` los conozca.

#### F4 — Layout via `<FormSection>` (heading + body) y `<FormRow>` (grid responsive)

```tsx
<FormSection title="Datos generales" description="Campos requeridos para alta">
  <FormField name="titulo" label="Título" required>
    ...
  </FormField>
  <FormRow cols={2}>
    <FormField name="estado" label="Estado">
      ...
    </FormField>
    <FormField name="prioridad" label="Prioridad">
      ...
    </FormField>
  </FormRow>
</FormSection>
```

- `<FormSection>` aporta título + descripción + opcionalmente un `divider` superior. Default spacing: `space-y-4`.
- `<FormRow cols={1|2|3|4}>` es **mobile-first**: siempre 1 columna en mobile, opt-in a N columnas desde `sm:` up. Para campos full-width (textarea largo, comentarios), no envolver en `<FormRow>` — `<FormField>` directo en el padre.

> **Por qué**: convención visual fija (heading + grid de 1/2 cols mobile-first) elimina el drift de "este form usa 3 cols sin razón, este otro 1 col". Mobile-first respeta la regla de uso real (formularios largos llenados desde celular en obra/cancha/oficina).

#### F5 — `<FormActions>` estandariza copy + estado de submit

```tsx
<FormActions
  cancelLabel="Cancelar"
  submitLabel="Guardar"
  submittingLabel="Guardando..."
  onCancel={onClose}
  stretch={true} // para sheets/drawers
/>
```

Auto-detecta `formState.isSubmitting` desde el contexto: muestra `<Loader2>` spinner, deshabilita ambos botones, swap del label al `submittingLabel`.

Convención de copy:

- Default: `"Cancelar"` / `"Guardar"` / `"Guardando..."`.
- Override solo cuando el verbo es materialmente distinto: `"Crear tarea"` / `"Aprobar"` / `"Enviar a revisión"`. Mantener verbo consistente con la acción real, no genérico.

`submitDisabled` permite forzar disabled más allá de `isSubmitting` (e.g. para preconditions externos al form). Default disabled flow es **siempre permitir submit** y dejar que zod rechace en validación — no preempt-disable basado en `formState.isValid`, porque eso oculta el error feedback hasta que el usuario "adivine" qué falta.

> **Por qué**: el ADR-008 ya cubrió "post-action toast"; `<FormActions>` cubre "pre-action button state". Auto-detect del submit state vía `useFormContext` elimina el `disabled={creating}` ad-hoc en cada sitio. Disabled-on-validity pre-empts el feedback útil de zod ("campo requerido") y se evita por default.

#### F6 — `useDirtyConfirm` integra con `<ConfirmDialog>` (ADR-008) para drawer/sheet close

```tsx
const { requestClose, confirmDialog } = useDirtyConfirm({
  isDirty: form.formState.isDirty,
  onConfirmClose: () => setOpen(false),
});

<Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : requestClose())}>
  {confirmDialog}
  ...
</Sheet>;
```

Si `isDirty=false`, `requestClose()` ejecuta `onConfirmClose` directo. Si `isDirty=true`, abre un `<ConfirmDialog>` con copy "¿Descartar cambios? Tienes cambios sin guardar..." y solo ejecuta `onConfirmClose` cuando el usuario confirma.

Visualmente idéntico a las confirmaciones destructivas (mismo `<ConfirmDialog>` de ADR-008 con `confirmVariant="destructive"`).

> **Por qué**: cerrar accidentalmente un form a medias y perder 5 minutos de captura es uno de los pain points más comunes en formularios largos (alta empleado, alta proveedor). Hook único + `<ConfirmDialog>` reusado evita drift visual y a11y.

#### F7 — Server actions vs client mutations: ambos. `<Form>` no asume

`onSubmit` es callback async-friendly: recibe los values typed y devuelve `void | Promise<void>`. El caller decide:

```tsx
// Client-side fetch (la mayoría del repo hoy)
<Form form={form} onSubmit={async (values) => {
  await supabase.from('tasks').insert({...values});
}}>

// Server action (cuando el repo migre)
<Form form={form} onSubmit={async (values) => {
  await createTaskAction(values);
}}>
```

`<Form>` solo se encarga de: validar via zod, gestionar `isSubmitting`, opcionalmente `reset()` post-success (`resetOnSuccess` prop), aplicar `space-y-5`. No se mete con cómo se persisten los datos.

> **Por qué**: el repo hoy es 95% client-side fetch a Supabase; la migración a server actions (Next.js 16 App Router) está fuera del alcance de forms-pattern. Mantener `<Form>` agnostic permite que la migración futura sea un cambio interno del callback, no del wrapper.

### A11y mínimo

- `<form noValidate>` — desactiva validación nativa del browser, zod es el único validador.
- `<FieldLabel htmlFor={field.id}>` — asociación label/input siempre presente.
- `aria-invalid={field.invalid || undefined}` — `undefined` cuando no hay error (no `false`, evita ruido para AT).
- `aria-describedby={field.describedBy}` — concat de error id + description id.
- `<p role="alert">` en el span de error — screen reader anuncia el error cuando aparece.
- Spinner del submit usa `aria-hidden="true"`; el cambio de label `Guardar` → `Guardando...` es la indicación textual.

## Implementación

- **Sprint 1** (este PR): foundation completo — `components/forms/{form,form-field,form-section,form-row,form-actions}.tsx` + `use-dirty-confirm.tsx` + `index.ts` + ADR-016 + golden path migrating `tasks-create-form` simple variant.
- **Sprint 2**: `tasks-create-form rich` + `tasks-edit-form` + `tasks-updates`.
- **Sprint 3**: `documentos/documento-form-fields` + `documento-create-sheet`.
- **Sprint 4**: forms inline en DILESA `[id]` (proyectos / prototipos / anteproyectos).
- **Sprint 5**: form de captura de cortes.
- **Sprint 6**: evaluación de `empleado-alta-wizard` — si encaja sin churn, in. Si requiere API distinta (multi-step state, atomic submit-or-fail-all), sale aparte como `wizard-pattern` (no parte de v1).
- **Sprint 7**: cierre — INITIATIVES update + planning doc + Done.

## Consecuencias

### Positivas

- **Zero `useState` per-field en forms migrados**. Schema zod es la única fuente de la forma.
- **Validación typed**: errores en `z.infer<typeof schema>` se chequean en TS al construir `defaultValues`.
- **Code review tiene checks binarios**: ¿usa `<Form>` + `useZodForm`? ¿errors van en `<FormField>` no en toast?
- **A11y mínima por construcción**: `<FormField>` ya cablea label/aria-invalid/describedby. Imposible olvidarlo.
- **Dirty confirm reusable**: `useDirtyConfirm` cubre todos los drawer/sheet de creación con 3 líneas.
- **`<FormActions>` elimina copy drift**: "Cancelar" / "Guardar" / "Guardando..." canon.

### Negativas

- **Dos dependencias nuevas**: `react-hook-form` (~12kb gzipped) + `@hookform/resolvers` (~2kb gzipped). Bundle impact aceptable dado que el form pattern se usa en >25 sitios.
- **Cast localizado en `useZodForm`**: el typing dance entre zod v4 y `@hookform/resolvers` v5 requiere `as unknown as Resolver<Values>` dentro del helper. Está confinado a un solo lugar bien comentado; cuando los packages alineen sus tipos, se quita.
- **Migrar 25+ forms lleva tiempo** (Sprints 2-6). Mientras tanto, coexisten el pattern viejo y `<Form>` — los forms no migrados siguen funcionando, pero PRs nuevos no se aprueban con el pattern viejo.

### Cosas que NO cambian

- **ADR-006** (`<EmptyState>` etc.) — los estados de listado siguen iguales; forms son drawers/dialogs, no listados.
- **ADR-008** (action feedback) — toast/banner/`<ConfirmDialog>` siguen siendo el pattern para feedback post-mutation. Forms-pattern usa `<ConfirmDialog>` para `useDirtyConfirm` — mismo componente, escenario nuevo.
- **ADR-009** (`<DetailPage>`) — detail pages siguen usando edit-in-place o sheets, no forms full-page. Cuando un detail page tenga un form embebido, usa `<Form>`.
- **ADR-010** (`<DataTable>`) — tablas siguen igual; forms editan filas vía sheets/drawers, no inline en la tabla (excepto popovers documentados).
- **`components/ui/field-label.tsx`** — sigue siendo el primitivo. `<FormField>` lo usa internamente.

## Fuera de alcance v1

- **Multi-step wizards**. `empleado-alta-wizard` es el único caso real hoy y será evaluado en Sprint 6. Si la API resulta materialmente distinta (state per-step, atomic submit), sale como `wizard-pattern` aparte.
- **Form builders dinámicos** (campos definidos en runtime, e.g. forms generados por config). No hay caso real hoy.
- **Auto-save / draft persistence**. Postergable. Si surge un caso, vive como hook `useAutoSave(form, key)` ortogonal.
- **File inputs como parte del form schema**. Se aborda en `file-attachments` (iniciativa hermana). Hasta entonces, file uploads viven fuera del `<Form>` con su propio state.
- **Server actions como API natural**. `<Form>` soporta server actions hoy (callback es async-agnostic), pero la convención de "todos los forms del repo van por server actions" no se enforza en v1.
- **Tests unitarios del wrapper**. El repo no tiene `@testing-library/react` ni `jsdom` instalados; los tests existentes son node-only. Los e2e (Playwright) cubren el comportamiento end-to-end. Si surge necesidad real, se evalúa instalar testing-library en una iniciativa aparte.

## Referencias

- Componentes: [components/forms/](../../components/forms/)
- Iniciativa: [docs/planning/forms-pattern.md](../planning/forms-pattern.md)
- ADR-006 — estados (empty/loading/error).
- ADR-008 — action feedback (toast vs banner vs confirm).
- ADR-009 — `<DetailPage>`.
- ADR-010 — `<DataTable>` (modelo del approach: foundation + golden path + migración por sprints).
