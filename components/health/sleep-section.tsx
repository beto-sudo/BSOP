import { BedDouble, MoonStar } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatDurationHours, formatMetricValue } from '@/lib/health';
import { StatPill } from './stat-pill';
import { TONES } from './tones';
import { TrendSvg } from './trend-svg';
import type { Point } from './types';

type SleepBuckets = { short: number; ok: number; good: number; long: number };

export function SleepSection({
  latestSleep,
  sleep7dAverage,
  sleep30dAverage,
  sleepConsistency,
  sleepTrend,
  sleepBuckets,
}: {
  latestSleep: Point | null;
  sleep7dAverage: number | null;
  sleep30dAverage: number | null;
  sleepConsistency: number;
  sleepTrend: Point[];
  sleepBuckets: SleepBuckets;
}) {
  return (
    <section className="mt-10 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Surface className="p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
          <div className={`rounded-2xl border p-3 ${TONES.sleep.icon}`}>
            <MoonStar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Sleep Analysis</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
              Dedicated view for sleep duration and consistency.
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <StatPill
            label="Last night"
            value={`${latestSleep ? formatDurationHours(latestSleep.value) : '—'} hr`}
          />
          <StatPill
            label="7d avg"
            value={`${sleep7dAverage == null ? '—' : formatDurationHours(sleep7dAverage)} hr`}
          />
          <StatPill
            label="30d avg"
            value={`${sleep30dAverage == null ? '—' : formatDurationHours(sleep30dAverage)} hr`}
          />
          <StatPill label="Consistency" value={`${sleepConsistency || 0}% in target`} />
        </div>

        <TrendSvg
          config={{
            key: 'sleep',
            title: 'Sleep Analysis',
            unit: 'hr',
            tone: 'sleep',
            icon: MoonStar,
            data: sleepTrend,
            emptyTitle: 'No sleep data yet',
            emptyCopy:
              'Sleep Analysis rows will render here automatically when they are present in the selected date range.',
            formatter: (value) => formatMetricValue(value, 1),
          }}
        />
      </Surface>

      <Surface className="p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
          <BedDouble className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
          <h2 className="text-lg font-semibold">7d average + duration mix</h2>
        </div>
        <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-400/15 dark:bg-indigo-400/8">
          <div className="text-xs uppercase tracking-[0.22em] text-indigo-700/70 dark:text-white/35">
            Average sleep
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="text-4xl font-semibold text-[var(--text)] dark:text-white">
              {sleep7dAverage == null ? '—' : formatDurationHours(sleep7dAverage)}
            </div>
            <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">hr</div>
          </div>
          <p className="mt-3 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            Useful anchor for the hero card and a quick sense of recovery baseline.
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {[
            ['<6h', sleepBuckets.short],
            ['6–7h', sleepBuckets.ok],
            ['7–8h', sleepBuckets.good],
            ['8h+', sleepBuckets.long],
          ].map(([label, count]) => {
            const total = sleepTrend.length || 1;
            const width = `${Math.max((Number(count) / total) * 100, Number(count) ? 8 : 0)}%`;
            return (
              <div key={String(label)}>
                <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted-foreground)] dark:text-white/70">
                  <span>{label}</span>
                  <span>{count} nights</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-white/8">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                    style={{ width }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Surface>
    </section>
  );
}
