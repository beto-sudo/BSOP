import { X } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue } from '@/lib/health';
import { getDelta, getStats } from './helpers';
import { StatPill } from './stat-pill';
import { TrendSvg } from './trend-svg';
import type { ChartConfig } from './types';

export function ChartModal({
  config,
  onClose,
  rangeLabel,
}: {
  config: ChartConfig | null;
  onClose: () => void;
  rangeLabel: string;
}) {
  if (!config) return null;
  const stats = getStats(config.data);
  const delta = getDelta(config.data);
  const format = (value: number | null | undefined) => {
    if (value == null) return '—';
    if (config.formatter) return config.formatter(value);
    return formatMetricValue(value, config.unit === 'hr' ? 1 : 0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm dark:bg-slate-950/90">
      <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto w-full max-w-7xl">
          <Surface className="min-h-[calc(100vh-4rem)] p-6 sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted-foreground)] dark:text-white/35">
                  Expanded trend
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)] sm:text-3xl dark:text-white">
                  {config.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
                  {rangeLabel} • larger view with quick stats
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[var(--muted-foreground)] transition hover:bg-[var(--card)] hover:text-[var(--text)] dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatPill label="Latest" value={`${format(stats?.latest)} ${config.unit}`} />
              <StatPill label="Average" value={`${format(stats?.avg)} ${config.unit}`} />
              <StatPill label="Min" value={`${format(stats?.min)} ${config.unit}`} />
              <StatPill label="Max" value={`${format(stats?.max)} ${config.unit}`} />
              <StatPill
                label="Delta"
                value={
                  delta == null
                    ? '—'
                    : `${delta >= 0 ? '+' : ''}${formatMetricValue(delta, config.unit === 'hr' ? 1 : 0)} ${config.unit}`
                }
              />
            </div>

            <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-6 dark:border-white/8 dark:bg-black/20">
              <TrendSvg config={config} expanded />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
