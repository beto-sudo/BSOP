import { Button } from '@/components/ui/button';
import { CalendarRange, RefreshCw } from 'lucide-react';
import type { RangeKey } from './types';

const RANGE_OPTIONS = [
  ['7d', '7 días'],
  ['30d', '30 días'],
  ['month', 'Este mes'],
  ['year', 'Este año'],
  ['all', 'Todo'],
] as const;

export function HeaderSection({
  range,
  onRangeChange,
  rangeLabel,
  refreshing,
  onRefresh,
}: {
  range: RangeKey;
  onRangeChange: (value: RangeKey) => void;
  rangeLabel: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            RDB x Playtomic
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
            Dashboard Playtomic
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text)]/60">
            Reservas, ingresos, ocupación, jugadores y salud de sincronización en una sola vista.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={[
                'rounded-full border px-3 py-2 text-sm transition',
                range === value
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/65 hover:text-[var(--text)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>
      <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]/65">
        <CalendarRange className="h-4 w-4" />
        {rangeLabel}
      </div>
    </section>
  );
}
