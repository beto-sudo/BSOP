'use client';

/**
 * Presentational pieces for the `erp.task_updates` feature.
 *
 * `<UpdatesList>` is now a thin wrapper over `<ActivityLog>` (ADR-023);
 * it adapts `TaskUpdateRow[]` → `ActivityEvent[]` and forwards a tones
 * map derived from `UPDATE_TIPO_CONFIG`. The tasks-specific UI hangs
 * here so the rest of the repo can adopt `<ActivityLog>` directly.
 */

import { Loader2, MessageSquarePlus } from 'lucide-react';
import {
  ESTADO_CONFIG,
  UPDATE_TIPO_CONFIG,
  type TaskEstado,
  type TaskUpdateRow,
} from './tasks-shared';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ActivityLog, type ActivityEvent, type ActivityEventType } from '@/components/activity-log';

type Variant = 'sheet' | 'embedded';

/**
 * Adapter `task_updates` → `ActivityEvent[]` (ADR-023 AL1).
 *
 * Mapping:
 * - `tipo` raw → `type` literal abierto (e.g. `'cambio_estado'`).
 * - `usuario.nombre` → `actor.nombre`; null cuando no hay usuario (Sistema).
 * - `contenido` (texto libre del usuario) → `detail`.
 * - `valor_anterior` + `valor_nuevo` → `changes[0]` con field = tipo.
 */
export function taskUpdatesToEvents(updates: TaskUpdateRow[]): ActivityEvent[] {
  return updates.map((u) => ({
    id: u.id,
    at: u.created_at,
    type: u.tipo as ActivityEventType,
    actor: u.usuario ? { id: u.creado_por ?? null, nombre: u.usuario.nombre } : null,
    detail: u.contenido ?? null,
    changes:
      u.valor_anterior != null && u.valor_nuevo != null
        ? [
            {
              field: u.tipo,
              before: u.valor_anterior,
              after: u.valor_nuevo,
            },
          ]
        : undefined,
  }));
}

/**
 * Tones map derived from `UPDATE_TIPO_CONFIG` (badge-system tones).
 * Passed to `<ActivityLog tones>` — sus keys ganan sobre los defaults
 * para los 5 tipos del dominio tasks.
 */
const TASK_UPDATE_TONES = Object.fromEntries(
  Object.entries(UPDATE_TIPO_CONFIG).map(([k, v]) => [k, { label: v.label, tone: v.tone }])
);

/**
 * `formatChange` para tasks — traduce los valores raw de `cambio_estado`
 * (e.g. `'pendiente'` → `'Pendiente'`) usando `ESTADO_CONFIG`. Para otros
 * tipos pasa el value tal cual.
 */
function formatChange(
  value: string | number,
  ctx: { field: string; kind: 'value' | 'field' }
): string {
  if (ctx.kind !== 'value') return String(value);
  if (ctx.field === 'cambio_estado') {
    const estado = String(value) as TaskEstado;
    return ESTADO_CONFIG[estado]?.label ?? String(value);
  }
  return String(value);
}

export function UpdatesList({
  updates,
  loading,
  variant = 'sheet',
}: {
  updates: TaskUpdateRow[];
  loading: boolean;
  variant?: Variant;
}) {
  return (
    <ActivityLog
      events={taskUpdatesToEvents(updates)}
      loading={loading}
      size={variant === 'embedded' ? 'compact' : 'default'}
      tones={TASK_UPDATE_TONES}
      formatChange={formatChange}
      emptyLabel={
        variant === 'embedded' ? 'Sin actualizaciones' : 'No hay actualizaciones registradas'
      }
    />
  );
}

export function UpdateComposer({
  value,
  onChange,
  onSubmit,
  saving,
  size = 'lg',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  saving: boolean;
  size?: 'sm' | 'lg';
}) {
  const isLarge = size === 'lg';
  return (
    <div className="space-y-3">
      {isLarge && (
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Nuevo avance
        </div>
      )}
      <Textarea
        placeholder={isLarge ? 'Describe el avance o actualización...' : 'Escribe un avance...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] ${isLarge ? 'min-h-[80px]' : 'min-h-[60px] text-sm'}`}
      />
      <Button
        onClick={onSubmit}
        disabled={saving || !value.trim()}
        size={isLarge ? undefined : 'sm'}
        className="w-full gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className={`${isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'} animate-spin`} />
        ) : (
          <MessageSquarePlus className={isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        )}
        {isLarge ? 'Guardar avance' : 'Agregar avance'}
      </Button>
    </div>
  );
}
