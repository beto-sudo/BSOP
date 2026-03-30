import { Activity, BedDouble, Footprints, HeartPulse, MoonStar, Sparkles, Timer, Waves, Weight } from 'lucide-react';
import { HealthRangeSelector } from '@/components/health-range-selector';
import { SectionHeading, Shell, Surface } from '@/components/ui';
import { formatDurationHours, formatMetricValue, getHealthDashboardData, type HealthMetricRow, type HealthRangePreset } from '@/lib/health';

const VITAL_CONFIG: Record<string, { label: string; unit?: string; digits?: number; icon: typeof HeartPulse }> = {
  'Resting Heart Rate': { label: 'Resting HR', unit: 'bpm', digits: 0, icon: HeartPulse },
  'Heart Rate Variability': { label: 'HRV', unit: 'ms', digits: 0, icon: Activity },
  'Oxygen Saturation': { label: 'SpO2', unit: '%', digits: 0, icon: Waves },
  'Step Count': { label: 'Steps', digits: 0, icon: Footprints },
  'Apple Exercise Time': { label: 'Exercise', unit: 'min', digits: 0, icon: Timer },
  'Sleep Analysis': { label: 'Sleep', unit: 'hr', digits: 1, icon: MoonStar },
};

function groupDailyAverage(rows: HealthMetricRow[]) {
  const buckets = new Map<string, { total: number; count: number }>();

  rows.forEach((row) => {
    const key = row.date.slice(0, 10);
    const existing = buckets.get(key) ?? { total: 0, count: 0 };
    existing.total += row.value;
    existing.count += 1;
    buckets.set(key, existing);
  });

  return Array.from(buckets.entries()).map(([date, bucket]) => ({
    date,
    value: bucket.count ? bucket.total / bucket.count : 0,
  }));
}

function summarizeWindow(rows: HealthMetricRow[], days: number, endOffsetDays: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - endOffsetDays);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const filtered = rows.filter((row) => {
    const date = new Date(row.date).getTime();
    return date >= start.getTime() && date <= end.getTime();
  });

  if (!filtered.length) return null;
  const total = filtered.reduce((sum, row) => sum + row.value, 0);
  return total / filtered.length;
}

function DeltaPill({ current, previous, comparisonLabel }: { current: number | null; previous: number | null; comparisonLabel: string }) {
  if (current == null || previous == null) {
    return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/45">No comparison yet</span>;
  }

  const delta = current - previous;
  const up = delta >= 0;
  const tone = up ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/25 bg-rose-400/10 text-rose-200';

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {up ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} vs {comparisonLabel}
    </span>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 bg-black/10 px-5 py-8 text-center">
      <div className="text-sm font-medium text-white/78">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/45">{copy}</div>
    </div>
  );
}

