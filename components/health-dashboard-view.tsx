'use client';

import { useMemo, useState } from 'react';
import { Activity, BedDouble, Footprints, HeartPulse, MoonStar, Waves, Weight, X } from 'lucide-react';
import { SectionHeading, Surface } from '@/components/ui';
import { formatDurationHours, formatMetricValue, type HealthDashboardRange, type HealthMetricRow, type HealthWorkoutRow } from '@/lib/health';

type Point = { date: string; value: number };

type MetricKey = 'sleep' | 'hr' | 'bp' | 'weight' | 'steps' | 'spo2' | 'hrv';

type HeroCard = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  helper: string;
  tone: string;
  icon: typeof HeartPulse;
};

type ChartConfig = {
  key: MetricKey;
  title: string;
  unit: string;
  tone: string;
  icon: typeof HeartPulse;
  kind?: 'line' | 'dual-line';
  data: Point[];
  secondaryData?: Point[];
  secondaryLabel?: string;
  primaryLabel?: string;
  emptyTitle: string;
  emptyCopy: string;
  formatter?: (value: number) => string;
};

type Props = {
  vitals: HealthMetricRow[];
  summaryMetrics: HealthMetricRow[];
  hrvDaily: HealthMetricRow[];
  spo2Daily: HealthMetricRow[];
  stepsDaily: HealthMetricRow[];
  bpSystolic: HealthMetricRow[];
  bpDiastolic: HealthMetricRow[];
  restingHrDaily: HealthMetricRow[];
  weightDaily: HealthMetricRow[];
  sleepDaily: HealthMetricRow[];
  workouts: HealthWorkoutRow[];
  errors: string[];
  range: HealthDashboardRange;
};

const TONES = {
  sleep: {
    icon: 'border-indigo-400/25 bg-indigo-400/12 text-indigo-200',
    line: '#a78bfa',
    lineSoft: 'rgba(167,139,250,0.35)',
    dot: '#c4b5fd',
    badge: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200',
  },
  hr: {
    icon: 'border-rose-400/25 bg-rose-400/12 text-rose-200',
    line: '#fb7185',
    lineSoft: 'rgba(251,113,133,0.35)',
    dot: '#fda4af',
    badge: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  },
  bp: {
    icon: 'border-blue-400/25 bg-blue-400/12 text-blue-200',
    line: '#60a5fa',
    lineSoft: 'rgba(96,165,250,0.35)',
    dot: '#93c5fd',
    badge: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    secondary: '#38bdf8',
    secondarySoft: 'rgba(56,189,248,0.35)',
    secondaryDot: '#67e8f9',
  },
  spo2: {
    icon: 'border-cyan-400/25 bg-cyan-400/12 text-cyan-200',
    line: '#22d3ee',
    lineSoft: 'rgba(34,211,238,0.35)',
    dot: '#67e8f9',
    badge: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  },
  steps: {
    icon: 'border-green-400/25 bg-green-400/12 text-green-200',
    line: '#4ade80',
    lineSoft: 'rgba(74,222,128,0.35)',
    dot: '#86efac',
    badge: 'border-green-400/20 bg-green-400/10 text-green-200',
  },
  weight: {
    icon: 'border-orange-400/25 bg-orange-400/12 text-orange-200',
    line: '#f59e0b',
    lineSoft: 'rgba(245,158,11,0.35)',
    dot: '#fbbf24',
    badge: 'border-orange-400/20 bg-orange-400/10 text-orange-200',
  },
  hrv: {
    icon: 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200',
    line: '#34d399',
    lineSoft: 'rgba(52,211,153,0.35)',
    dot: '#6ee7b7',
    badge: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  },
} as const;

