import { Surface } from '@/components/ui/surface';
import { formatMetricValue } from '@/lib/health';
import { EmptyState } from './empty-state';
import { getStats } from './helpers';
import { TONES } from './tones';
import { TrendSvg } from './trend-svg';
import type { ChartConfig } from './types';

export function TrendCard({ config, onExpand }: { config: ChartConfig; onExpand: () => void }) {
  const stats = getStats(config.data);
  const latestLabel =
    stats?.latest == null
      ? '—'
      : config.formatter
        ? config.formatter(stats.latest)
        : formatMetricValue(stats.latest, config.unit === 'hr' ? 1 : 0);
  const tone = TONES[config.key];
  const Icon = config.icon;

  return (
    <button type="button" onClick={onExpand} className="text-left">
      <Surface className="h-full p-6 transition hover:border-[var(--accent)]/20 hover:bg-[var(--panel)] dark:hover:border-white/15 dark:hover:bg-white/[0.06]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 text-[var(--text)] dark:text-white">
            <div className={`rounded-2xl border p-3 ${tone.icon}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{config.title}</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Click to expand
              </p>
            </div>
          </div>
        </div>
        {config.data.length ? (
          <>
            <div className="mb-4 flex items-end gap-2">
              <div className="text-2xl font-semibold text-[var(--text)] dark:text-white">
                {latestLabel}
              </div>
              <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                {config.unit}
              </div>
            </div>
            <TrendSvg config={config} />
          </>
        ) : (
          <EmptyState title={config.emptyTitle} copy={config.emptyCopy} />
        )}
      </Surface>
    </button>
  );
}
