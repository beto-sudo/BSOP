'use client';

/**
 * TasksModule — shared types, constants, helpers and small building blocks.
 *
 * Kept in a single file so the main `tasks-module.tsx` stays focused on
 * orchestration. Split further only if any section starts growing independently.
 */

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskEstado =
  | 'pendiente'
  | 'en_progreso'
  | 'bloqueado'
  | 'completado'
  | 'cancelado';

/**
 * Super-set row shape — some columns only exist on the richer DILESA variant
 * of the `erp.tasks` table. Optional fields default to `undefined` for the
 * simpler rdb/inicio variants, which works for all consumers since they only
 * render what they know about.
 */
export type ErpTask = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  asignado_a: string | null;
  creado_por: string | null;
  prioridad: string | null;
  estado: TaskEstado;
  fecha_vence: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  created_at: string;
  updated_at: string | null;

  // DILESA-only extras (nullable / optional for legacy rows)
  asignado_por?: string | null;
  fecha_compromiso?: string | null;
  fecha_completado?: string | null;
  completado_por?: string | null;
  porcentaje_avance?: number;
  tipo?: string | null;
  motivo_bloqueo?: string | null;
  siguiente_accion?: string | null;
  iniciativa?: string | null;
  departamento_nombre?: string | null;
};

export type Empleado = { id: string; nombre: string };

export type TaskUpdateRow = {
  id: string;
  task_id: string;
  tipo: string;
  contenido: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  creado_por: string | null;
  created_at: string;
  usuario?: { nombre: string } | null;
};

export type TaskFormValues = {
  titulo: string;
  descripcion: string;
  prioridad: string;
  asignado_a: string;
  estado: TaskEstado;
  fecha_vence: string;
  // DILESA-only extras
  fecha_compromiso: string;
  porcentaje_avance: number;
  motivo_bloqueo: string;
};

export const emptyTaskForm = (): TaskFormValues => ({
  titulo: '',
  descripcion: '',
  prioridad: '',
  asignado_a: '',
  estado: 'pendiente',
  fecha_vence: '',
  fecha_compromiso: '',
  porcentaje_avance: 0,
  motivo_bloqueo: '',
});

// ─── Constants ────────────────────────────────────────────────────────────────

export const ESTADO_CONFIG: Record<TaskEstado, { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado:   { label: 'Bloqueado',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado:  { label: 'Completado',  cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]' },
};

export const ESTADO_ORDER: TaskEstado[] = [
  'pendiente',
  'en_progreso',
  'bloqueado',
  'completado',
  'cancelado',
];

export const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string }> = {
  Urgente: { label: 'Urgente', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  Alta:    { label: 'Alta',    cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  Media:   { label: 'Media',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  Baja:    { label: 'Baja',    cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
};

export const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

export const UPDATE_TIPO_CONFIG: Record<string, { label: string; cls: string }> = {
  avance:             { label: 'Avance',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  cambio_estado:      { label: 'Estado',      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  cambio_fecha:       { label: 'Fecha',       cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  nota:               { label: 'Nota',        cls: 'bg-[var(--border)]/60 text-[var(--text)]/60 border-[var(--border)]' },
  cambio_responsable: { label: 'Responsable', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Small presentational pieces ─────────────────────────────────────────────

export function EstadoBadge({ estado }: { estado: TaskEstado }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, cls: '' };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/**
 * Classic prioridad badge (used by simpler variants). Looks up a class by
 * exact prioridad value (e.g. "Urgente", "Alta").
 */
export function PrioridadBadge({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[var(--text)]/40">—</span>;
  const cfg = PRIORIDAD_CONFIG[prioridad] ?? { label: prioridad, cls: '' };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/**
 * DILESA-style prioridad badge — includes a colored dot and accepts free-form
 * text (case-insensitive matching for "alta"/"urgente"/"media"/"baja").
 */
export function PrioridadTextBadge({ text }: { text: string | null }) {
  if (!text) return <span className="text-[var(--text)]/40">—</span>;
  const lower = text.toLowerCase();
  const dotColor =
    lower === 'alta' || lower === 'urgente'
      ? 'bg-red-500'
      : lower === 'media'
        ? 'bg-amber-500'
        : lower === 'baja'
          ? 'bg-green-500'
          : 'bg-gray-400';
  const cls =
    lower === 'alta' || lower === 'urgente'
      ? 'bg-red-500/15 text-red-400 border-red-500/20'
      : lower === 'media'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
        : lower === 'baja'
          ? 'bg-green-500/15 text-green-400 border-green-500/20'
          : 'bg-[var(--border)]/40 text-[var(--text)]/60 border-[var(--border)]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {text}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped === 100 ? 'bg-green-500' : clamped >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-[var(--text)]/50">{clamped}%</span>
    </div>
  );
}

export function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </div>
  );
}

// ─── Combobox — used by DILESA variant for filters and responsable picker ────

export type ComboboxOption = { id: string; label: string };

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  allowClear = false,
  clearLabel = 'Todos',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 h-9 text-sm hover:bg-[var(--panel)]/80 transition-colors ${className ?? 'w-full'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--text)]/40'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value={`__clear__${clearLabel}`}
                  onSelect={() => {
                    onChange('all');
                    setOpen(false);
                  }}
                  data-checked={value === 'all' || value === ''}
                >
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  data-checked={value === o.id}
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
