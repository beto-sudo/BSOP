'use client';

/**
 * TasksCreateForm — "Nueva tarea" dialog/sheet body.
 *
 * `simple` variant (rdb/inicio): 2-col grid with Estado + Prioridad + Asignado + Fecha.
 *                                Migrated to `<Form>` + zod (forms-pattern Sprint 1).
 * `rich` variant (DILESA):       required Prioridad/Responsable/Fecha compromiso,
 *                                Combobox responsable, motivo bloqueo when needed.
 *                                Pending Sprint 2 migration.
 */

import { Loader2, Plus } from 'lucide-react';
import { z } from 'zod';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';

import {
  type ComboboxOption,
  type Empleado,
  ESTADO_CONFIG,
  FieldLabel,
  PRIORIDAD_OPTIONS,
  type TaskFormValues,
  type TaskEstado,
} from './tasks-shared';

// ─── Simple variant schema ────────────────────────────────────────────────────

const TaskEstadoEnum = z.enum(['pendiente', 'en_progreso', 'bloqueado', 'completado', 'cancelado']);

const SimpleCreateSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
  descripcion: z.string().max(2000).default(''),
  estado: TaskEstadoEnum,
  prioridad: z.string().default(''),
  asignado_a: z.string().default(''),
  fecha_vence: z.string().default(''),
});

type SimpleCreateValues = z.infer<typeof SimpleCreateSchema>;

const simpleDefaults: SimpleCreateValues = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: '',
  asignado_a: '',
  fecha_vence: '',
};

// ─── Dispatcher API ──────────────────────────────────────────────────────────

export type TasksCreateFormProps = {
  variant: 'simple' | 'rich';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called on submit.
   *  - simple: receives the typed RHF values (the form owns its state).
   *  - rich:   called with no args; the parent reads its `value` state.
   *
   * The rich path still uses the legacy `value`/`onChange`/`creating` props
   * until Sprint 2 migrates it.
   */
  onCreate: (values?: TaskFormValues) => void | Promise<void>;

  // Rich-variant legacy props (ignored by simple).
  value?: TaskFormValues;
  onChange?: (v: TaskFormValues) => void;
  creating?: boolean;

  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
};

export function TasksCreateForm(props: TasksCreateFormProps) {
  if (props.variant === 'rich') {
    return <RichCreateSheet {...props} />;
  }
  return <SimpleCreateDialog {...props} />;
}

// ─── Simple variant — `<Form>` + zod + RHF ───────────────────────────────────

function SimpleCreateDialog({ open, onOpenChange, onCreate, empleados }: TasksCreateFormProps) {
  const form = useZodForm({
    schema: SimpleCreateSchema,
    defaultValues: simpleDefaults,
  });

  const handleSubmit = async (values: SimpleCreateValues) => {
    // Map back to the wider `TaskFormValues` shape the parent module expects.
    // Simple variant doesn't use the rich-only fields (`fecha_compromiso`,
    // `porcentaje_avance`, `motivo_bloqueo`), but they need defaults so the
    // type is satisfied.
    await onCreate({
      ...values,
      fecha_compromiso: '',
      porcentaje_avance: 0,
      motivo_bloqueo: '',
    });
    form.reset(simpleDefaults);
    onOpenChange(false);
  };

  // Reset when dialog closes (in case the user cancelled).
  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(simpleDefaults);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">Nueva Tarea</DialogTitle>
        </DialogHeader>

        <Form form={form} onSubmit={handleSubmit} className="space-y-4 py-2">
          <FormField name="titulo" label="Título" required>
            {(field) => (
              <Input
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder="Descripción breve de la tarea..."
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormField name="descripcion" label="Descripción">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder="Detalla la tarea..."
                rows={3}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormRow cols={2}>
            <FormField name="estado" label="Estado">
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value as TaskEstado}
                  onChange={(v) => field.onChange(v as TaskEstado)}
                  options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="prioridad" label="Prioridad">
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={PRIORIDAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                  placeholder="Sin prioridad"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField name="asignado_a" label="Asignado a">
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
                  placeholder="Sin asignar"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="fecha_vence" label="Fecha límite">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="date"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <DialogFooter className="gap-2 border-t-0 pt-0">
            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Crear tarea"
              submittingLabel="Creando..."
              submitIcon={<Plus className="h-4 w-4" />}
              onCancel={() => handleOpenChange(false)}
              className="border-t-0 pt-0"
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rich variant — legacy (Sprint 2 will migrate) ───────────────────────────

function RichCreateSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onCreate,
  creating,
  empleadoOptions,
}: TasksCreateFormProps) {
  if (!value || !onChange) return null;
  const set = (patch: Partial<TaskFormValues>) => onChange({ ...value, ...patch });
  const canCreate =
    !!value.titulo.trim() && !!value.prioridad && !!value.asignado_a && !!value.fecha_compromiso;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-[var(--text)] text-lg">Nueva Tarea</SheetTitle>
          <SheetDescription className="text-[var(--text)]/50">
            Completa los campos requeridos para crear una tarea
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div>
            <FieldLabel required>Título</FieldLabel>
            <Input
              placeholder="Descripción breve de la tarea..."
              value={value.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>

          <div>
            <FieldLabel>Descripción</FieldLabel>
            <Textarea
              placeholder="Detalla la tarea..."
              value={value.descripcion}
              onChange={(e) => set({ descripcion: e.target.value })}
              rows={3}
              className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Prioridad</FieldLabel>
              <Combobox
                value={value.prioridad}
                onChange={(v) => set({ prioridad: v })}
                options={PRIORIDAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                placeholder="Seleccionar"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            {/* Estado se asigna automáticamente como 'pendiente' */}
          </div>

          {value.estado === 'bloqueado' && (
            <div>
              <FieldLabel required>Motivo del Bloqueo</FieldLabel>
              <Textarea
                placeholder="Describe por qué está bloqueada..."
                value={value.motivo_bloqueo}
                onChange={(e) => set({ motivo_bloqueo: e.target.value })}
                rows={2}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          )}

          <div>
            <FieldLabel required>Responsable</FieldLabel>
            <Combobox
              value={value.asignado_a}
              onChange={(v) => set({ asignado_a: v })}
              options={empleadoOptions.map((o) => ({ value: o.id, label: o.label }))}
              placeholder="Buscar responsable..."
              searchPlaceholder="Escriba un nombre..."
              allowClear
            />
          </div>

          <div>
            <FieldLabel required>Fecha Compromiso</FieldLabel>
            <Input
              type="date"
              value={value.fecha_compromiso}
              onChange={(e) => set({ fecha_compromiso: e.target.value })}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void onCreate()}
            disabled={creating || !canCreate}
            className="flex-1 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear tarea
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
