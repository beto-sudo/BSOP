'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { HealthRangePreset } from '@/lib/health';

const PRESET_OPTIONS: Array<{ value: Exclude<HealthRangePreset, 'custom'>; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function HealthRangeSelector({
  initialPreset,
  initialFrom,
  initialTo,
}: {
  initialPreset: HealthRangePreset;
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState<HealthRangePreset>(initialPreset);
  const [from, setFrom] = useState(initialFrom ?? '');
  const [to, setTo] = useState(initialTo ?? '');

  const today = useMemo(() => formatIsoDate(new Date()), []);

  const pushParams = (next: { preset: HealthRangePreset; from?: string; to?: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete('range');
    params.delete('from');
    params.delete('to');

    if (next.preset === 'custom') {
      if (next.from) params.set('from', next.from);
      if (next.to) params.set('to', next.to);
    } else if (next.preset !== '7d') {
      params.set('range', next.preset);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const applyPreset = (nextPreset: HealthRangePreset) => {
    setPreset(nextPreset);

    if (nextPreset === 'custom') {
      const nextFrom = from || initialFrom || today;
      const nextTo = to || initialTo || today;
      setFrom(nextFrom);
      setTo(nextTo);
      pushParams({ preset: 'custom', from: nextFrom, to: nextTo });
      return;
    }

    pushParams({ preset: nextPreset });
  };

  const applyCustom = () => {
    if (!from || !to) return;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    setPreset('custom');
    setFrom(ordered.from);
    setTo(ordered.to);
    pushParams({ preset: 'custom', from: ordered.from, to: ordered.to });
  };

  return (
    <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5 dark:border-amber-300/15 dark:bg-black/20 dark:shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-soft)] dark:text-amber-200/80">
            <CalendarDays className="h-4 w-4" />
            Date range
          </div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            Vitals stay anchored to today by default. Trends can expand to a wider window or a
            custom range.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="relative">
            <select
              value={preset}
              onChange={(event) => applyPreset(event.target.value as HealthRangePreset)}
              className="min-w-[220px] appearance-none rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 pr-10 text-sm font-medium text-[var(--text)] outline-none transition focus:border-[var(--accent-soft)] dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-white dark:focus:border-amber-300/40"
            >
              {PRESET_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-white text-[var(--text)] dark:bg-neutral-900 dark:text-white"
                >
                  {option.label}
                </option>
              ))}
              <option
                value="custom"
                className="bg-white text-[var(--text)] dark:bg-neutral-900 dark:text-white"
              >
                Custom Range
              </option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)] dark:text-white/55" />
          </div>

          {preset === 'custom' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="date"
                value={from}
                max={to || today}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent-soft)] dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-amber-300/35"
              />
              <span className="hidden text-[var(--muted-foreground)] sm:inline dark:text-white/35">
                →
              </span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(event) => setTo(event.target.value)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent-soft)] dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-amber-300/35"
              />
              <button
                type="button"
                onClick={applyCustom}
                className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-4 py-3 text-sm font-medium text-[var(--accent-soft)] transition hover:bg-[var(--accent)]/14 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
              >
                Apply
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
