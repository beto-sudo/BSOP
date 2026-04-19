'use client';

import { useState } from 'react';
import { Droplets, HeartPulse, Waves, Wind } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue, type HealthMetricRow } from '@/lib/health';
import { ChartModal } from './chart-modal';
import {
  buildDeltaHelper,
  formatDaysAgo,
  groupDailyAverage,
  groupDailySum,
  isStaleSince,
} from './helpers';
import { TONES } from './tones';
import { TrendCard } from './trend-card';
import type { ChartConfig, ToneKey } from './types';

type Subkey = 'bp' | 'spo2' | 'respiration' | 'breathing';

/**
 * Vitals & Respiration — blood pressure, SpO₂, respiratory rate, and sleep
 * breathing disturbances. BP is deliberately de-emphasized here (degraded
 * from the hero) because the data is sparse; instead it shows the last
 * reading with a clear "register a new one" nudge.
 */
export function VitalsRespirationSection({
  bpSystolic,
  bpDiastolic,
  spo2,
  respiratoryRate,
  breathing,
  trendDays,
}: {
  bpSystolic: HealthMetricRow[];
  bpDiastolic: HealthMetricRow[];
  spo2: HealthMetricRow[];
  respiratoryRate: HealthMetricRow[];
  breathing: HealthMetricRow[];
  trendDays: number;
}) {
  const [openChart, setOpenChart] = useState<Subkey | null>(null);

  const bpSysSeries = groupDailyAverage(bpSystolic).slice(-trendDays);
  const bpDiaSeries = groupDailyAverage(bpDiastolic).slice(-trendDays);
  const spo2Series = groupDailyAverage(spo2).slice(-trendDays);
  const respirationSeries = groupDailyAverage(respiratoryRate).slice(-trendDays);
  const breathingSeries = groupDailySum(breathing).slice(-trendDays);

  const latestSys = bpSystolic.at(-1) ?? null;
  const latestDia = bpDiastolic.at(-1) ?? null;
  const bpStale = isStaleSince(latestSys?.date, 2);

  const chartConfigs: Record<Subkey, ChartConfig> = {
    bp: {
      key: 'bp',
      title: 'Blood Pressure',
      unit: 'mmHg',
      tone: 'bp',
      icon: HeartPulse,
      kind: 'dual-line',
      data: bpSysSeries,
      secondaryData: bpDiaSeries,
      primaryLabel: 'Systolic',
      secondaryLabel: 'Diastolic',
      emptyTitle: 'Sin presión en este rango',
      emptyCopy:
        'Registra con tu baumanómetro + iPhone (Health app). Las lecturas aparecerán aquí automáticamente.',
      formatter: (v) => formatMetricValue(v, 0),
    },
    spo2: {
      key: 'spo2',
      title: 'SpO₂',
      unit: '%',
      tone: 'spo2',
      icon: Waves,
      data: spo2Series,
      emptyTitle: 'Sin SpO₂ en este rango',
      emptyCopy:
        'El Apple Watch mide SpO₂ en reposo durante el día y la noche — requiere que esté ajustado.',
      formatter: (v) => formatMetricValue(v, 1),
    },
    respiration: {
      key: 'respiration',
      title: 'Respiratory Rate',
      unit: 'rpm',
      tone: 'respiration',
      icon: Wind,
      data: respirationSeries,
      emptyTitle: 'Sin respiración en este rango',
      emptyCopy: 'Apple Watch reporta respiración durante el sueño.',
      formatter: (v) => formatMetricValue(v, 1),
    },
    breathing: {
      key: 'breathing',
      title: 'Breathing Disturbances',
      unit: 'eventos',
      tone: 'breathing',
      icon: Droplets,
      data: breathingSeries,
      emptyTitle: 'Sin eventos registrados',
      emptyCopy:
        'Breathing disturbances detecta irregularidades respiratorias durante el sueño — señal temprana de apnea. Empezó a reportarse en 2026.',
      formatter: (v) => formatMetricValue(v, 0),
    },
  };

  const bpCards: Array<{ label: string; value: string }> = [
    { label: 'Systolic', value: latestSys ? formatMetricValue(latestSys.value, 0) : '—' },
    { label: 'Diastolic', value: latestDia ? formatMetricValue(latestDia.value, 0) : '—' },
    {
      label: 'Fecha',
      value: latestSys
        ? new Date(latestSys.date).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—',
    },
    { label: 'Status', value: bpStale.stale ? formatDaysAgo(bpStale.daysAgo) : 'Actualizada' },
  ];

  const cards: Array<{ key: Subkey; chart: ChartConfig; tone: ToneKey }> = [
    { key: 'spo2', chart: chartConfigs.spo2, tone: 'spo2' },
    { key: 'respiration', chart: chartConfigs.respiration, tone: 'respiration' },
    { key: 'breathing', chart: chartConfigs.breathing, tone: 'breathing' },
  ];

  const openConfig = openChart ? chartConfigs[openChart] : null;

  return (
    <section className="mt-10">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
          <Wind className="h-4 w-4" />
          Vitals & respiration
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
          Vitales y respiración
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
          Presión arterial, oxigenación, tasa respiratoria y eventos respiratorios durante el sueño.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Surface
          className={`p-6 shadow-sm dark:shadow-none ${bpStale.stale ? 'border-amber-300/40 bg-amber-50/40 dark:border-amber-300/20 dark:bg-amber-300/5' : ''}`}
        >
          <button
            type="button"
            onClick={() => setOpenChart('bp')}
            className="block w-full text-left"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 text-[var(--text)] dark:text-white">
                <div className={`rounded-2xl border p-3 ${TONES.bp.icon}`}>
                  <HeartPulse className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Blood Pressure</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                    Última lectura registrada · click para ver histórico
                  </p>
                </div>
              </div>
              {bpStale.stale ? (
                <span className="rounded-full border border-amber-300/40 bg-amber-100/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                  Toma una nueva
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {bpCards.map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 dark:border-white/10 dark:bg-black/20"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                    {entry.label}
                  </div>
                  <div className="mt-2 text-lg font-medium text-[var(--text)] dark:text-white/90">
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>
            {bpStale.stale ? (
              <p className="mt-4 text-xs text-amber-700 dark:text-amber-200">
                Post-bypass conviene registrar BP cada 1–2 días. La última tiene{' '}
                {formatDaysAgo(bpStale.daysAgo).toLowerCase()}.
              </p>
            ) : null}
          </button>
        </Surface>

        <Surface className="p-6 shadow-sm dark:shadow-none">
          <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
            Respiración
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 dark:border-white/8 dark:bg-white/4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                SpO₂ actual
              </div>
              <div className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
                {spo2Series.at(-1) ? `${formatMetricValue(spo2Series.at(-1)!.value, 1)}%` : '—'}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                {buildDeltaHelper(spo2Series, { days: 7, digits: 1, unit: '%' })}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 dark:border-white/8 dark:bg-white/4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                Respiratory Rate
              </div>
              <div className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
                {respirationSeries.at(-1)
                  ? `${formatMetricValue(respirationSeries.at(-1)!.value, 1)} rpm`
                  : '—'}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                {buildDeltaHelper(respirationSeries, { days: 7, digits: 1, unit: 'rpm' })}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 dark:border-white/8 dark:bg-white/4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
                Breathing events (noche)
              </div>
              <div className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
                {breathingSeries.at(-1) ? formatMetricValue(breathingSeries.at(-1)!.value, 0) : '—'}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                {buildDeltaHelper(breathingSeries, {
                  days: 7,
                  digits: 0,
                  unit: 'eventos',
                  invertTone: true,
                })}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <TrendCard key={card.key} config={card.chart} onExpand={() => setOpenChart(card.key)} />
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
