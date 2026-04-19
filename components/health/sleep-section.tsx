'use client';

import { useState } from 'react';
import { BedDouble, MoonStar, Wind } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatDurationHours, formatMetricValue, type HealthMetricRow } from '@/lib/health';
import { ChartModal } from './chart-modal';
import {
  countDaysAtOrAbove,
  filterRecentRows,
  groupDailySleep,
  groupDailySum,
  groupSleepStages,
  summarizeDailyWindow,
} from './helpers';
import { StatPill } from './stat-pill';
import { TONES } from './tones';
import { TrendSvg } from './trend-svg';
import type { ChartConfig } from './types';

const SLEEP_TARGET_HOURS = 7;

const STAGE_META = [
  { key: 'Sleep Deep', label: 'Deep', color: 'bg-indigo-600', target: 'Objetivo 13–23%' },
  { key: 'Sleep REM', label: 'REM', color: 'bg-violet-500', target: 'Objetivo 20–25%' },
  { key: 'Sleep Core', label: 'Core', color: 'bg-sky-500', target: 'Balance del total' },
  { key: 'Sleep Awake', label: 'Awake', color: 'bg-amber-400', target: '< 10% idealmente' },
] as const;

/**
 * Sleep — duration, stage mix, consistency (real "X/N nights ≥7h") and
 * optional breathing-disturbance overlay. Consistency was previously a
 * vague "% in target"; it now answers the question a rehab plan cares
 * about: how many nights you actually slept enough.
 */
