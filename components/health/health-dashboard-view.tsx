'use client';

import { useMemo, useState } from 'react';
import { Activity, Footprints, HeartPulse, MoonStar, Waves, Weight } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatDurationHours, formatMetricValue } from '@/lib/health';
import { ChartModal } from './chart-modal';
import { groupDailyAverage, summarizeWindow } from './helpers';
import { HeroVitals } from './hero-vitals';
import { SleepSection } from './sleep-section';
import { TONES } from './tones';
import { TrendCard } from './trend-card';
import { WorkoutsSection } from './workouts-section';
import type { ChartConfig, HealthDashboardViewProps, HeroCard, MetricKey } from './types';

/**
 * Health dashboard orchestrator. Derives the hero-card / chart-config arrays
 * and the sleep & workout aggregates from props, then hands them to the
 * section components. Only local state is the currently-expanded chart.
 */
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
}: HealthDashboardViewProps) {
  const [selectedChart, setSelectedChart] = useState<MetricKey | null>(null);

  const latestVitals = useMemo(() => {
    const map = new Map<string, typeof vitals[number]>();
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
      <HeroVitals heroCards={heroCards} />

      {errors.length ? (
        <Surface className="mt-6 border-amber-300/30 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/8 dark:text-amber-100">
          {errors[0]}
        </Surface>
      ) : null}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text)] dark:text-white">Trends</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">{range.trendLabel} across the signals that matter most. All charts open fullscreen on click.</p>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] dark:border-white/10 dark:bg-white/5 dark:text-white/70">{range.trendLabel}</div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {chartConfigs.map((config) => (
            <TrendCard key={config.key} config={config} onExpand={() => setSelectedChart(config.key)} />
          ))}
        </div>
      </section>

      <SleepSection
        latestSleep={latestSleep}
        sleep7dAverage={sleep7dAverage}
        sleep30dAverage={sleep30dAverage}
        sleepConsistency={sleepConsistency}
        sleepTrend={sleepTrend}
        sleepBuckets={sleepBuckets}
      />

      <WorkoutsSection workouts={workouts} workoutSummary={workoutSummary} rangeLabel={range.trendLabel} />

      <ChartModal config={selectedConfig} onClose={() => setSelectedChart(null)} rangeLabel={range.trendLabel} />
    </>
  );
}
