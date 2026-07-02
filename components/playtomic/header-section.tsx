'use client';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { CalendarRange, RefreshCw } from 'lucide-react';
import type { BookingFilters, RangeKey, SportFilter } from './types';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

const RANGE_OPTIONS = [
  ['7d', '7 días'],
  ['30d', '30 días'],
  ['month', 'Este mes'],
  ['year', 'Este año'],
  ['all', 'Todo'],
  ['custom', 'Custom'],
] as const;

export function HeaderSection({
  range,
  onRangeChange,
  rangeLabel,
  customFromIso,
  customToIso,
  onCustomRangeChange,
  filters,
  onFiltersChange,
  resourceOptions,
  coachOptions,
  activityOptions,
  refreshing,
  onRefresh,
}: {
  range: RangeKey;
  onRangeChange: (value: RangeKey) => void;
  rangeLabel: string;
  customFromIso: string;
  customToIso: string;
  onCustomRangeChange: (from: string, to: string) => void;
  filters: BookingFilters;
  onFiltersChange: (next: BookingFilters) => void;
  resourceOptions: { value: string; label: string }[];
  coachOptions: { value: string; label: string }[];
  activityOptions: { value: string; label: string }[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const showCustom = range === 'custom';
  const todayIso = hoyISOMatamoros();

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
            Reservas, ingresos, ocupación, jugadores y entrenadores en una sola vista.
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

      {showCustom ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
          <span className="text-[var(--text)]/65">Del</span>
          <input
            type="date"
            max={customToIso || todayIso}
            value={customFromIso}
            onChange={(e) => onCustomRangeChange(e.target.value, customToIso)}
            className="rounded-md border border-input bg-transparent px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-[var(--text)]/65">al</span>
          <input
            type="date"
            min={customFromIso || undefined}
            max={todayIso}
            value={customToIso}
            onChange={(e) => onCustomRangeChange(customFromIso, e.target.value)}
            className="rounded-md border border-input bg-transparent px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : (
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]/65">
          <CalendarRange className="h-4 w-4" />
          {rangeLabel}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Combobox
          value={filters.sport}
          onChange={(value) =>
            onFiltersChange({ ...filters, sport: (value ?? 'all') as SportFilter })
          }
          options={[
            { value: 'all', label: 'Todos los deportes' },
            { value: 'PADEL', label: 'Padel' },
            { value: 'TENNIS', label: 'Tenis' },
          ]}
        />
        <Combobox
          value={filters.resource}
          onChange={(value) => onFiltersChange({ ...filters, resource: value ?? '' })}
          options={[{ value: '', label: 'Todas las canchas' }, ...resourceOptions]}
          allowClear
        />
        <Combobox
          value={filters.coachSlug}
          onChange={(value) => onFiltersChange({ ...filters, coachSlug: value ?? '' })}
          options={[{ value: '', label: 'Todos los entrenadores' }, ...coachOptions]}
          allowClear
        />
        <Combobox
          value={filters.activity}
          onChange={(value) => onFiltersChange({ ...filters, activity: value ?? '' })}
          options={[{ value: '', label: 'Todas las actividades' }, ...activityOptions]}
          allowClear
        />
      </div>
    </section>
  );
}
