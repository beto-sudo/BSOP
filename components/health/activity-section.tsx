'use client';

import { useState } from 'react';
import { Flame, Footprints, MapPin, Mountain, Sun, Timer, Zap } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue, type HealthMetricRow } from '@/lib/health';
import { ChartModal } from './chart-modal';
import { buildDeltaHelper, filterRecentRows, groupDailySum } from './helpers';
import { TONES } from './tones';
import { TrendCard } from './trend-card';
import type { ChartConfig, ToneKey } from './types';

type Subkey =
  | 'steps'
  | 'flights'
  | 'distance'
  | 'activeEnergy'
  | 'basalEnergy'
  | 'exercise'
  | 'stand'
  | 'daylight';

// Default Apple ring targets. Beto's Move goal may differ; a real fetch
// from user profile would be cleaner but these defaults are rare to
// customize in post-bypass rehab mode.
const MOVE_GOAL_KCAL = 500;
const EXERCISE_GOAL_MIN = 30;
const STAND_GOAL_HOURS = 12;

function Ring({
  label,
  current,
  goal,
  unit,
  color,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, (current / goal) * 100));
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="112" height="112" viewBox="0 0 112 112" className="block">
          <circle
            cx="56"
            cy="56"
            r="42"
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth="10"
          />
          <circle
            cx="56"
            cy="56"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 56 56)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold text-[var(--text)] dark:text-white">
            {formatMetricValue(pct, 0)}%
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/50">
            {label}
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-[var(--muted-foreground)] dark:text-white/55">
        {formatMetricValue(current, 0)} / {formatMetricValue(goal, 0)} {unit}
      </div>
    </div>
  );
}

