'use client';

import { Activity, Flame, Footprints, Gauge, HeartPulse } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import {
  CARDIAC_MAX_HR,
  CARDIAC_RESTING_HR,
  formatMetricValue,
  type HealthMetricRow,
  type WorkoutCardiacZones,
} from '@/lib/health';
import { EmptyState } from './empty-state';
import { formatDaysAgo, groupDailyAverage, isStaleSince } from './helpers';
import { StatPill } from './stat-pill';
import { TONES } from './tones';
import { TrendSvg } from './trend-svg';
import type { ChartConfig } from './types';

type Zone = { key: 'z1' | 'z2' | 'z3' | 'z4' | 'z5'; label: string; color: string; cap: string };

/**
 * Karvonen zones (heart rate reserve) for a post-bypass profile. Z1 is
 * warm-up / recovery; Z2–3 is the cardiac-rehab sweet spot; Z4–5 is
 * near-maximal effort that post-op patients are usually coached to avoid
 * without supervision.
 */
const ZONES: Zone[] = [
  { key: 'z1', label: 'Z1 · Recovery', color: 'bg-sky-400', cap: 'Calentamiento' },
  { key: 'z2', label: 'Z2 · Base', color: 'bg-emerald-400', cap: 'Base aeróbica' },
  { key: 'z3', label: 'Z3 · Tempo', color: 'bg-lime-400', cap: 'Aeróbico sostenido' },
  { key: 'z4', label: 'Z4 · Umbral', color: 'bg-amber-400', cap: 'Cerca del umbral' },
  { key: 'z5', label: 'Z5 · Anaeróbico', color: 'bg-rose-500', cap: 'Esfuerzo máximo' },
];

function zoneThresholds() {
  const reserve = CARDIAC_MAX_HR - CARDIAC_RESTING_HR;
  return {
    z2: Math.round(CARDIAC_RESTING_HR + 0.5 * reserve),
    z3: Math.round(CARDIAC_RESTING_HR + 0.6 * reserve),
    z4: Math.round(CARDIAC_RESTING_HR + 0.7 * reserve),
    z5: Math.round(CARDIAC_RESTING_HR + 0.8 * reserve),
  };
}

function classifyVo2Max(value: number | null): { band: string; tone: string } {
  if (value == null) return { band: 'Sin lectura', tone: 'text-white/60' };
  // Post-bypass 50-year-old male reference bands. 18 ml/kg/min is low
  // (cardiac rehab starting point); 35+ is protective.
  if (value < 20) return { band: 'Bajo', tone: 'text-rose-400' };
  if (value < 27) return { band: 'Moderado-bajo', tone: 'text-amber-400' };
  if (value < 35) return { band: 'Moderado', tone: 'text-lime-400' };
  return { band: 'Bueno', tone: 'text-emerald-400' };
}

