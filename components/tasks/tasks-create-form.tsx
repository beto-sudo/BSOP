'use client';

/**
 * TasksCreateForm — "Nueva tarea" dialog/sheet body.
 *
 * `simple` variant (rdb/inicio): Dialog with Estado + Prioridad + Asignado + Fecha.
 * `rich` variant (DILESA):       Sheet with required Prioridad/Responsable/Fecha
 *                                compromiso + motivo_bloqueo when estado='bloqueado'.
 *
 * Both variants own their state via `<Form>` + zod (forms-pattern).
 */

import { Plus } from 'lucide-react';
import { z } from 'zod';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';

import {
  type ComboboxOption,
  type Empleado,
  ESTADO_CONFIG,
  PRIORIDAD_OPTIONS,
  type TaskFormValues,
  type TaskEstado,
} from './tasks-shared';

// ─── Shared zod pieces ────────────────────────────────────────────────────────

const TaskEstadoEnum = z.enum(['pendiente', 'en_progreso', 'bloqueado', 'completado', 'cancelado']);

// ─── Simple variant schema ────────────────────────────────────────────────────

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

// ─── Rich variant schema ──────────────────────────────────────────────────────

const RichCreateSchema = z
  .object({
    titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
    descripcion: z.string().max(2000).default(''),
    estado: TaskEstadoEnum,
    prioridad: z.string().min(1, 'Selecciona una prioridad'),
    asignado_a: z.string().min(1, 'Selecciona un responsable'),
    fecha_compromiso: z.string().min(1, 'Selecciona la fecha de compromiso'),
    motivo_bloqueo: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.estado === 'bloqueado' && !data.motivo_bloqueo.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Indica el motivo del bloqueo',
        path: ['motivo_bloqueo'],
      });
    }
  });

type RichCreateValues = z.infer<typeof RichCreateSchema>;

const richDefaults: RichCreateValues = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: '',
  asignado_a: '',
  fecha_compromiso: '',
  motivo_bloqueo: '',
};

// ─── Dispatcher API ──────────────────────────────────────────────────────────

export type TasksCreateFormProps = {
  variant: 'simple' | 'rich';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the typed form values; the form owns its state. */
  onCreate: (values: TaskFormValues) => Promise<void>;

  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
};

export function TasksCreateForm(props: TasksCreateFormProps) {
  if (props.variant === 'rich') {
    return <RichCreateSheet {...props} />;
  }
  return <SimpleCreateDialog {...props} />;
}

// ─── Simple variant — Dialog ─────────────────────────────────────────────────

function SimpleCreateDialog({ open, onOpenChange, onCreate, empleados }: TasksCreateFormProps) {
  const form = useZodForm({
    schema: SimpleCreateSchema,
    defaultValues: simpleDefaults,
  });

  const handleSubmit = async (values: SimpleCreateValues) => {
    await onCreate({
      ...values,
      // Rich-only fields default empty for simple variant.
      fecha_compromiso: '',
      porcentaje_avance: 0,
      motivo_bloqueo: '',
    });
    form.reset(simpleDefaults);
    onOpenChange(false);
  };

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

// ─── Rich variant — Sheet ────────────────────────────────────────────────────

function RichCreateSheet({ open, onOpenChange, onCreate, empleadoOptions }: TasksCreateFormProps) {
  const form = useZodForm({
    schema: RichCreateSchema,
    defaultValues: richDefaults,
  });

  // Watch estado to conditionally show motivo_bloqueo.
  const estado = form.watch('estado');

  const handleSubmit = async (values: RichCreateValues) => {
    await onCreate({
      titulo: values.titulo,
      descripcion: values.descripcion,
      estado: values.estado,
      prioridad: values.prioridad,
      asignado_a: values.asignado_a,
      fecha_compromiso: values.fecha_compromiso,
      motivo_bloqueo: values.motivo_bloqueo,
      // Simple-only field unused by rich.
      fecha_vence: '',
      porcentaje_avance: 0,
    });
    form.reset(richDefaults);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(richDefaults);
    onOpenChange(next);
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="Nueva Tarea"
      description="Completa los campos requeridos para crear una tarea"
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
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
            <FormField name="prioridad" label="Prioridad" required>
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={PRIORIDAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                  placeholder="Seleccionar"
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
            {/* Estado se asigna automáticamente como 'pendiente' */}
          </FormRow>

          {estado === 'bloqueado' && (
            <FormField name="motivo_bloqueo" label="Motivo del Bloqueo" required>
              {(field) => (
                <Textarea
                  {...field}
                  id={field.id}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  placeholder="Describe por qué está bloqueada..."
                  rows={2}
                  className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          )}

          <FormField name="asignado_a" label="Responsable" required>
            {(field) => (
              <Combobox
                id={field.id}
                value={field.value}
                onChange={field.onChange}
                options={empleadoOptions.map((o) => ({ value: o.id, label: o.label }))}
                placeholder="Buscar responsable..."
                searchPlaceholder="Escriba un nombre..."
                allowClear
              />
            )}
          </FormField>

          <FormField name="fecha_compromiso" label="Fecha Compromiso" required>
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

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Crear tarea"
            submittingLabel="Creando..."
            submitIcon={<Plus className="h-4 w-4" />}
            onCancel={() => handleOpenChange(false)}
            stretch
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
