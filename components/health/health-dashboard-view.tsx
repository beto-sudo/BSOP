'use client';

import { useMemo } from 'react';
import { HeartPulse, MoonStar, Activity, Thermometer } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatDurationHours, formatMetricValue } from '@/lib/health';
import { ActivitySection } from './activity-section';
import { BodyCompositionSection } from './body-composition-section';
import { CardiacFitnessSection } from './cardiac-fitness-section';
import {
  buildDeltaHelper,
  formatDaysAgo,
  getRecoveryFlag,
  groupDailyAverage,
  groupDailySleep,
  isStaleSince,
} from './helpers';
import { HeroVitals } from './hero-vitals';
import { PostBypassTimeline } from './post-bypass-timeline';
import { SleepSection } from './sleep-section';
import { TONES } from './tones';
import { VitalsRespirationSection } from './vitals-respiration-section';
import { WorkoutsSection } from './workouts-section';
import type { HealthDashboardViewProps, HeroCard } from './types';

export function HealthDashboardView({
  latest,
  heroSleepStages,
  heroHrv,
  heroRestingHr,
  sleepStages,
  hrv,
  restingHr,
  wristTemp,
  walkingHrAvg,
  vo2Max,
  sixMinWalk,
  zones,
  workouts,
  weight,
  bodyFat,
  bmi,
  leanMass,
  bpSystolic,
  bpDiastolic,
  spo2,
  respiratoryRate,
  breathing,
  steps,
  flights,
  distance,
  activeEnergy,
  basalEnergy,
  exerciseTime,
  standTime,
  standHours,
  daylight,
  timeline,
  errors,
  range,
}: HealthDashboardViewProps) {
  const heroSleepDaily = useMemo(() => groupDailySleep(heroSleepStages), [heroSleepStages]);
  const hrvDaily = useMemo(() => groupDailyAverage(hrv), [hrv]);
  const restingHrDaily = useMemo(() => groupDailyAverage(restingHr), [restingHr]);
  const wristTempDaily = useMemo(() => groupDailyAverage(wristTemp), [wristTemp]);
  // 14-day windows feed the recovery-flag computation regardless of the
  // active range, so the flag fires even when the user is looking at "today".
  const heroHrvDaily = useMemo(() => groupDailyAverage(heroHrv), [heroHrv]);
  const heroRestingHrDaily = useMemo(() => groupDailyAverage(heroRestingHr), [heroRestingHr]);
  const hrvFlag = useMemo(
    () => getRecoveryFlag(heroHrvDaily, { type: 'drop', threshold: 0.1 }),
    [heroHrvDaily]
  );
  const rhrFlag = useMemo(
    () => getRecoveryFlag(heroRestingHrDaily, { type: 'rise', thresholdAbs: 5 }),
    [heroRestingHrDaily]
  );
  const workoutSummary = useMemo(() => {
    const mixMap = new Map<string, number>();
    workouts.forEach((w) => mixMap.set(w.name, (mixMap.get(w.name) ?? 0) + 1));
    return {
      total: workouts.length,
      duration: workouts.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0),
      energy: workouts.reduce((sum, w) => sum + (w.energy_kcal ?? 0), 0),
      distance: workouts.reduce((sum, w) => sum + (w.distance_km ?? 0), 0),
      mix: Array.from(mixMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [workouts]);

  const latestSleep = heroSleepDaily.at(-1) ?? null;
  const latestHrv = latest['Heart Rate Variability'] ?? null;
  const latestRestHr = latest['Resting Heart Rate'] ?? null;
  const latestTemp = latest['Apple Sleeping Wrist Temperature'] ?? null;

  const sleepStale = isStaleSince(latestSleep?.date, 2);
  const hrvStale = isStaleSince(latestHrv?.date, 2);
  const restHrStale = isStaleSince(latestRestHr?.date, 2);
  const tempStale = isStaleSince(latestTemp?.date, 3);

  const heroCards: HeroCard[] = [
    {
      key: 'sleep',
      label: 'Sleep',
      value: latestSleep ? formatDurationHours(latestSleep.value) : '—',
      unit: 'hr',
      helper: buildDeltaHelper(heroSleepDaily, { days: 7, digits: 1, unit: 'h' }),
      tone: TONES.sleep.icon,
      icon: MoonStar,
      stale: sleepStale.stale,
      staleLabel: formatDaysAgo(sleepStale.daysAgo),
    },
    {
      key: 'hrv',
      label: 'HRV',
      value: latestHrv ? formatMetricValue(latestHrv.value, 1) : '—',
      unit: 'ms',
      helper: buildDeltaHelper(hrvDaily, { days: 7, digits: 1, unit: 'ms' }),
      tone: TONES.hrv.icon,
      icon: Activity,
      stale: hrvStale.stale,
      staleLabel: formatDaysAgo(hrvStale.daysAgo),
      flag: hrvFlag ?? undefined,
    },
    {
      key: 'rhr',
      label: 'Resting HR',
      value: latestRestHr ? formatMetricValue(latestRestHr.value, 0) : '—',
      unit: 'bpm',
      helper: buildDeltaHelper(restingHrDaily, {
        days: 7,
        digits: 1,
        unit: 'bpm',
        invertTone: true,
      }),
      tone: TONES.hr.icon,
      icon: HeartPulse,
      stale: restHrStale.stale,
      staleLabel: formatDaysAgo(restHrStale.daysAgo),
      flag: rhrFlag ?? undefined,
    },
    {
      key: 'temp',
      label: 'Wrist Temp',
      value: latestTemp ? formatMetricValue(latestTemp.value, 1) : '—',
      unit: '°F',
      helper: buildDeltaHelper(wristTempDaily, { days: 7, digits: 1, unit: '°F' }),
      tone: TONES.temp.icon,
      icon: Thermometer,
      stale: tempStale.stale,
      staleLabel: formatDaysAgo(tempStale.daysAgo),
    },
  ];

  return (
    <>
      <HeroVitals heroCards={heroCards} />

      {errors.length ? (
        <Surface className="mt-6 border-amber-300/30 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/8 dark:text-amber-100">
          {errors[0]}
        </Surface>
      ) : null}

      <CardiacFitnessSection
        walkingHrAvg={walkingHrAvg}
        vo2Max={vo2Max}
        sixMinWalk={sixMinWalk}
        zones={zones}
        rangeLabel={range.trendLabel}
      />

      <VitalsRespirationSection
        bpSystolic={bpSystolic}
        bpDiastolic={bpDiastolic}
        spo2={spo2}
        respiratoryRate={respiratoryRate}
        breathing={breathing}
        trendDays={range.trendDays}
      />

      <BodyCompositionSection
        weight={weight}
        bodyFat={bodyFat}
        bmi={bmi}
        leanMass={leanMass}
        trendDays={range.trendDays}
      />

      <ActivitySection
        steps={steps}
        flights={flights}
        distance={distance}
        activeEnergy={activeEnergy}
        basalEnergy={basalEnergy}
        exerciseTime={exerciseTime}
        standTime={standTime}
        standHours={standHours}
        daylight={daylight}
        trendDays={range.trendDays}
      />

      <SleepSection sleepStages={sleepStages} breathing={breathing} trendDays={range.trendDays} />

      <WorkoutsSection
        workouts={workouts}
        workoutSummary={workoutSummary}
        rangeLabel={range.trendLabel}
      />

      <PostBypassTimeline rows={timeline} />
    </>
  );
}
