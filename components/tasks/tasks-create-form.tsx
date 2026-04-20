'use client';

/**
 * TasksCreateForm — "Nueva tarea" dialog/sheet body.
 *
 * `simple` variant (rdb/inicio): 2-col grid with Estado + Prioridad + Asignado + Fecha.
 * `rich` variant (DILESA):       required Prioridad/Responsable/Fecha compromiso,
 *                                Combobox responsable, motivo bloqueo when needed.
 */

import { Loader2, Plus } from 'lucide-react';
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
  type ComboboxOption,
  type Empleado,
  ESTADO_CONFIG,
  FieldLabel,
  PRIORIDAD_OPTIONS,
  type TaskFormValues,
  type TaskEstado,
} from './tasks-shared';

export type TasksCreateFormProps = {
  variant: 'simple' | 'rich';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TaskFormValues;
  onChange: (v: TaskFormValues) => void;
  onCreate: () => void;
  creating: boolean;
  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
};

export function TasksCreateForm(props: TasksCreateFormProps) {
  if (props.variant === 'rich') {
    return <RichCreateSheet {...props} />;
  }
  return <SimpleCreateDialog {...props} />;
}

function SimpleCreateDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onCreate,
  creating,
  empleados,
}: TasksCreateFormProps) {
  const set = (patch: Partial<TaskFormValues>) => onChange({ ...value, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">Nueva Tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <FieldLabel>Título *</FieldLabel>
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
              <FieldLabel>Estado</FieldLabel>
              <Combobox
                value={value.estado}
                onChange={(v) => set({ estado: v as TaskEstado })}
                options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Prioridad</FieldLabel>
              <Combobox
                value={value.prioridad}
                onChange={(v) => set({ prioridad: v })}
                options={PRIORIDAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                placeholder="Sin prioridad"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Asignado a</FieldLabel>
              <Combobox
                value={value.asignado_a}
                onChange={(v) => set({ asignado_a: v })}
                options={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
                placeholder="Sin asignar"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Fecha límite</FieldLabel>
              <Input
                type="date"
                value={value.fecha_vence}
                onChange={(e) => set({ fecha_vence: e.target.value })}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          >
            Cancelar
          </Button>
          <Button
            onClick={onCreate}
            disabled={creating || !value.titulo.trim()}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RichCreateSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onCreate,
  creating,
  empleadoOptions,
}: TasksCreateFormProps) {
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
            onClick={onCreate}
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
