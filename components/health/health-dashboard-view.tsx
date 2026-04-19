'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Droplets,
  Footprints,
  HeartPulse,
  MoonStar,
  Percent,
  Scale,
  Waves,
  Weight,
} from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatDurationHours, formatMetricValue } from '@/lib/health';
import { ChartModal } from './chart-modal';
import {
  computePrevWindowDelta,
  groupDailyAverage,
  groupDailySleep,
  groupDailyWeightConnect,
  groupSleepStages,
  isStaleSince,
  summarizeDailyWindow,
} from './helpers';
import { HeroVitals } from './hero-vitals';
import { SleepSection } from './sleep-section';
import { TONES } from './tones';
import { TrendCard } from './trend-card';
import { WorkoutsSection } from './workouts-section';
import type { ChartConfig, HealthDashboardViewProps, HeroCard, MetricKey } from './types';

function formatDelta(value: number, digits = 1) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatMetricValue(value, digits)}`;
}

function buildDeltaHelper(
  points: { date: string; value: number }[],
  digits = 1,
  unit?: string,
  invertTone = false
) {
  const delta = computePrevWindowDelta(points, 7, 23);
  if (!delta) return 'Sin base para comparar 7d vs prev 23d';
  const suffix = unit ? ` ${unit}` : '';
  const directionHint = invertTone
    ? delta.delta > 0
      ? '↑'
      : delta.delta < 0
        ? '↓'
        : '→'
    : delta.delta > 0
      ? '↑'
      : delta.delta < 0
        ? '↓'
        : '→';
  return `7d ${formatMetricValue(delta.current, digits)}${suffix} · Δ ${formatDelta(delta.delta, digits)} vs prev 23d ${directionHint}`;
}

const STALE_DAYS = 3;

export function HealthDashboardView({
  vitals,
  hrvDaily,
  spo2Daily,
  stepsDaily,
  bpSystolic,
  bpDiastolic,
  restingHrDaily,
  weightDaily,
  sleepDaily,
  bodyFatDaily,
  bmiDaily,
  workouts,
  errors,
  range,
}: HealthDashboardViewProps) {
  const [selectedChart, setSelectedChart] = useState<MetricKey | null>(null);

  const latestVitals = useMemo(() => {
    const map = new Map<string, (typeof vitals)[number]>();
    vitals.forEach((row) => {
      if (!map.has(row.metric_name)) map.set(row.metric_name, row);
    });
    return map;
  }, [vitals]);

  const heartTrendAll = useMemo(() => groupDailyAverage(restingHrDaily), [restingHrDaily]);
  const heartTrend = useMemo(
    () => heartTrendAll.slice(-range.trendDays),
    [heartTrendAll, range.trendDays]
  );
  const bpSystolicTrend = useMemo(
    () => groupDailyAverage(bpSystolic).slice(-range.trendDays),
    [bpSystolic, range.trendDays]
  );
  const bpDiastolicTrend = useMemo(
    () => groupDailyAverage(bpDiastolic).slice(-range.trendDays),
    [bpDiastolic, range.trendDays]
  );
  const weightDailyAll = useMemo(() => groupDailyWeightConnect(weightDaily), [weightDaily]);
  const weightTrend = useMemo(
    () => weightDailyAll.slice(-range.trendDays),
    [weightDailyAll, range.trendDays]
  );
  const stepsTrendAll = useMemo(() => groupDailyAverage(stepsDaily), [stepsDaily]);
  const stepsTrend = useMemo(
    () => stepsTrendAll.slice(-range.trendDays),
    [stepsTrendAll, range.trendDays]
  );
  const spo2TrendAll = useMemo(() => groupDailyAverage(spo2Daily), [spo2Daily]);
  const spo2Trend = useMemo(
    () => spo2TrendAll.slice(-range.trendDays),
    [spo2TrendAll, range.trendDays]
  );
  const hrvTrendAll = useMemo(() => groupDailyAverage(hrvDaily), [hrvDaily]);
  const hrvTrend = useMemo(
    () => hrvTrendAll.slice(-range.trendDays),
    [hrvTrendAll, range.trendDays]
  );
  const sleepDailyAll = useMemo(() => groupDailySleep(sleepDaily), [sleepDaily]);
  const sleepTrend = useMemo(
    () => sleepDailyAll.slice(-range.trendDays),
    [sleepDailyAll, range.trendDays]
  );
  const bodyFatTrendAll = useMemo(() => groupDailyAverage(bodyFatDaily), [bodyFatDaily]);
  const bodyFatTrend = useMemo(
    () => bodyFatTrendAll.slice(-range.trendDays),
    [bodyFatTrendAll, range.trendDays]
  );
  const bmiTrendAll = useMemo(() => groupDailyAverage(bmiDaily), [bmiDaily]);
  const bmiTrend = useMemo(
    () => bmiTrendAll.slice(-range.trendDays),
    [bmiTrendAll, range.trendDays]
  );

  const sleep7dAverage = useMemo(() => summarizeDailyWindow(sleepDailyAll, 7, 0), [sleepDailyAll]);
  const sleep30dAverage = useMemo(
    () => summarizeDailyWindow(sleepDailyAll, Math.min(30, range.trendDays), 0),
    [sleepDailyAll, range.trendDays]
  );

  const sleepStageAverages = useMemo(() => {
    if (!sleepDaily.length) return groupSleepStages([]);
    const maxDateMs = sleepDaily.reduce((max, row) => {
      const t = new Date(row.date).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (!maxDateMs) return groupSleepStages([]);
    const cutoff = maxDateMs - 7 * 86_400_000;
    const recent = sleepDaily.filter((row) => {
      const t = new Date(row.date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    return groupSleepStages(recent);
  }, [sleepDaily]);

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

  const latestSleepDaily = sleepDailyAll.at(-1) ?? null;
  const latestWeightDaily = weightDailyAll.at(-1) ?? null;
  const latestHr = latestVitals.get('Resting Heart Rate');
  const latestHrv = latestVitals.get('Heart Rate Variability');
  const latestBpSys = latestVitals.get('Blood Pressure Systolic');
  const latestBpDia = latestVitals.get('Blood Pressure Diastolic');
  const latestBodyFat = latestVitals.get('Body Fat Percentage');
  const latestBmi = latestVitals.get('Body Mass Index');

  const sleepStale = isStaleSince(latestSleepDaily?.date, STALE_DAYS);
  const hrStale = isStaleSince(latestHr?.date, STALE_DAYS);
  const hrvStale = isStaleSince(latestHrv?.date, STALE_DAYS);
  const bpStale = isStaleSince(latestBpSys?.date, 14);
  const bodyFatStale = isStaleSince(latestBodyFat?.date, STALE_DAYS);
  const weightStale = isStaleSince(latestWeightDaily?.date, STALE_DAYS);

  const heroCards: HeroCard[] = [
    {
      key: 'sleep',
      label: 'Sleep',
      value: latestSleepDaily ? formatDurationHours(latestSleepDaily.value) : '—',
      unit: 'hr',
      helper: buildDeltaHelper(sleepDailyAll, 1, 'h'),
      tone: TONES.sleep.icon,
      icon: MoonStar,
      stale: sleepStale.stale,
      staleLabel: sleepStale.daysAgo != null ? `${sleepStale.daysAgo}d atrás` : 'Sin datos',
    },
    {
      key: 'hr',
      label: 'Resting HR',
      value: latestHr ? formatMetricValue(latestHr.value) : '—',
      unit: 'bpm',
      helper: buildDeltaHelper(heartTrendAll, 1, 'bpm', true),
      tone: TONES.hr.icon,
      icon: HeartPulse,
      stale: hrStale.stale,
      staleLabel: hrStale.daysAgo != null ? `${hrStale.daysAgo}d atrás` : 'Sin datos',
    },
    {
      key: 'hrv',
      label: 'HRV',
      value: latestHrv ? formatMetricValue(latestHrv.value, 1) : '—',
      unit: 'ms',
      helper: buildDeltaHelper(hrvTrendAll, 1, 'ms'),
      tone: TONES.hrv.icon,
      icon: Activity,
      stale: hrvStale.stale,
      staleLabel: hrvStale.daysAgo != null ? `${hrvStale.daysAgo}d atrás` : 'Sin datos',
    },
    {
      key: 'bp',
      label: 'Blood Pressure',
      value:
        latestBpSys && latestBpDia
          ? `${formatMetricValue(latestBpSys.value)}/${formatMetricValue(latestBpDia.value)}`
          : '—',
      unit: 'mmHg',
      helper: latestBpSys
        ? new Date(latestBpSys.date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'Waiting for BP data',
      tone: TONES.bp.icon,
      icon: HeartPulse,
      stale: bpStale.stale,
      staleLabel: bpStale.daysAgo != null ? `${bpStale.daysAgo}d atrás` : 'Sin datos',
    },
    {
      key: 'bodyfat',
      label: 'Body Fat %',
      value: latestBodyFat ? formatMetricValue(latestBodyFat.value, 1) : '—',
      unit: '%',
      helper: buildDeltaHelper(bodyFatTrendAll, 1, '%', true),
      tone: TONES.bodyfat.icon,
      icon: Percent,
      stale: bodyFatStale.stale,
      staleLabel: bodyFatStale.daysAgo != null ? `${bodyFatStale.daysAgo}d atrás` : 'Sin datos',
    },
    {
      key: 'weight',
      label: 'Weight',
      value: latestWeightDaily ? formatMetricValue(latestWeightDaily.value, 1) : '—',
      unit: 'lb',
      helper: buildDeltaHelper(weightDailyAll, 1, 'lb', true),
      tone: TONES.weight.icon,
      icon: Weight,
      stale: weightStale.stale,
      staleLabel: weightStale.daysAgo != null ? `${weightStale.daysAgo}d atrás` : 'Sin datos',
    },
  ];

  const bmiLatestLabel = latestBmi
    ? `BMI ${formatMetricValue(latestBmi.value, 1)}`
    : 'BMI sin datos';
  const stepsLatest = latestVitals.get('Step Count');
  const stepsLatestLabel = stepsLatest
    ? `Última: ${formatMetricValue(stepsLatest.value)} pasos`
    : 'Steps sin datos recientes';
  const spo2Latest = latestVitals.get('Oxygen Saturation');
  const spo2LatestLabel = spo2Latest
    ? `Última: ${formatMetricValue(spo2Latest.value)}%`
    : 'SpO₂ sin datos recientes';

  const chartConfigs: ChartConfig[] = [
    {
      key: 'hr',
      title: 'Resting Heart Rate',
      unit: 'bpm',
      tone: 'hr',
      icon: HeartPulse,
      data: heartTrend,
      emptyTitle: 'No heart trend yet',
      emptyCopy:
        'As soon as resting heart rate data is ingested, the selected trend window will render here.',
    },
    {
      key: 'hrv',
      title: 'HRV',
      unit: 'ms',
      tone: 'hrv',
      icon: Activity,
      data: hrvTrend,
      emptyTitle: 'No HRV data yet',
      emptyCopy:
        'Heart rate variability readings will show here once they arrive in the selected range.',
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
      emptyCopy:
        'Blood pressure readings will render here once systolic and diastolic exports arrive in this range.',
    },
    {
      key: 'weight',
      title: 'Weight',
      unit: 'lb',
      tone: 'weight',
      icon: Weight,
      data: weightTrend,
      emptyTitle: 'No weight data yet',
      emptyCopy:
        'If Body Mass is exported, a line trend will appear here automatically for the selected window.',
      formatter: (value) => formatMetricValue(value, 1),
    },
    {
      key: 'bodyfat',
      title: 'Body Fat %',
      unit: '%',
      tone: 'bodyfat',
      icon: Percent,
      data: bodyFatTrend,
      emptyTitle: 'No body fat data yet',
      emptyCopy:
        'Body Fat % readings from the Garmin scale will render here once they sync into Apple Health.',
      formatter: (value) => formatMetricValue(value, 1),
    },
    {
      key: 'bmi',
      title: 'BMI',
      unit: '',
      tone: 'bmi',
      icon: Scale,
      data: bmiTrend,
      emptyTitle: 'No BMI data yet',
      emptyCopy: 'Body Mass Index rows will render here when they arrive in the selected range.',
      formatter: (value) => formatMetricValue(value, 1),
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
      key: 'steps',
      title: 'Steps',
      unit: 'steps',
      tone: 'steps',
      icon: Footprints,
      data: stepsTrend,
      emptyTitle: 'No steps trend yet',
      emptyCopy:
        'Daily step count averages will appear here as soon as step data is available in this window.',
    },
  ];

  const selectedConfig = chartConfigs.find((chart) => chart.key === selectedChart) ?? null;
  const sleepBuckets = {
    short: sleepTrend.filter((point) => point.value < 6).length,
    ok: sleepTrend.filter((point) => point.value >= 6 && point.value < 7).length,
    good: sleepTrend.filter((point) => point.value >= 7 && point.value < 8).length,
    long: sleepTrend.filter((point) => point.value >= 8).length,
  };
  const sleepConsistency = sleepTrend.length
    ? Math.round(
        (sleepTrend.filter((point) => point.value >= 7 && point.value <= 8.5).length /
          sleepTrend.length) *
          100
      )
    : 0;

  return (
    <>
      <HeroVitals heroCards={heroCards} />

      {errors.length ? (
        <Surface className="mt-6 border-amber-300/30 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/8 dark:text-amber-100">
          {errors[0]}
        </Surface>
      ) : null}

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Surface className="p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl border p-2 ${TONES.bmi.icon}`}>
              <Scale className="h-4 w-4" />
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
              Composición
            </div>
          </div>
          <div className="mt-4 text-2xl font-semibold text-[var(--text)] dark:text-white">
            {bmiLatestLabel}
          </div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            {latestBodyFat
              ? `Body Fat ${formatMetricValue(latestBodyFat.value, 1)}%`
              : 'Body Fat sin datos'}
          </div>
        </Surface>
        <Surface className="p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl border p-2 ${TONES.steps.icon}`}>
              <Footprints className="h-4 w-4" />
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
              Movimiento
            </div>
          </div>
          <div className="mt-4 text-2xl font-semibold text-[var(--text)] dark:text-white">
            {stepsLatestLabel}
          </div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            {buildDeltaHelper(stepsTrendAll, 0, 'pasos')}
          </div>
        </Surface>
        <Surface className="p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl border p-2 ${TONES.spo2.icon}`}>
              <Droplets className="h-4 w-4" />
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
              Oxigenación
            </div>
          </div>
          <div className="mt-4 text-2xl font-semibold text-[var(--text)] dark:text-white">
            {spo2LatestLabel}
          </div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            {buildDeltaHelper(spo2TrendAll, 1, '%')}
          </div>
        </Surface>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text)] dark:text-white">Trends</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
              {range.trendLabel} across the signals that matter most. All charts open fullscreen on
              click.
            </p>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] dark:border-white/10 dark:bg-white/5 dark:text-white/70">
            {range.trendLabel}
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {chartConfigs.map((config) => (
            <TrendCard
              key={config.key}
              config={config}
              onExpand={() => setSelectedChart(config.key)}
            />
          ))}
        </div>
      </section>

      <SleepSection
        latestSleep={latestSleepDaily}
        sleep7dAverage={sleep7dAverage}
        sleep30dAverage={sleep30dAverage}
        sleepConsistency={sleepConsistency}
        sleepTrend={sleepTrend}
        sleepBuckets={sleepBuckets}
        sleepStageAverages={sleepStageAverages}
      />

      <WorkoutsSection
        workouts={workouts}
        workoutSummary={workoutSummary}
        rangeLabel={range.trendLabel}
      />

      <ChartModal
        config={selectedConfig}
        onClose={() => setSelectedChart(null)}
        rangeLabel={range.trendLabel}
      />
    </>
  );
}