export function ActivitySection({
  steps,
  flights,
  distance,
  activeEnergy,
  basalEnergy,
  exerciseTime,
  standTime,
  standHours,
  daylight,
  trendDays,
}: {
  steps: HealthMetricRow[];
  flights: HealthMetricRow[];
  distance: HealthMetricRow[];
  activeEnergy: HealthMetricRow[];
  basalEnergy: HealthMetricRow[];
  exerciseTime: HealthMetricRow[];
  standTime: HealthMetricRow[];
  standHours: HealthMetricRow[];
  daylight: HealthMetricRow[];
  trendDays: number;
}) {
  const [openChart, setOpenChart] = useState<Subkey | null>(null);

  const stepsSeries = groupDailySum(steps).slice(-trendDays);
  const flightsSeries = groupDailySum(flights).slice(-trendDays);
  const distanceSeries = groupDailySum(distance).slice(-trendDays);
  const activeEnergySeries = groupDailySum(activeEnergy).slice(-trendDays);
  const basalEnergySeries = groupDailySum(basalEnergy).slice(-trendDays);
  const exerciseSeries = groupDailySum(exerciseTime).slice(-trendDays);
  const standSeries = groupDailySum(standTime).slice(-trendDays);
  const standHoursSeries = groupDailySum(standHours).slice(-trendDays);
  const daylightSeries = groupDailySum(daylight).slice(-trendDays);

  // Rings are pinned to "today" so they represent the live close-your-rings
  // state. The rest of the section shows aggregates for the selected range.
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayFrom = (series: { date: string; value: number }[]) =>
    series.find((point) => point.date === todayKey)?.value ?? 0;
  const todayActiveEnergy = todayFrom(activeEnergySeries);
  const todayExercise = todayFrom(exerciseSeries);
  const todayStandHours = todayFrom(standHoursSeries);

  const todaySteps = todayFrom(stepsSeries);
  const todayFlights = todayFrom(flightsSeries);
  const todayDistance = todayFrom(distanceSeries);
  const todayDaylight = todayFrom(daylightSeries);

  const last7ActiveEnergy = filterRecentRows(activeEnergy, 7);
  const last7ActiveTotal = last7ActiveEnergy.reduce((sum, row) => sum + row.value, 0);
  const last7BasalTotal = filterRecentRows(basalEnergy, 7).reduce((sum, row) => sum + row.value, 0);

  const charts: Record<Subkey, ChartConfig> = {
    steps: {
      key: 'steps',
      title: 'Steps',
      unit: 'pasos',
      tone: 'steps',
      icon: Footprints,
      data: stepsSeries,
      emptyTitle: 'Sin pasos en este rango',
      emptyCopy: 'Apple Watch / iPhone los acumula automáticamente.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    flights: {
      key: 'flights',
      title: 'Flights Climbed',
      unit: 'pisos',
      tone: 'flights',
      icon: Mountain,
      data: flightsSeries,
      emptyTitle: 'Sin pisos registrados',
      emptyCopy: 'Escaleras reales subidas según el barómetro del iPhone/Watch.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    distance: {
      key: 'distance',
      title: 'Walking + Running Distance',
      unit: 'mi',
      tone: 'distance',
      icon: MapPin,
      data: distanceSeries,
      emptyTitle: 'Sin distancia en este rango',
      emptyCopy: 'Distancia a pie o corriendo acumulada por día.',
      formatter: (v) => formatMetricValue(v, 1),
    },
    activeEnergy: {
      key: 'activeEnergy',
      title: 'Active Energy',
      unit: 'kcal',
      tone: 'activeEnergy',
      icon: Flame,
      data: activeEnergySeries,
      emptyTitle: 'Sin active energy',
      emptyCopy: 'La kcal extra quemada por movimiento (ring rojo de Apple).',
      formatter: (v) => formatMetricValue(v, 0),
    },
    basalEnergy: {
      key: 'basalEnergy',
      title: 'Basal Energy',
      unit: 'kcal',
      tone: 'basalEnergy',
      icon: Zap,
      data: basalEnergySeries,
      emptyTitle: 'Sin basal energy',
      emptyCopy: 'Gasto energético en reposo estimado por Apple Health.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    exercise: {
      key: 'exercise',
      title: 'Apple Exercise Time',
      unit: 'min',
      tone: 'exercise',
      icon: Timer,
      data: exerciseSeries,
      emptyTitle: 'Sin minutos de ejercicio',
      emptyCopy: 'Minutos de movimiento de intensidad moderada o mayor.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    stand: {
      key: 'stand',
      title: 'Apple Stand Time',
      unit: 'min',
      tone: 'stand',
      icon: Timer,
      data: standSeries,
      emptyTitle: 'Sin tiempo de pie',
      emptyCopy: 'Minutos acumulados de pie por día.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    daylight: {
      key: 'daylight',
      title: 'Time In Daylight',
      unit: 'min',
      tone: 'daylight',
      icon: Sun,
      data: daylightSeries,
      emptyTitle: 'Sin daylight',
      emptyCopy: 'Tiempo al aire libre detectado por Apple Watch.',
      formatter: (v) => formatMetricValue(v, 0),
    },
  };

  const trendCards: Array<{ key: Subkey; tone: ToneKey }> = [
    { key: 'steps', tone: 'steps' },
    { key: 'distance', tone: 'distance' },
    { key: 'flights', tone: 'flights' },
    { key: 'activeEnergy', tone: 'activeEnergy' },
    { key: 'basalEnergy', tone: 'basalEnergy' },
    { key: 'exercise', tone: 'exercise' },
    { key: 'stand', tone: 'stand' },
    { key: 'daylight', tone: 'daylight' },
  ];

  const openConfig = openChart ? charts[openChart] : null;

  return (
    <section className="mt-10">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-green-600 dark:text-green-300">
          <Flame className="h-4 w-4" />
          Activity
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
          Actividad diaria
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
          Anillos de Apple hoy, pasos, distancia, pisos y gasto energético en el rango seleccionado.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface className="p-6 shadow-sm dark:shadow-none">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
            Anillos de hoy
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Ring
              label="Move"
              current={todayActiveEnergy}
              goal={MOVE_GOAL_KCAL}
              unit="kcal"
              color={TONES.activeEnergy.line}
            />
            <Ring
              label="Exercise"
              current={todayExercise}
              goal={EXERCISE_GOAL_MIN}
              unit="min"
              color={TONES.exercise.line}
            />
            <Ring
              label="Stand"
              current={todayStandHours}
              goal={STAND_GOAL_HOURS}
              unit="hr"
              color={TONES.stand.line}
            />
          </div>
          <div className="mt-6 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted-foreground)] dark:text-white/55">
                Active 7d total
              </span>
              <span className="font-medium text-[var(--text)] dark:text-white">
                {formatMetricValue(last7ActiveTotal, 0)} kcal
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted-foreground)] dark:text-white/55">
                Basal 7d total
              </span>
              <span className="font-medium text-[var(--text)] dark:text-white">
                {formatMetricValue(last7BasalTotal, 0)} kcal
              </span>
            </div>
          </div>
        </Surface>

        <Surface className="p-6 shadow-sm dark:shadow-none">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
            Hoy
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Pasos', value: formatMetricValue(todaySteps, 0), unit: '' },
              { label: 'Distancia', value: formatMetricValue(todayDistance, 1), unit: 'mi' },
              { label: 'Pisos', value: formatMetricValue(todayFlights, 0), unit: '' },
              { label: 'Daylight', value: formatMetricValue(todayDaylight, 0), unit: 'min' },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 dark:border-white/8 dark:bg-white/4"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                  {card.label}
                </div>
                <div className="mt-2 flex items-end gap-1">
                  <div className="text-xl font-semibold text-[var(--text)] dark:text-white">
                    {card.value}
                  </div>
                  {card.unit ? (
                    <div className="pb-0.5 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                      {card.unit}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-[var(--muted-foreground)] dark:text-white/55">
            {buildDeltaHelper(stepsSeries, { days: 7, digits: 0, unit: 'pasos' })}
          </div>
        </Surface>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {trendCards.map((card) => (
          <TrendCard
            key={card.key}
            config={charts[card.key]}
            onExpand={() => setOpenChart(card.key)}
          />
        ))}
      </div>

      <ChartModal
        config={openConfig}
        onClose={() => setOpenChart(null)}
        rangeLabel={openConfig?.title ?? ''}
      />
    </section>
  );
}
