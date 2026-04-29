'use client';

import * as React from 'react';
import { Clock, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { DEFAULT_ACTIVITY_TONES } from './types';
import type { ActivityEvent } from './types';

export type ActivityLogProps = {
  /** Eventos a renderizar (ya mapeados via adapter del caller). */
  events: ActivityEvent[];
  /** Loading state — renderea skeleton compacto. */
  loading?: boolean;
  /** Empty-state copy. Default `'No hay actividad registrada'`. */
  emptyLabel?: React.ReactNode;
  /**
   * Compact variant — usado en drawers o sub-paneles. Default `'default'`.
   * - `'default'`: padding cómodo, ideal para detail pages.
   * - `'compact'`: padding reducido, ideal para drawers.
   */
  size?: 'default' | 'compact';
  /**
   * Tones map override por dominio. Ya merged sobre `DEFAULT_ACTIVITY_TONES`,
   * los keys del caller ganan. Útil para domain-specific events
   * (`'voucher_confirmed'`, `'oc_recibida'`, etc.).
   */
  tones?: Record<string, { label: string; tone: import('@/components/ui/badge').BadgeTone }>;
  /**
   * Pre-rendered label resolver para los `field` de `changes`. Útil para
   * mostrar "Estado: Pendiente → Completado" en lugar de "estado: pendiente
   * → completado".
   *
   * Recibe el value (raw del backend) y devuelve el label legible. Default
   * pasa el value tal cual (string o number stringificado).
   */
  formatChange?: (
    fieldOrValue: string | number,
    context: { field: string; kind: 'value' | 'field' }
  ) => string;
  className?: string;
};

/**
 * `<ActivityLog>` — renderea timeline canónico desde `ActivityEvent[]`
 * (ADR-023). Section component diseñado para vivir dentro de
 * `<DetailPage>` o `<DetailDrawer>` sin scroll wrapper propio (AL5).
 *
 * Loading / empty heredan el patrón visual del repo (skeleton compacto +
 * empty state minimal). Error states los maneja el caller (envolverlo en
 * un `<ErrorBanner>` si la query falla).
 */
export function ActivityLog({
  events,
  loading = false,
  emptyLabel = 'No hay actividad registrada',
  size = 'default',
  tones,
  formatChange,
  className,
}: ActivityLogProps) {
  const isCompact = size === 'compact';

  // Merge user-provided tones over defaults; user's keys win for known types.
  const toneMap = React.useMemo(() => ({ ...DEFAULT_ACTIVITY_TONES, ...(tones ?? {}) }), [tones]);

  if (loading) {
    return (
      <div
        className={cn('flex items-center justify-center', isCompact ? 'py-3' : 'py-6', className)}
      >
        <Loader2
          className={cn('animate-spin text-[var(--text)]/30', isCompact ? 'h-4 w-4' : 'h-5 w-5')}
          aria-hidden="true"
        />
      </div>
    );
  }

  if (events.length === 0) {
    if (isCompact) {
      return (
        <p className={cn('text-xs text-[var(--text-subtle)] text-center py-3', className)}>
          {emptyLabel}
        </p>
      );
    }
    return (
      <div className={cn('flex flex-col items-center justify-center py-6 text-center', className)}>
        <Clock className="mb-2 h-8 w-8 text-[var(--text)]/20" aria-hidden="true" />
        <p className="text-sm text-[var(--text)]/50">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className={cn(isCompact ? 'space-y-2' : 'space-y-2.5', className)} aria-label="Actividad">
      {events.map((event) => (
        <ActivityEventCard
          key={event.id}
          event={event}
          isCompact={isCompact}
          toneMap={toneMap}
          formatChange={formatChange}
        />
      ))}
    </ul>
  );
}

function ActivityEventCard({
  event,
  isCompact,
  toneMap,
  formatChange,
}: {
  event: ActivityEvent;
  isCompact: boolean;
  toneMap: Record<string, { label: string; tone: import('@/components/ui/badge').BadgeTone }>;
  formatChange?: ActivityLogProps['formatChange'];
}) {
  // AL2: tipos desconocidos caen a `tone: 'neutral'` con el slug raw.
  const tc = toneMap[event.type] ?? { label: String(event.type), tone: 'neutral' as const };

  return (
    <li
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--panel)]',
        isCompact ? 'px-3 py-2' : 'px-3 py-2.5'
      )}
    >
      <div className={cn('flex items-center gap-2', isCompact ? 'mb-0.5' : 'mb-1')}>
        <Badge tone={tc.tone}>{tc.label}</Badge>
        {/* AL3: actor nullable → 'Sistema' fallback */}
        <span className="text-[10px] text-[var(--text-subtle)]">
          {event.actor?.nombre ?? 'Sistema'}
        </span>
        <time
          className="text-[10px] text-[var(--text)]/30 ml-auto"
          dateTime={event.at}
          title={new Date(event.at).toLocaleString('es-MX', { timeZone: 'America/Matamoros' })}
        >
          {formatTimestamp(event.at, isCompact)}
        </time>
      </div>

      {/* AL4: summary > detail (texto libre) */}
      {event.summary ? (
        <p className={cn(isCompact ? 'text-xs' : 'text-sm', 'text-[var(--text)]/80')}>
          {event.summary}
        </p>
      ) : null}
      {event.detail ? (
        <p className={cn(isCompact ? 'text-xs' : 'text-sm', 'text-[var(--text)]/80')}>
          {event.detail}
        </p>
      ) : null}

      {/* AL4: changes (estructurado) — render como diff */}
      {event.changes && event.changes.length > 0 ? (
        <div className={cn('mt-1 space-y-0.5', isCompact ? 'text-[10px]' : 'text-xs')}>
          {event.changes.map((change, idx) => (
            <ChangeLine
              key={`${change.field}-${idx}`}
              change={change}
              formatChange={formatChange}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function ChangeLine({
  change,
  formatChange,
}: {
  change: import('./types').ActivityFieldChange;
  formatChange?: ActivityLogProps['formatChange'];
}) {
  const fieldLabel =
    change.label ??
    (formatChange
      ? formatChange(change.field, { field: change.field, kind: 'field' })
      : change.field);
  const before =
    change.before == null
      ? '—'
      : formatChange
        ? formatChange(change.before, { field: change.field, kind: 'value' })
        : String(change.before);
  const after =
    change.after == null
      ? '—'
      : formatChange
        ? formatChange(change.after, { field: change.field, kind: 'value' })
        : String(change.after);

  return (
    <p className="text-[var(--text)]/50">
      <span className="font-medium text-[var(--text)]/65">{fieldLabel}:</span> {before} →{' '}
      <span className="text-[var(--text)]/75">{after}</span>
    </p>
  );
}

/**
 * Format a timestamp for the timeline:
 * - Compact: short date (`24 abr`).
 * - Default: full local date (`24 abr 2026`).
 *
 * Always rendered in `America/Matamoros` (CST). The full datetime is
 * exposed on hover via the `<time title>` attribute.
 */
function formatTimestamp(iso: string, compact: boolean): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: '2-digit',
    month: 'short',
    ...(compact ? {} : { year: 'numeric' }),
  });
}