export function CardiacFitnessSection({
  walkingHrAvg,
  vo2Max,
  sixMinWalk,
  zones,
  rangeLabel,
}: {
  walkingHrAvg: HealthMetricRow[];
  vo2Max: HealthMetricRow[];
  sixMinWalk: HealthMetricRow[];
  zones: WorkoutCardiacZones[];
  rangeLabel: string;
}) {
  const walkingTrend = groupDailyAverage(walkingHrAvg);
  const vo2Latest = vo2Max.at(-1) ?? null;
  const vo2Class = classifyVo2Max(vo2Latest?.value ?? null);
  const vo2Stale = isStaleSince(vo2Latest?.date, 60);
  const thresholds = zoneThresholds();

  const sixMwtSorted = sixMinWalk.slice().sort((a, b) => a.date.localeCompare(b.date));
  const sixMwtLatest = sixMwtSorted.at(-1) ?? null;
  const sixMwtFirst = sixMwtSorted[0] ?? null;
  const sixMwtDelta =
    sixMwtLatest && sixMwtFirst && sixMwtLatest !== sixMwtFirst
      ? sixMwtLatest.value - sixMwtFirst.value
      : null;

  // Collapse workout zones into a stacked-bar summary. Workouts with zero
  // heart-rate samples (e.g. strength training without the watch on wrist)
  // are filtered out — a bar with zero height is noise.
  const workoutsWithHr = zones.filter((z) => z.samples > 0);
  const totalSamples = workoutsWithHr.reduce((sum, z) => sum + z.samples, 0);
  const zoneTotals = workoutsWithHr.reduce(
    (acc, z) => ({
      z1: acc.z1 + z.z1_samples,
      z2: acc.z2 + z.z2_samples,
      z3: acc.z3 + z.z3_samples,
      z4: acc.z4 + z.z4_samples,
      z5: acc.z5 + z.z5_samples,
    }),
    { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
  );

  const walkingChart: ChartConfig = {
    key: 'walkHr',
    title: 'Walking HR Average',
    unit: 'bpm',
    tone: 'walkHr',
    icon: HeartPulse,
    data: walkingTrend,
    emptyTitle: 'Sin Walking HR aún',
    emptyCopy: 'Apple Health promedia el pulso mientras caminas; aparecerá aquí tras sincronizar.',
    formatter: (value) => formatMetricValue(value, 0),
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">
            <Flame className="h-4 w-4" />
            Cardiac fitness
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
            Capacidad cardiovascular
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            Indicadores de rehabilitación post-bypass: pulso al caminar, VO₂ máximo, 6MWT y cómo se
            distribuyen las zonas cardíacas en tus entrenamientos.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Surface className="p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl border p-3 ${TONES.vo2.icon}`}>
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  VO₂ Max
                </div>
                <div className="text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  Apple Watch estimado
                </div>
              </div>
            </div>
            {vo2Latest ? (
              <>
                <div className="mt-5 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                    {formatMetricValue(vo2Latest.value, 1)}
                  </div>
                  <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                    ml/(kg·min)
                  </div>
                </div>
                <div className={`mt-2 text-sm font-medium ${vo2Class.tone}`}>{vo2Class.band}</div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  {formatDaysAgo(vo2Stale.daysAgo)}
                  {vo2Stale.stale ? ' · pide nueva estimación al watch' : ''}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                Sin VO₂ Max registrado. Apple Watch estima este valor tras caminar ~20 min al aire
                libre.
              </p>
            )}
          </Surface>

          <Surface className="p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl border p-3 ${TONES.sixmwt.icon}`}>
                <Footprints className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  6-Minute Walk
                </div>
                <div className="text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  Test funcional cardíaco
                </div>
              </div>
            </div>
            {sixMwtLatest ? (
              <>
                <div className="mt-5 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                    {formatMetricValue(sixMwtLatest.value, 0)}
                  </div>
                  <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                    m
                  </div>
                </div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  {new Date(sixMwtLatest.date).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                {sixMwtDelta != null ? (
                  <div className="mt-2 text-sm">
                    <span
                      className={
                        sixMwtDelta >= 0
                          ? 'text-emerald-500 dark:text-emerald-300'
                          : 'text-rose-500 dark:text-rose-300'
                      }
                    >
                      {sixMwtDelta >= 0 ? '+' : ''}
                      {formatMetricValue(sixMwtDelta, 0)} m
                    </span>{' '}
                    <span className="text-[var(--muted-foreground)] dark:text-white/45">
                      desde la primera prueba
                    </span>
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  {sixMwtSorted.length} prueba{sixMwtSorted.length === 1 ? '' : 's'} registrada
                  {sixMwtSorted.length === 1 ? '' : 's'}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                El iPhone o Apple Watch puede ejecutar el test 6MWT. Aparecerá aquí con histórico
                cuando haya una medición.
              </p>
            )}
          </Surface>
        </div>

        <Surface className="p-6 shadow-sm dark:shadow-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 text-[var(--text)] dark:text-white">
              <div className={`rounded-2xl border p-3 ${TONES.walkHr.icon}`}>
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Walking HR Average</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                  Cada día promedia el pulso mientras caminas — bajar este número con el tiempo es
                  progreso de rehab.
                </p>
              </div>
            </div>
            <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted-foreground)] dark:border-white/10 dark:bg-white/5 dark:text-white/70">
              {rangeLabel}
            </div>
          </div>
          {walkingTrend.length ? (
            <TrendSvg config={walkingChart} />
          ) : (
            <EmptyState
              title="Sin Walking HR en este rango"
              copy="Apple Watch publica este promedio una vez al día después de caminatas significativas."
            />
          )}
        </Surface>
      </div>

      <Surface className="mt-6 p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 text-[var(--text)] dark:text-white">
            <div className={`rounded-2xl border p-3 ${TONES.hr.icon}`}>
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Zonas cardíacas en workouts</h3>
              <p className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Karvonen · RHR {CARDIAC_RESTING_HR} bpm · HR máx {CARDIAC_MAX_HR} bpm. Cada barra es
                un workout: de izquierda (más reciente) a derecha.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {ZONES.map((zone) => {
            const threshold =
              zone.key === 'z1'
                ? `< ${thresholds.z2}`
                : zone.key === 'z2'
                  ? `${thresholds.z2}–${thresholds.z3}`
                  : zone.key === 'z3'
                    ? `${thresholds.z3}–${thresholds.z4}`
                    : zone.key === 'z4'
                      ? `${thresholds.z4}–${thresholds.z5}`
                      : `≥ ${thresholds.z5}`;
            return (
              <div
                key={zone.key}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 dark:border-white/10 dark:bg-white/5"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${zone.color}`} />
                <span className="font-medium text-[var(--text)] dark:text-white">{zone.label}</span>
                <span className="text-[var(--muted-foreground)] dark:text-white/50">
                  {threshold} bpm
                </span>
              </div>
            );
          })}
        </div>

        {workoutsWithHr.length ? (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {ZONES.map((zone) => {
                const pct = totalSamples ? (zoneTotals[zone.key] / totalSamples) * 100 : 0;
                return (
                  <StatPill
                    key={zone.key}
                    label={zone.label}
                    value={`${formatMetricValue(pct, 0)}%`}
                  />
                );
              })}
            </div>

            <div className="space-y-3">
              {workoutsWithHr.slice(0, 12).map((workout) => {
                const samples = workout.samples;
                const durationMinutes =
                  workout.end_time && workout.start_time
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(workout.end_time).getTime() -
                            new Date(workout.start_time).getTime()) /
                            60_000
                        )
                      )
                    : null;
                return (
                  <div
                    key={workout.workout_id}
                    className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-4 dark:border-white/8 dark:bg-white/4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-[var(--text)] dark:text-white">
                          {workout.workout_name}
                        </span>
                        <span className="text-[var(--muted-foreground)] dark:text-white/45">
                          {new Date(workout.start_time).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                        {durationMinutes != null ? (
                          <span className="text-[var(--muted-foreground)] dark:text-white/45">
                            · {durationMinutes} min
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)] dark:text-white/60">
                        <span>avg {formatMetricValue(workout.avg_hr, 0)} bpm</span>
                        <span>máx {formatMetricValue(workout.max_hr_observed, 0)} bpm</span>
                      </div>
                    </div>
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      {ZONES.map((zone) => {
                        const raw = workout[`${zone.key}_samples` as const];
                        const pct = samples ? (raw / samples) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={zone.key}
                            className={`h-3 ${zone.color}`}
                            style={{ width: `${pct}%` }}
                            title={`${zone.label}: ${formatMetricValue(pct, 0)}%`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="Sin heart rate granular en los workouts del rango"
            copy="Las zonas se derivan de la serie Heart Rate del Apple Watch durante cada sesión. Si el watch no estaba en la muñeca o el workout es muy corto, no hay samples para calcular."
          />
        )}
      </Surface>
    </section>
  );
}
