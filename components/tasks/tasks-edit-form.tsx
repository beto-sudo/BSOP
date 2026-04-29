'use client';

/**
 * TasksEditForm — "Editar tarea" dialog/sheet.
 *
 * `simple` variant: Dialog with Estado/Prioridad/Asignado/Fecha.
 * `rich` variant: Sheet with role-gated Estado, avance slider, motivo bloqueo,
 *                 metadata panel, and embedded Updates composer + history.
 *
 * Both variants own their state via `<Form>` + zod (forms-pattern).
 */

import * as React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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
import {
  Form,
  FormActions,
  FormField,
  FormRow,
  useFormContext,
  useZodForm,
} from '@/components/forms';

import {
  type ComboboxOption,
  type Empleado,
  type ErpTask,
  ESTADO_CONFIG,
  FieldLabel,
  formatDate,
  PRIORIDAD_OPTIONS,
  type TaskEstado,
  type TaskFormValues,
  type TaskUpdateRow,
} from './tasks-shared';
import { UpdateComposer, UpdatesList } from './tasks-updates';

// ─── Shared zod pieces ────────────────────────────────────────────────────────

const TaskEstadoEnum = z.enum(['pendiente', 'en_progreso', 'bloqueado', 'completado', 'cancelado']);

// ─── Simple edit schema ──────────────────────────────────────────────────────

const SimpleEditSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
  descripcion: z.string().max(2000).default(''),
  estado: TaskEstadoEnum,
  prioridad: z.string().default(''),
  asignado_a: z.string().default(''),
  fecha_vence: z.string().default(''),
});

type SimpleEditValues = z.infer<typeof SimpleEditSchema>;

const emptySimpleValues: SimpleEditValues = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: '',
  asignado_a: '',
  fecha_vence: '',
};

const taskToSimpleValues = (task: ErpTask | null): SimpleEditValues => {
  if (!task) return emptySimpleValues;
  return {
    titulo: task.titulo,
    descripcion: task.descripcion ?? '',
    estado: task.estado,
    prioridad: task.prioridad ?? '',
    asignado_a: task.asignado_a ?? '',
    fecha_vence: task.fecha_vence ? task.fecha_vence.split('T')[0] : '',
  };
};

// ─── Rich edit schema ────────────────────────────────────────────────────────

