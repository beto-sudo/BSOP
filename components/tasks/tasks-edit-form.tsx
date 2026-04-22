'use client';

/**
 * TasksEditForm — "Editar tarea" dialog/sheet.
 *
 * `simple` variant: Dialog with Estado/Prioridad/Asignado/Fecha.
 * `rich` variant: Sheet with role-gated Estado, avance slider, motivo bloqueo,
 *                 metadata panel, and embedded Updates composer + history.
 */

import { Loader2, Trash2 } from 'lucide-react';
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

export type TasksEditFormProps = {
  variant: 'simple' | 'rich';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: ErpTask | null;
  value: TaskFormValues;
  onChange: (v: TaskFormValues) => void;
  onSave: () => void;
  saving: boolean;
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

function SimpleEditDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSave,
  saving,
  empleados,
}: TasksEditFormProps) {
  const set = (patch: Partial<TaskFormValues>) => onChange({ ...value, ...patch });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">Editar Tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <FieldLabel>Título *</FieldLabel>
            <Input
              value={value.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Descripción</FieldLabel>
            <Textarea
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
            onClick={onSave}
            disabled={saving || !value.titulo.trim()}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RichEditSheet({
  open,
  onOpenChange,
  selectedTask,
  value,
  onChange,
  onSave,
  saving,
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
  const set = (patch: Partial<TaskFormValues>) => onChange({ ...value, ...patch });
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
              <FieldLabel>Estado</FieldLabel>
              <Combobox
                value={value.estado}
                onChange={(v) => set({ estado: v as TaskEstado })}
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
            <FieldLabel>Responsable</FieldLabel>
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
            <FieldLabel>Fecha Compromiso</FieldLabel>
            <Input
              type="date"
              value={value.fecha_compromiso}
              onChange={(e) => set({ fecha_compromiso: e.target.value })}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>

          <div>
            <FieldLabel>Avance ({value.porcentaje_avance}%)</FieldLabel>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={value.porcentaje_avance}
              onChange={(e) => set({ porcentaje_avance: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </div>

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

          {/* Updates composer + history */}
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
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
          {canModifyTask && onDelete && (
            <Button
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          >
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !value.titulo.trim()}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
