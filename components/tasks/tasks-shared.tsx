'use client';

/**
 * TasksModule — shared types, constants, helpers and small building blocks.
 *
 * Kept in a single file so the main `tasks-module.tsx` stays focused on
 * orchestration. Split further only if any section starts growing independently.
 */

// (Combobox local eliminado — usar @/components/ui/combobox para form fields y
// @/components/ui/filter-combobox para filtros de tabla).

import { Badge, type BadgeTone } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskEstado = 'pendiente' | 'en_progreso' | 'bloqueado' | 'completado' | 'cancelado';

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

// `emptyTaskForm` removed (forms-pattern Sprint 2): each form owns its
// defaults locally via the `<Form>` + zod pattern.

// ─── Constants ────────────────────────────────────────────────────────────────

export const ESTADO_CONFIG: Record<TaskEstado, { label: string; tone: BadgeTone }> = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  en_progreso: { label: 'En progreso', tone: 'info' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  completado: { label: 'Completado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export const ESTADO_ORDER: TaskEstado[] = [
  'pendiente',
  'en_progreso',
  'bloqueado',
  'completado',
  'cancelado',
];

export const PRIORIDAD_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  Urgente: { label: 'Urgente', tone: 'danger' },
  Alta: { label: 'Alta', tone: 'warning' },
  Media: { label: 'Media', tone: 'warning' },
  Baja: { label: 'Baja', tone: 'success' },
};

export const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

export const UPDATE_TIPO_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  avance: { label: 'Avance', tone: 'info' },
  cambio_estado: { label: 'Estado', tone: 'warning' },
  cambio_fecha: { label: 'Fecha', tone: 'accent' },
  nota: { label: 'Nota', tone: 'neutral' },
  cambio_responsable: { label: 'Responsable', tone: 'success' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `formatDate` from `@/lib/format` directamente.
 */
export { formatDate } from '@/lib/format';

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
  const cfg = ESTADO_CONFIG[estado];
  if (!cfg) return <Badge tone="neutral">{estado}</Badge>;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/**
 * Classic prioridad badge (used by simpler variants). Looks up a tone by
 * exact prioridad value (e.g. "Urgente", "Alta").
 */
export function PrioridadBadge({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[var(--text-subtle)]">—</span>;
  const cfg = PRIORIDAD_CONFIG[prioridad];
  if (!cfg) return <Badge tone="neutral">{prioridad}</Badge>;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/**
 * DILESA-style prioridad badge — includes a colored dot and accepts free-form
 * text (case-insensitive matching for "alta"/"urgente"/"media"/"baja").
 *
 * Usa `<Badge tone>` para la paleta canónica y agrega un dot custom
 * via children (caso especial que justifica un wrapper sobre `<Badge>`).
 */
export function PrioridadTextBadge({ text }: { text: string | null }) {
  if (!text) return <span className="text-[var(--text-subtle)]">—</span>;
  const lower = text.toLowerCase();
  const tone: BadgeTone =
    lower === 'alta' || lower === 'urgente'
      ? 'danger'
      : lower === 'media'
        ? 'warning'
        : lower === 'baja'
          ? 'success'
          : 'neutral';
  const dotColor =
    lower === 'alta' || lower === 'urgente'
      ? 'bg-red-500'
      : lower === 'media'
        ? 'bg-amber-500'
        : lower === 'baja'
          ? 'bg-green-500'
          : 'bg-gray-400';
  return (
    <Badge tone={tone}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {text}
    </Badge>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped === 100 ? 'bg-green-500' : clamped >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-[var(--border)]">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-[var(--text)]/50">{clamped}%</span>
    </div>
  );
}

export { FieldLabel } from '@/components/ui/field-label';

// Re-export del tipo de FilterCombobox para consumidores que importaban
// `ComboboxOption` desde este módulo (eran filtros filter-style).
export type { FilterComboboxOption as ComboboxOption } from '@/components/ui/filter-combobox';