function groupDailyAverage(rows: HealthMetricRow[]) {
  const buckets = new Map<string, { total: number; count: number }>();

  rows.forEach((row) => {
    const key = row.date.slice(0, 10);
    const existing = buckets.get(key) ?? { total: 0, count: 0 };
    existing.total += row.value;
    existing.count += 1;
    buckets.set(key, existing);
  });

  return Array.from(buckets.entries())
    .map(([date, bucket]) => ({
      date,
      value: bucket.count ? bucket.total / bucket.count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildLinePath(trend: Point[], min: number, range: number, width = 320, height = 180, padding = 14) {
  return trend
    .map((point, index) => {
      const x = (index / Math.max(trend.length - 1, 1)) * (width - padding * 2) + padding;
      const y = height - 28 - ((point.value - min) / range) * (height - 52);
      return `${index === 0 ? 'M' : 'L'} ${x} ${Number.isFinite(y) ? y : height / 2}`;
    })
    .join(' ');
}

function getStats(points: Point[]) {
  if (!points.length) return null;
  const values = points.map((point) => point.value);
  const latest = values.at(-1) ?? null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { latest, avg, min, max };
}

function getDelta(points: Point[]) {
  if (points.length < 2) return null;
  const midpoint = Math.floor(points.length / 2);
  const current = points.slice(midpoint);
  const previous = points.slice(0, midpoint);
  if (!current.length || !previous.length) return null;
  const currentAvg = current.reduce((sum, point) => sum + point.value, 0) / current.length;
  const previousAvg = previous.reduce((sum, point) => sum + point.value, 0) / previous.length;
  return currentAvg - previousAvg;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 bg-black/10 px-5 py-8 text-center">
      <div className="text-sm font-medium text-white/78">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/45">{copy}</div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-2 text-sm font-medium text-white/90">{value}</div>
    </div>
  );
}

function TrendSvg({ config, expanded = false }: { config: ChartConfig; expanded?: boolean }) {
  const primaryValues = config.data.map((point) => point.value);
  const secondaryValues = config.secondaryData?.map((point) => point.value) ?? [];
  const allValues = [...primaryValues, ...secondaryValues];
  const min = Math.min(...allValues, Number.POSITIVE_INFINITY);
  const max = Math.max(...allValues, 0);
  const range = Number.isFinite(min) && max > min ? max - min : 1;
  const tone = TONES[config.key];
  const width = expanded ? 900 : 320;
  const height = expanded ? 360 : 180;
  const strokeWidth = expanded ? 2 : 1.5;
  const dotRadius = expanded ? 2.5 : 2;

  if (!config.data.length) {
    return <EmptyState title={config.emptyTitle} copy={config.emptyCopy} />;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id={`${config.key}-line-${expanded ? 'full' : 'card'}`} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={tone.lineSoft} />
            <stop offset="100%" stopColor={tone.line} />
          </linearGradient>
          {config.secondaryData?.length ? (
            <linearGradient id={`${config.key}-secondary-${expanded ? 'full' : 'card'}`} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor={config.key === 'bp' ? TONES.bp.secondarySoft : tone.lineSoft} />
              <stop offset="100%" stopColor={config.key === 'bp' ? TONES.bp.secondary : tone.line} />
            </linearGradient>
          ) : null}
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => {
          const y = height - 28 - fraction * (height - 52);
          return <line key={fraction} x1="14" x2={width - 14} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
        })}
        <path d={buildLinePath(config.data, min, range, width, height)} fill="none" stroke={`url(#${config.key}-line-${expanded ? 'full' : 'card'})`} strokeWidth={strokeWidth} strokeLinecap="round" />
        {config.secondaryData?.length ? (
          <path d={buildLinePath(config.secondaryData, min, range, width, height)} fill="none" stroke={`url(#${config.key}-secondary-${expanded ? 'full' : 'card'})`} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.95" />
        ) : null}
        {config.data.map((point, index) => {
          const x = (index / Math.max(config.data.length - 1, 1)) * (width - 28) + 14;
          const y = height - 28 - ((point.value - min) / range) * (height - 52);
          return <circle key={`${config.key}-${point.date}`} cx={x} cy={Number.isFinite(y) ? y : height / 2} r={dotRadius} fill={tone.dot} />;
        })}
        {config.secondaryData?.map((point, index) => {
          const x = (index / Math.max(config.secondaryData!.length - 1, 1)) * (width - 28) + 14;
          const y = height - 28 - ((point.value - min) / range) * (height - 52);
          return <circle key={`${config.key}-secondary-${point.date}`} cx={x} cy={Number.isFinite(y) ? y : height / 2} r={dotRadius} fill={config.key === 'bp' ? TONES.bp.secondaryDot : tone.dot} />;
        })}
      </svg>
      <div className="mt-4 flex items-center justify-between text-xs text-white/45">
        <span>{formatDateLabel(config.data[0]?.date ?? '')}</span>
        <span>{formatDateLabel(config.data.at(-1)?.date ?? '')}</span>
      </div>
      {config.secondaryData?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.line }} />
            <span>{config.primaryLabel ?? config.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.key === 'bp' ? TONES.bp.secondary : tone.dot }} />
            <span>{config.secondaryLabel ?? 'Comparison'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TrendCard({ config, onExpand }: { config: ChartConfig; onExpand: () => void }) {
  const stats = getStats(config.data);
  const latestLabel = stats?.latest == null ? '—' : (config.formatter ? config.formatter(stats.latest) : formatMetricValue(stats.latest, config.unit === 'hr' ? 1 : 0));
  const tone = TONES[config.key];
  const Icon = config.icon;

  return (
    <button type="button" onClick={onExpand} className="text-left">
      <Surface className="h-full p-6 transition hover:border-white/15 hover:bg-white/[0.06]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className={`rounded-2xl border p-3 ${tone.icon}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{config.title}</h2>
              <p className="mt-1 text-xs text-white/45">Click to expand</p>
            </div>
          </div>
        </div>
        {config.data.length ? (
          <>
            <div className="mb-4 flex items-end gap-2">
              <div className="text-2xl font-semibold text-white">{latestLabel}</div>
              <div className="pb-1 text-sm text-white/45">{config.unit}</div>
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

function ChartModal({ config, onClose, rangeLabel }: { config: ChartConfig | null; onClose: () => void; rangeLabel: string }) {
  if (!config) return null;
  const stats = getStats(config.data);
  const delta = getDelta(config.data);
  const format = (value: number | null | undefined) => {
    if (value == null) return '—';
    if (config.formatter) return config.formatter(value);
    return formatMetricValue(value, config.unit === 'hr' ? 1 : 0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm">
      <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto w-full max-w-7xl">
          <Surface className="min-h-[calc(100vh-4rem)] p-6 sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/35">Expanded trend</div>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{config.title}</h2>
                <p className="mt-2 text-sm text-white/55">{rangeLabel} • larger view with quick stats</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/70 transition hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatPill label="Latest" value={`${format(stats?.latest)} ${config.unit}`} />
              <StatPill label="Average" value={`${format(stats?.avg)} ${config.unit}`} />
              <StatPill label="Min" value={`${format(stats?.min)} ${config.unit}`} />
              <StatPill label="Max" value={`${format(stats?.max)} ${config.unit}`} />
              <StatPill label="Delta" value={delta == null ? '—' : `${delta >= 0 ? '+' : ''}${formatMetricValue(delta, config.unit === 'hr' ? 1 : 0)} ${config.unit}`} />
            </div>

            <div className="rounded-[2rem] border border-white/8 bg-black/20 p-4 sm:p-6">
              <TrendSvg config={config} expanded />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export function HealthDashboardView({
  vitals,
  summaryMetrics,
  hrvDaily,
  spo2Daily,
  stepsDaily,
  bpSystolic,
  bpDiastolic,
  restingHrDaily,
  weightDaily,
  sleepDaily,
  workouts,
  errors,
  range,
}: Props) {
  const [selectedChart, setSelectedChart] = useState<MetricKey | null>(null);

  const latestVitals = useMemo(() => {
    const map = new Map<string, HealthMetricRow>();
    vitals.forEach((row) => {
      if (!map.has(row.metric_name)) map.set(row.metric_name, row);
    });
    return map;
  }, [vitals]);

  const heartTrend = useMemo(() => groupDailyAverage(restingHrDaily).slice(-range.trendDays), [restingHrDaily, range.trendDays]);
  const bpSystolicTrend = useMemo(() => groupDailyAverage(bpSystolic).slice(-range.trendDays), [bpSystolic, range.trendDays]);
  const bpDiastolicTrend = useMemo(() => groupDailyAverage(bpDiastolic).slice(-range.trendDays), [bpDiastolic, range.trendDays]);
  const weightTrend = useMemo(() => groupDailyAverage(weightDaily).slice(-range.trendDays), [weightDaily, range.trendDays]);
  const stepsTrend = useMemo(() => groupDailyAverage(stepsDaily).slice(-range.trendDays), [stepsDaily, range.trendDays]);
  const spo2Trend = useMemo(() => groupDailyAverage(spo2Daily).slice(-range.trendDays), [spo2Daily, range.trendDays]);
  const hrvTrend = useMemo(() => groupDailyAverage(hrvDaily).slice(-range.trendDays), [hrvDaily, range.trendDays]);
  const sleepTrend = useMemo(() => groupDailyAverage(sleepDaily).slice(-range.trendDays), [sleepDaily, range.trendDays]);

  const sleep7dAverage = useMemo(() => summarizeWindow(summaryMetrics.filter((row) => row.metric_name === 'Sleep Analysis'), 7, 0), [summaryMetrics]);
  const sleep30dAverage = useMemo(() => summarizeWindow(summaryMetrics.filter((row) => row.metric_name === 'Sleep Analysis'), Math.min(30, range.trendDays), 0), [summaryMetrics, range.trendDays]);
  const weight7dAverage = useMemo(() => summarizeWindow(summaryMetrics.filter((row) => row.metric_name === 'Body Mass'), 7, 0), [summaryMetrics]);
  const hr7dAverage = useMemo(() => summarizeWindow(summaryMetrics.filter((row) => row.metric_name === 'Resting Heart Rate'), 7, 0), [summaryMetrics]);
  const steps7dAverage = useMemo(() => summarizeWindow(summaryMetrics.filter((row) => row.metric_name === 'Step Count'), 7, 0), [summaryMetrics]);

  const workoutSummary = useMemo(() => {
    const total = workouts.length;
    const duration = workouts.reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0);
    const energy = workouts.reduce((sum, workout) => sum + (workout.energy_kcal ?? 0), 0);
    const distance = workouts.reduce((sum, workout) => sum + (workout.distance_km ?? 0), 0);
    const mixMap = new Map<string, number>();
    workouts.forEach((workout) => {
      mixMap.set(workout.name, (mixMap.get(workout.name) ?? 0) + 1);
    });
    const mix = Array.from(mixMap.entries()).sort((a, b) => b[1] - a[1]);
    return { total, duration, energy, distance, mix };
  }, [workouts]);

  const latestSleep = latestVitals.get('Sleep Analysis');
  const latestHr = latestVitals.get('Resting Heart Rate');
  const latestSpo2 = latestVitals.get('Oxygen Saturation');
  const latestSteps = latestVitals.get('Step Count');
  const latestWeight = latestVitals.get('Body Mass');
  const latestBpSys = latestVitals.get('Blood Pressure Systolic');
  const latestBpDia = latestVitals.get('Blood Pressure Diastolic');

  const heroCards: HeroCard[] = [
    {
      key: 'sleep',
      label: 'Sleep',
      value: latestSleep ? formatDurationHours(latestSleep.value) : '—',
      unit: 'hr',
      helper: latestSleep && sleep7dAverage != null ? `${(latestSleep.value - sleep7dAverage) >= 0 ? '+' : ''}${formatDurationHours(latestSleep.value - sleep7dAverage)}h vs 7d avg` : 'Waiting for sleep data',
      tone: TONES.sleep.icon,
      icon: MoonStar,
    },
    {
      key: 'hr',
      label: 'Resting HR',
      value: latestHr ? formatMetricValue(latestHr.value) : '—',
      unit: 'bpm',
      helper: latestHr && hr7dAverage != null ? `${latestHr.value >= hr7dAverage ? '+' : ''}${formatMetricValue(latestHr.value - hr7dAverage)} vs 7d avg` : 'Waiting for HR data',
      tone: TONES.hr.icon,
      icon: HeartPulse,
    },
    {
      key: 'bp',
      label: 'Blood Pressure',
      value: latestBpSys && latestBpDia ? `${formatMetricValue(latestBpSys.value)}/${formatMetricValue(latestBpDia.value)}` : '—',
      unit: 'mmHg',
      helper: latestBpSys ? new Date(latestBpSys.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Waiting for BP data',
      tone: TONES.bp.icon,
      icon: HeartPulse,
    },
    {
      key: 'spo2',
      label: 'SpO2',
      value: latestSpo2 ? formatMetricValue(latestSpo2.value) : '—',
      unit: '%',
      helper: latestSpo2 ? `Latest reading ${new Date(latestSpo2.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Waiting for SpO2 data',
      tone: TONES.spo2.icon,
      icon: Waves,
    },
    {
      key: 'weight',
      label: 'Weight',
      value: latestWeight ? formatMetricValue(latestWeight.value, 1) : '—',
      unit: latestWeight?.unit ?? '',
      helper: latestWeight && weight7dAverage != null ? `${latestWeight.value >= weight7dAverage ? '+' : ''}${formatMetricValue(latestWeight.value - weight7dAverage, 1)} vs 7d avg` : 'Waiting for weight data',
      tone: TONES.weight.icon,
      icon: Weight,
    },
    {
      key: 'steps',
      label: 'Steps',
      value: latestSteps ? formatMetricValue(latestSteps.value) : '—',
      unit: '',
      helper: latestSteps && steps7dAverage != null ? `${latestSteps.value >= steps7dAverage ? '+' : ''}${formatMetricValue(latestSteps.value - steps7dAverage)} vs 7d avg` : 'Waiting for steps data',
      tone: TONES.steps.icon,
      icon: Footprints,
    },
  ];

  const chartConfigs: ChartConfig[] = [
    {
      key: 'hr',
      title: 'Resting Heart Rate',
      unit: 'bpm',
      tone: 'hr',
      icon: HeartPulse,
      data: heartTrend,
      emptyTitle: 'No heart trend yet',
      emptyCopy: 'As soon as resting heart rate data is ingested, the selected trend window will render here.',
    },
    {
      key: 'bp',
      title: 'Blood Pressure',
      unit: 'mmHg',
      tone: 'bp',
      icon: HeartPulse,
      kind: 'dual-line',
      data: bpSystolicTrend,
      secondaryData: bpDiastolicTrend,
      primaryLabel: 'Systolic',
      secondaryLabel: 'Diastolic',
      emptyTitle: 'No blood pressure data yet',
      emptyCopy: 'Blood pressure readings will render here once systolic and diastolic exports arrive in this range.',
    },
    {
      key: 'weight',
      title: 'Weight',
      unit: latestWeight?.unit ?? 'kg',
      tone: 'weight',
      icon: Weight,
      data: weightTrend,
      emptyTitle: 'No weight data yet',
      emptyCopy: 'If Body Mass is exported, a line trend will appear here automatically for the selected window.',
      formatter: (value) => formatMetricValue(value, 1),
    },
    {
      key: 'steps',
      title: 'Steps',
      unit: 'steps',
      tone: 'steps',
      icon: Footprints,
      data: stepsTrend,
      emptyTitle: 'No steps trend yet',
      emptyCopy: 'Daily step count averages will appear here as soon as step data is available in this window.',
    },
    {
      key: 'spo2',
      title: 'SpO2',
      unit: '%',
      tone: 'spo2',
      icon: Waves,
      data: spo2Trend,
      emptyTitle: 'No SpO2 data yet',
      emptyCopy: 'Oxygen saturation exports will render here automatically after the next sync.',
    },
    {
      key: 'hrv',
      title: 'HRV',
      unit: 'ms',
      tone: 'hrv',
      icon: Activity,
      data: hrvTrend,
      emptyTitle: 'No HRV data yet',
      emptyCopy: 'Heart rate variability readings will show here once they arrive in the selected range.',
    },
  ];

  const selectedConfig = chartConfigs.find((chart) => chart.key === selectedChart) ?? null;
  const sleepBuckets = {
    short: sleepTrend.filter((point) => point.value < 6).length,
    ok: sleepTrend.filter((point) => point.value >= 6 && point.value < 7).length,
    good: sleepTrend.filter((point) => point.value >= 7 && point.value < 8).length,
    long: sleepTrend.filter((point) => point.value >= 8).length,
  };
  const sleepConsistency = sleepTrend.length ? Math.round((sleepTrend.filter((point) => point.value >= 7 && point.value <= 8.5).length / sleepTrend.length) * 100) : 0;

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] border border-indigo-300/15 bg-[linear-gradient(180deg,rgba(99,102,241,0.10),rgba(255,255,255,0.02))] p-6 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.16),transparent_55%)]" />
        <div className="relative">
          <SectionHeading
            eyebrow="Health"
            title="Vitales del día"
            copy="Lo primero: cómo amaneciste hoy. Recuperación, cardiovascular, oxigenación, peso y movimiento en una sola vista calmada."
          />
          <div className="-mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {heroCards.map((card) => {
              const Icon = card.icon;
              return (
                <Surface key={card.key} className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className={`rounded-2xl border p-3 ${card.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-xs uppercase tracking-[0.22em] text-white/35">{card.label}</div>
                  </div>
                  <div className="mt-6 flex items-end gap-2">
                    <div className="text-3xl font-semibold text-white">{card.value}</div>
                    {card.unit ? <div className="pb-1 text-sm text-white/45">{card.unit}</div> : null}
                  </div>
                  <div className="mt-3 text-sm text-white/55">{card.helper}</div>
                </Surface>
              );
            })}
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
            <h2 className="text-xl font-semibold text-white">Trends</h2>
            <p className="mt-2 text-sm text-white/55">{range.trendLabel} across the signals that matter most. All charts open fullscreen on click.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">{range.trendLabel}</div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {chartConfigs.map((config) => (
            <TrendCard key={config.key} config={config} onExpand={() => setSelectedChart(config.key)} />
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <div className={`rounded-2xl border p-3 ${TONES.sleep.icon}`}>
              <MoonStar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Sleep Analysis</h2>
              <p className="mt-1 text-sm text-white/45">Dedicated view for sleep duration and consistency.</p>
            </div>
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-4">
            <StatPill label="Last night" value={`${latestSleep ? formatDurationHours(latestSleep.value) : '—'} hr`} />
            <StatPill label="7d avg" value={`${sleep7dAverage == null ? '—' : formatDurationHours(sleep7dAverage)} hr`} />
            <StatPill label="30d avg" value={`${sleep30dAverage == null ? '—' : formatDurationHours(sleep30dAverage)} hr`} />
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
              emptyCopy: 'Sleep Analysis rows will render here automatically when they are present in the selected date range.',
              formatter: (value) => formatMetricValue(value, 1),
            }}
          />
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <BedDouble className="h-5 w-5 text-indigo-200" />
            <h2 className="text-lg font-semibold">7d average + duration mix</h2>
          </div>
          <div className="rounded-3xl border border-indigo-400/15 bg-indigo-400/8 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-white/35">Average sleep</div>
            <div className="mt-3 flex items-end gap-2">
              <div className="text-4xl font-semibold text-white">{sleep7dAverage == null ? '—' : formatDurationHours(sleep7dAverage)}</div>
              <div className="pb-1 text-sm text-white/45">hr</div>
            </div>
            <p className="mt-3 text-sm text-white/55">Useful anchor for the hero card and a quick sense of recovery baseline.</p>
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
                  <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                    <span>{label}</span>
                    <span>{count} nights</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8">
                    <div className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <BedDouble className="h-5 w-5 text-green-200" />
            <div>
              <h2 className="text-lg font-semibold">Workouts</h2>
              <p className="mt-1 text-sm text-white/45">Filtered by the active date range.</p>
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatPill label="Total" value={`${workoutSummary.total}`} />
            <StatPill label="Duration" value={`${Math.round(workoutSummary.duration)} min`} />
            <StatPill label="Distance" value={`${formatMetricValue(workoutSummary.distance, 1)} km`} />
            <StatPill label="Energy" value={`${Math.round(workoutSummary.energy)} kcal`} />
          </div>

          {workouts.length ? (
            <div className="space-y-4">
              {workouts.slice(0, 5).map((workout) => (
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
            <EmptyState title="No workouts in this range" copy="Once workout exports arrive inside the selected window, sessions will show here with duration, energy, distance, and heart rate." />
          )}
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <Activity className="h-5 w-5 text-green-200" />
            <h2 className="text-lg font-semibold">Workout mix</h2>
          </div>
          {workoutSummary.mix.length ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Top type</div>
                <div className="mt-2 text-2xl font-semibold text-white">{workoutSummary.mix[0]?.[0]}</div>
                <div className="mt-1 text-sm text-white/50">{workoutSummary.mix[0]?.[1]} sessions in {range.trendLabel.toLowerCase()}</div>
              </div>
              {workoutSummary.mix.slice(0, 6).map(([name, count]) => {
                const width = `${(count / Math.max(workoutSummary.total, 1)) * 100}%`;
                return (
                  <div key={name}>
                    <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                      <span>{name}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8">
                      <div className="h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No workout mix yet" copy="Workout distribution will appear here once the selected range includes sessions." />
          )}
        </Surface>
      </section>

      <ChartModal config={selectedConfig} onClose={() => setSelectedChart(null)} rangeLabel={range.trendLabel} />
    </>
  );
}