export function SleepSection({
  sleepStages,
  breathing,
  trendDays,
}: {
  sleepStages: HealthMetricRow[];
  breathing: HealthMetricRow[];
  trendDays: number;
}) {
  const [openChart, setOpenChart] = useState<'sleep' | 'breathing' | null>(null);

  const sleepDaily = groupDailySleep(sleepStages);
  const sleepSeries = sleepDaily.slice(-trendDays);
  const breathingSeries = groupDailySum(breathing).slice(-trendDays);

  const latestSleep = sleepDaily.at(-1) ?? null;
  const sleep7dAvg = summarizeDailyWindow(sleepDaily, 7, 0);
  const sleep30dAvg = summarizeDailyWindow(sleepDaily, Math.min(30, trendDays), 0);
  const consistency7 = countDaysAtOrAbove(sleepDaily, 7, SLEEP_TARGET_HOURS);
  const consistency30 = countDaysAtOrAbove(sleepDaily, Math.min(30, trendDays), SLEEP_TARGET_HOURS);

  const recentStageRows = filterRecentRows(sleepStages, 7);
  const stageAverages = groupSleepStages(recentStageRows);
  const stageTotal =
    stageAverages['Sleep Core'] +
    stageAverages['Sleep Deep'] +
    stageAverages['Sleep REM'] +
    stageAverages['Sleep Awake'];

  const breathing7Total = breathingSeries.slice(-7).reduce((sum, point) => sum + point.value, 0);
  const breathingLatest = breathingSeries.at(-1);

  const sleepConfig: ChartConfig = {
    key: 'sleep',
    title: 'Sleep duration',
    unit: 'hr',
    tone: 'sleep',
    icon: MoonStar,
    data: sleepSeries,
    emptyTitle: 'Sin datos de sueño',
    emptyCopy:
      'Sleep Analysis renderiza aquí una vez que haya datos del Sleeptracker® o Apple Watch en el rango.',
    formatter: (v) => formatDurationHours(v),
  };

  const breathingConfig: ChartConfig = {
    key: 'breathing',
    title: 'Breathing Disturbances por noche',
    unit: 'eventos',
    tone: 'breathing',
    icon: Wind,
    data: breathingSeries,
    emptyTitle: 'Sin eventos',
    emptyCopy: 'Apple Watch cuenta episodios respiratorios anormales durante el sueño.',
    formatter: (v) => formatMetricValue(v, 0),
  };

  return (
    <section className="mt-10 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Surface className="p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
          <div className={`rounded-2xl border p-3 ${TONES.sleep.icon}`}>
            <MoonStar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Sueño</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
              Duración y consistencia — objetivo ≥ {SLEEP_TARGET_HOURS} hrs/noche para rehab
              cardiaca.
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <StatPill
            label="Anoche"
            value={`${latestSleep ? formatDurationHours(latestSleep.value) : '—'} hr`}
          />
          <StatPill
            label="7d avg"
            value={`${sleep7dAvg == null ? '—' : formatDurationHours(sleep7dAvg)} hr`}
          />
          <StatPill
            label="30d avg"
            value={`${sleep30dAvg == null ? '—' : formatDurationHours(sleep30dAvg)} hr`}
          />
          <StatPill
            label="Noches ≥7h (7d)"
            value={`${consistency7.hits}/${consistency7.total || 7}`}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpenChart('sleep')}
          className="block w-full text-left"
        >
          <TrendSvg config={sleepConfig} />
        </button>

        <div className="mt-4 text-xs text-[var(--muted-foreground)] dark:text-white/45">
          Ventana amplia: {consistency30.hits}/{consistency30.total || Math.min(30, trendDays)}{' '}
          noches cumplieron la meta.
        </div>
      </Surface>

      <div className="flex flex-col gap-6">
        <Surface className="p-6 shadow-sm dark:shadow-none">
          <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
            <BedDouble className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
            <h2 className="text-lg font-semibold">Etapas (7 días)</h2>
          </div>
          {stageTotal > 0 ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                {STAGE_META.map((stage) => {
                  const value = stageAverages[stage.key as keyof typeof stageAverages];
                  const pct = stageTotal ? (value / stageTotal) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={stage.key}
                      className={`h-3 ${stage.color}`}
                      style={{ width: `${pct}%` }}
                      title={`${stage.label}: ${formatDurationHours(value)} hr`}
                    />
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {STAGE_META.map((stage) => {
                  const value = stageAverages[stage.key as keyof typeof stageAverages];
                  const pct = stageTotal ? (value / stageTotal) * 100 : 0;
                  return (
                    <div key={stage.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[var(--muted-foreground)] dark:text-white/55">
                        <span className={`h-2 w-2 rounded-full ${stage.color}`} />
                        {stage.label}
                      </span>
                      <span className="font-medium text-[var(--text)] dark:text-white">
                        {formatDurationHours(value)}h · {formatMetricValue(pct, 0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)] dark:text-white/55">
              Sin etapas registradas los últimos 7 días.
            </p>
          )}
        </Surface>

        <Surface
          className={`p-6 shadow-sm dark:shadow-none ${breathing7Total > 40 ? 'border-amber-300/40 bg-amber-50/40 dark:border-amber-300/20 dark:bg-amber-300/5' : ''}`}
        >
          <button
            type="button"
            onClick={() => setOpenChart('breathing')}
            className="block w-full text-left"
          >
            <div className="mb-2 flex items-center gap-3 text-[var(--text)] dark:text-white">
              <Wind className="h-5 w-5 text-sky-500 dark:text-sky-300" />
              <h2 className="text-lg font-semibold">Breathing Disturbances</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] dark:text-white/45">
              Eventos respiratorios anormales durante el sueño. Post-bypass, un alza puede sugerir
              apnea.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                  Última noche
                </div>
                <div className="mt-1 text-xl font-semibold text-[var(--text)] dark:text-white">
                  {breathingLatest ? formatMetricValue(breathingLatest.value, 0) : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                  7d total
                </div>
                <div className="mt-1 text-xl font-semibold text-[var(--text)] dark:text-white">
                  {formatMetricValue(breathing7Total, 0)}
                </div>
              </div>
            </div>
          </button>
        </Surface>
      </div>

      <ChartModal
        config={
          openChart === 'sleep' ? sleepConfig : openChart === 'breathing' ? breathingConfig : null
        }
        onClose={() => setOpenChart(null)}
        rangeLabel={openChart === 'sleep' ? sleepConfig.title : breathingConfig.title}
      />
    </section>
  );
}
