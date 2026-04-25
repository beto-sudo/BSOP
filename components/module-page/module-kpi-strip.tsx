'use client';
import { type ReactNode } from 'react';

export interface ModuleKpi {
  key: string;
  label: ReactNode;
  value: ReactNode;
  /** Optional small icon to render left of the label. */
  icon?: ReactNode;
  /** Optional accent class for value (e.g. 'text-amber-500'). */
  valueClassName?: string;
}

export interface ModuleKpiStripProps {
  stats: ReadonlyArray<ModuleKpi>;
  /** Default 4. KPIs >5 should be re-thought per ADR-004 R3, not crammed in. */
  cols?: 2 | 3 | 4 | 5;
}

const COL_CLASS: Record<NonNullable<ModuleKpiStripProps['cols']>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
};

export function ModuleKpiStrip({ stats, cols = 4 }: ModuleKpiStripProps) {
  if (stats.length === 0) return null;
  if (stats.length > 5 && process.env.NODE_ENV !== 'production') {
    // Per ADR-004 R3: more than 5 KPIs is a product decision, not a layout problem.
    console.warn(
      `[ModuleKpiStrip] ${stats.length} KPIs received; rendering first 5. ` +
        `See ADR-004 R3 — split into a separate dimension strip or re-prioritize.`
    );
  }
  const visible = stats.slice(0, 5);
  return (
    <div className={['grid gap-3', COL_CLASS[cols]].join(' ')}>
      {visible.map((s) => (
        <div key={s.key} className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {s.icon}
            {s.label}
          </div>
          <div
            className={['mt-1 text-2xl font-semibold tabular-nums', s.valueClassName ?? ''].join(
              ' '
            )}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