const RichEditSchema = z
  .object({
    titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
    descripcion: z.string().max(2000).default(''),
    estado: TaskEstadoEnum,
    prioridad: z.string().default(''),
    asignado_a: z.string().default(''),
    fecha_compromiso: z.string().default(''),
    porcentaje_avance: z.number().min(0).max(100).default(0),
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

type RichEditValues = z.infer<typeof RichEditSchema>;

const emptyRichValues: RichEditValues = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: '',
  asignado_a: '',
  fecha_compromiso: '',
  porcentaje_avance: 0,
  motivo_bloqueo: '',
};

const taskToRichValues = (task: ErpTask | null): RichEditValues => {
  if (!task) return emptyRichValues;
  return {
    titulo: task.titulo,
    descripcion: task.descripcion ?? '',
    estado: task.estado,
    prioridad: task.prioridad ?? '',
    asignado_a: task.asignado_a ?? '',
    fecha_compromiso: task.fecha_compromiso
      ? task.fecha_compromiso.split('T')[0]
      : task.fecha_vence
        ? task.fecha_vence.split('T')[0]
        : '',
    porcentaje_avance: task.porcentaje_avance ?? 0,
    motivo_bloqueo: task.motivo_bloqueo ?? '',
  };
};

// ─── Dispatcher API ──────────────────────────────────────────────────────────

export type TasksEditFormProps = {
  variant: 'simple' | 'rich';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: ErpTask | null;
  /** Called with the typed form values; the form owns its state. */
  onSave: (values: TaskFormValues) => Promise<void>;
  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
  empleadoMap: Map<string, Empleado>;

  // Rich-only ------------------------------------------------------------------
  canCompleteTask?: boolean;
  canModifyTask?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  updates?: TaskUpdateRow[];
  loadingUpdates?: boolean;
  updateContent?: string;
  onUpdateContentChange?: (v: string) => void;
  onSaveUpdate?: () => void;
  savingUpdate?: boolean;
};

export function TasksEditForm(props: TasksEditFormProps) {
  if (props.variant === 'rich') {
    return <RichEditSheet {...props} />;
  }
  return <SimpleEditDialog {...props} />;
}

// ─── Simple variant ──────────────────────────────────────────────────────────

function SimpleEditDialog({
  open,
  onOpenChange,
  selectedTask,
  onSave,
  empleados,
}: TasksEditFormProps) {
  const form = useZodForm({
    schema: SimpleEditSchema,
    defaultValues: emptySimpleValues,
  });

  // Reset when the selected task changes (open or switching rows).
  React.useEffect(() => {
    if (open && selectedTask) {
      form.reset(taskToSimpleValues(selectedTask));
    }
  }, [open, selectedTask, form]);

  const handleSubmit = async (values: SimpleEditValues) => {
    await onSave({
      ...values,
      // Simple variant defaults rich-only fields.
      fecha_compromiso: '',
      porcentaje_avance: 0,
      motivo_bloqueo: '',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">Editar Tarea</DialogTitle>
        </DialogHeader>

        <Form form={form} onSubmit={handleSubmit} className="space-y-4 py-2">
          <FormField name="titulo" label="Título" required>
            {(field) => (
              <Input
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
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
              submitLabel="Guardar cambios"
              submittingLabel="Guardando..."
              onCancel={() => onOpenChange(false)}
              className="border-t-0 pt-0"
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rich variant ────────────────────────────────────────────────────────────

function RichEditSheet({
  open,
  onOpenChange,
  selectedTask,
  onSave,
  empleadoMap,
  empleadoOptions,
  canCompleteTask = false,
  canModifyTask = false,
  onDelete,
  deleting = false,
  updates = [],
  loadingUpdates = false,
  updateContent = '',
  onUpdateContentChange,
  onSaveUpdate,
  savingUpdate = false,
}: TasksEditFormProps) {
  const form = useZodForm({
    schema: RichEditSchema,
    defaultValues: emptyRichValues,
  });

  React.useEffect(() => {
    if (open && selectedTask) {
      form.reset(taskToRichValues(selectedTask));
    }
  }, [open, selectedTask, form]);

  const handleSubmit = async (values: RichEditValues) => {
    await onSave({
      ...values,
      // Rich variant doesn't use simple-only `fecha_vence`.
      fecha_vence: '',
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-[var(--text)] text-lg">Editar Tarea</SheetTitle>
          <SheetDescription className="text-[var(--text)]/50">
            {selectedTask?.departamento_nombre && `${selectedTask.departamento_nombre} · `}
            Creada {formatDate(selectedTask?.created_at ?? null)}
          </SheetDescription>
        </SheetHeader>

        <Form form={form} onSubmit={handleSubmit} className="space-y-5 py-4">
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
                <>
                  <Combobox
                    id={field.id}
                    value={field.value as TaskEstado}
                    onChange={(v) => field.onChange(v as TaskEstado)}
                    options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                    }))}
                    disabled={!canCompleteTask}
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                  {!canCompleteTask && (
                    <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
                      Solo dirección o el creador pueden cambiar el estado
                    </p>
                  )}
                </>
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

          <BloqueoConditionalField />

          <FormField name="asignado_a" label="Responsable">
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

          <FormField name="fecha_compromiso" label="Fecha Compromiso">
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

          <AvanceSliderField />

          {/* Metadata (read-only) */}
          {selectedTask &&
            (selectedTask.iniciativa ||
              selectedTask.tipo ||
              selectedTask.fecha_vence ||
              selectedTask.motivo_bloqueo ||
              selectedTask.siguiente_accion) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-[var(--panel)] p-3 border border-[var(--border)] text-[11px]">
                {selectedTask.iniciativa && (
                  <div>
                    <span className="font-semibold text-[var(--text-subtle)] block">
                      Iniciativa
                    </span>
                    {selectedTask.iniciativa}
                  </div>
                )}
                {selectedTask.tipo && (
                  <div>
                    <span className="font-semibold text-[var(--text-subtle)] block">Tipo</span>
                    {selectedTask.tipo}
                  </div>
                )}
                {selectedTask.fecha_vence && (
                  <div>
                    <span className="font-semibold text-[var(--text-subtle)] block">
                      Fecha Vence
                    </span>
                    {formatDate(selectedTask.fecha_vence)}
                  </div>
                )}
                {selectedTask.motivo_bloqueo && (
                  <div className="col-span-2">
                    <span className="font-semibold text-[var(--text-subtle)] block">Bloqueo</span>
                    {selectedTask.motivo_bloqueo}
                  </div>
                )}
                {selectedTask.siguiente_accion && (
                  <div className="col-span-2">
                    <span className="font-semibold text-[var(--text-subtle)] block">
                      Siguiente Acción
                    </span>
                    {selectedTask.siguiente_accion}
                  </div>
                )}
              </div>
            )}

          {selectedTask?.asignado_por && (
            <div className="text-xs text-[var(--text-subtle)]">
              Asignada por: {empleadoMap.get(selectedTask.asignado_por)?.nombre ?? 'Desconocido'}
              {selectedTask.fecha_completado && (
                <> · Completada: {formatDate(selectedTask.fecha_completado)}</>
              )}
            </div>
          )}

          {/* Updates composer + history (outside form schema; mutations are
              independent of the task save and managed by the parent module). */}
          <div className="border-t border-[var(--border)] pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
              Actualizaciones
            </div>
            <UpdateComposer
              value={updateContent}
              onChange={(v) => onUpdateContentChange?.(v)}
              onSubmit={() => onSaveUpdate?.()}
              saving={savingUpdate}
              size="sm"
            />
            <div className="mt-3 space-y-2">
              <UpdatesList updates={updates} loading={loadingUpdates} variant="embedded" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
            {canModifyTask && onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <div className="flex-1" />
            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Guardar cambios"
              submittingLabel="Guardando..."
              onCancel={() => onOpenChange(false)}
              className="border-t-0 pt-0"
            />
          </div>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Watches `estado` from the surrounding form context and renders the
 * `motivo_bloqueo` textarea only when `estado === 'bloqueado'`. Kept as a
 * sibling component so the parent doesn't need a manual `useFormContext`.
 */
function BloqueoConditionalField() {
  const { watch } = useFormContext<RichEditValues>();
  const estado = watch('estado');
  if (estado !== 'bloqueado') return null;
  return (
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
  );
}

/**
 * Range slider for `porcentaje_avance`. Doesn't use `<FormField>` because the
 * label needs to embed the live value; uses `useFormContext` directly.
 */
function AvanceSliderField() {
  const { watch, setValue } = useFormContext<RichEditValues>();
  const value = watch('porcentaje_avance');
  return (
    <div>
      <FieldLabel>Avance ({value}%)</FieldLabel>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) =>
          setValue('porcentaje_avance', Number(e.target.value), { shouldDirty: true })
        }
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}