function resolveRangeParams(searchParams?: Record<string, string | string[] | undefined>) {
  const rawRange = typeof searchParams?.range === 'string' ? searchParams.range : undefined;
  const from = typeof searchParams?.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams?.to === 'string' ? searchParams.to : undefined;

  if (from && to) {
    return { preset: 'custom' as const, from, to };
  }

  const allowedPresets: HealthRangePreset[] = ['today', '7d', '30d', '90d'];
  if (rawRange && allowedPresets.includes(rawRange as HealthRangePreset)) {
    return { preset: rawRange as HealthRangePreset };
  }

  return { preset: '7d' as const };
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedRange = resolveRangeParams(resolvedSearchParams);
  const { vitals, summaryMetrics, restingHrDaily, weightDaily, workouts, errors, range } = await getHealthDashboardData(requestedRange);
  const latestVitals = new Map<string, HealthMetricRow>();

  vitals.forEach((row) => {
    if (!latestVitals.has(row.metric_name)) latestVitals.set(row.metric_name, row);
  });

  const heartTrend = groupDailyAverage(restingHrDaily).slice(-Math.min(range.trendDays, 30));
  const heartTrendMax = Math.max(...heartTrend.map((item) => item.value), 1);
  const weightTrend = groupDailyAverage(weightDaily).slice(-Math.min(Math.max(range.trendDays, 30), 90));
  const weightMin = Math.min(...weightTrend.map((item) => item.value), Number.POSITIVE_INFINITY);
  const weightMax = Math.max(...weightTrend.map((item) => item.value), 0);
  const weightRange = Number.isFinite(weightMin) && weightMax > weightMin ? weightMax - weightMin : 1;
  const comparisonLabel = range.trendDays > 1 ? `prior ${range.trendDays}-day window` : 'previous day';

  const weeklySummary = [
    'Resting Heart Rate',
    'Heart Rate Variability',
    'Oxygen Saturation',
    'Step Count',
  ].map((metric) => {
    const rows = summaryMetrics.filter((row) => row.metric_name === metric);
    return {
      metric,
      current: summarizeWindow(rows, range.trendDays, 0),
      previous: range.trendDays > 1 ? summarizeWindow(rows, range.trendDays, range.trendDays) : null,
      unit: VITAL_CONFIG[metric]?.unit,
      digits: VITAL_CONFIG[metric]?.digits ?? 0,
      label: VITAL_CONFIG[metric]?.label ?? metric,
    };
  });

  return (
    <Shell>
      <div className="mb-6">
        <HealthRangeSelector initialPreset={range.preset} initialFrom={range.requestedFrom} initialTo={range.requestedTo} />
      </div>

      <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.02))] p-6 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_55%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionHeading
            eyebrow="Health"
            title="Personal health dashboard"
            copy="A calm operating view of daily vitals, heart trends, recovery signals, and recent training load from Apple Health exports flowing into Supabase."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['Live source', 'Supabase health tables'],
              ['Today status', vitals.length ? 'Data received' : 'No data yet'],
              ['Recent workouts', `${workouts.length} loaded`],
              ['Trend window', range.trendLabel],
            ].map(([label, value]) => (
              <Surface key={String(label)} className="border-amber-300/15 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-white/35">{label}</div>
                <div className="mt-3 text-lg font-semibold text-white">{value}</div>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      {errors.length ? (
        <Surface className="mt-6 border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">
          {errors[0]}
        </Surface>
      ) : null}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Today&apos;s vitals</h2>
            <p className="mt-2 text-sm text-white/55">Latest readings for the six signals you&apos;ll probably care about first. Sleep stays empty for now because Health Auto Export does not send Sleep Analysis data.</p>
          </div>
          <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200">Showing vitals from {range.vitalsLabel}</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(VITAL_CONFIG).map(([metricName, config]) => {
            const row = latestVitals.get(metricName);
            const Icon = config.icon;
            const isSleep = metricName === 'Sleep Analysis';
            return (
              <Surface key={metricName} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/35">{config.label}</div>
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-white">
                    {row ? (isSleep ? formatDurationHours(row.value) : formatMetricValue(row.value, config.digits ?? 0)) : '—'}
                  </div>
                  {config.unit ? <div className="pb-1 text-sm text-white/45">{config.unit}</div> : null}
                </div>
                <div className="mt-3 text-sm text-white/50">{row ? new Date(row.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : isSleep ? 'No Sleep Analysis arrives from the export app yet.' : 'Waiting for the first sync.'}</div>
              </Surface>
            );
          })}
        </div>
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <HeartPulse className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Heart rate trend</h2>
          </div>
          {heartTrend.length ? (
            <div>
              <div className="grid grid-cols-7 gap-3 items-end h-52">
                {heartTrend.map((item) => {
                  const height = Math.max((item.value / heartTrendMax) * 100, 12);
                  return (
                    <div key={item.date} className="flex h-full flex-col justify-end gap-3">
                      <div className="text-center text-xs text-white/45">{Math.round(item.value)}</div>
                      <div className="rounded-t-[1.5rem] bg-gradient-to-t from-amber-500 to-amber-300/90" style={{ height: `${height}%` }} />
                      <div className="text-center text-xs text-white/35">{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-white/55">Daily resting heart rate averages across {range.trendLabel.toLowerCase()}.</p>
            </div>
          ) : (
            <EmptyState title="No heart trend yet" copy="As soon as resting heart rate data is ingested, the selected trend window will render here." />
          )}
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Summary window</h2>
          </div>
          <div className="space-y-4">
            {weeklySummary.map((item) => (
              <div key={item.metric} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{item.label}</div>
                    <div className="mt-1 text-xs text-white/40">{range.trendDays}-day average</div>
                  </div>
                  <DeltaPill current={item.current} previous={item.previous} comparisonLabel={comparisonLabel} />
                </div>
                <div className="mt-4 flex items-end gap-2">
                  <div className="text-2xl font-semibold text-white">{item.current == null ? '—' : formatMetricValue(item.current, item.digits)}</div>
                  {item.unit ? <div className="pb-1 text-sm text-white/45">{item.unit}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <BedDouble className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Recent workouts</h2>
          </div>
          {workouts.length ? (
            <div className="space-y-4">
              {workouts.map((workout) => (
                <div key={`${workout.name}-${workout.start_time}`} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{workout.name}</div>
                      <div className="mt-2 text-sm text-white/45">{new Date(workout.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">{workout.source ?? 'Unknown source'}</div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    {[
                      ['Duration', workout.duration_minutes == null ? '—' : `${Math.round(workout.duration_minutes)} min`],
                      ['Energy', workout.energy_kcal == null ? '—' : `${Math.round(workout.energy_kcal)} kcal`],
                      ['Distance', workout.distance_km == null ? '—' : `${workout.distance_km.toFixed(1)} km`],
                      ['Avg HR', workout.heart_rate_avg == null ? '—' : `${Math.round(workout.heart_rate_avg)} bpm`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/6 bg-black/10 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</div>
                        <div className="mt-2 text-sm font-medium text-white/85">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No workouts yet" copy="Once workout exports arrive, the five latest sessions will show here with duration, energy, and heart rate." />
          )}
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <Weight className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Weight trend</h2>
          </div>
          {weightTrend.length ? (
            <div>
              <svg viewBox="0 0 320 180" className="w-full overflow-visible">
                <defs>
                  <linearGradient id="weight-line" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="rgba(251,191,36,0.45)" />
                    <stop offset="100%" stopColor="rgba(251,191,36,1)" />
                  </linearGradient>
                </defs>
                <path
                  d={weightTrend.map((point, index) => {
                    const x = (index / Math.max(weightTrend.length - 1, 1)) * 300 + 10;
                    const y = 150 - ((point.value - weightMin) / weightRange) * 110;
                    return `${index === 0 ? 'M' : 'L'} ${x} ${Number.isFinite(y) ? y : 95}`;
                  }).join(' ')}
                  fill="none"
                  stroke="url(#weight-line)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {weightTrend.map((point, index) => {
                  const x = (index / Math.max(weightTrend.length - 1, 1)) * 300 + 10;
                  const y = 150 - ((point.value - weightMin) / weightRange) * 110;
                  return <circle key={point.date} cx={x} cy={Number.isFinite(y) ? y : 95} r="3.5" fill="rgb(252 211 77)" />;
                })}
              </svg>
              <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                <span>{weightTrend[0]?.date}</span>
                <span>{weightTrend.at(-1)?.date}</span>
              </div>
            </div>
          ) : (
            <EmptyState title="No weight data yet" copy="If Body Mass is exported, a line trend will appear here automatically for the selected window." />
          )}
        </Surface>
      </section>
    </Shell>
  );
}
