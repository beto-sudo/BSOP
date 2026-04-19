'use client';

import { useState } from 'react';
import { Percent, Scale, Shrink, Weight } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue, type HealthMetricRow } from '@/lib/health';
import { ChartModal } from './chart-modal';
import {
  buildDeltaHelper,
  formatDaysAgo,
  groupDailyAverage,
  groupDailyWeight,
  isStaleSince,
} from './helpers';
import { TONES } from './tones';
import type { ChartConfig, ToneKey } from './types';

type SubchartKey = 'weight' | 'bodyfat' | 'bmi' | 'lean';

/**
 * Body Composition — one unified section for everything scale-related.
 * Keeps the four metrics adjacent so you can cross-reference a weight bump
 * against body-fat % and lean mass rather than scrolling between cards.
 */
export function BodyCompositionSection({
  weight,
  bodyFat,
  bmi,
  leanMass,
  trendDays,
}: {
  weight: HealthMetricRow[];
  bodyFat: HealthMetricRow[];
  bmi: HealthMetricRow[];
  leanMass: HealthMetricRow[];
  trendDays: number;
}) {
  const [open, setOpen] = useState<SubchartKey | null>(null);

  const weightSeries = groupDailyWeight(weight).slice(-trendDays);
  const bodyFatSeries = groupDailyAverage(bodyFat).slice(-trendDays);
  const bmiSeries = groupDailyAverage(bmi).slice(-trendDays);
  const leanSeries = groupDailyAverage(leanMass).slice(-trendDays);

  const latestWeightRow = weight.at(-1) ?? null;
  const latestBfRow = bodyFat.at(-1) ?? null;
  const latestBmiRow = bmi.at(-1) ?? null;
  const latestLeanRow = leanMass.at(-1) ?? null;

  const weightStale = isStaleSince(latestWeightRow?.date, 3);
  const bfStale = isStaleSince(latestBfRow?.date, 7);

  const cards: Array<{
    key: SubchartKey;
    tone: ToneKey;
    title: string;
    icon: typeof Weight;
    value: string;
    unit: string;
    helper: string;
    stale: boolean;
    staleLabel: string;
    config: ChartConfig;
  }> = [
    {
      key: 'weight',
      tone: 'weight',
      title: 'Weight',
      icon: Weight,
      value: latestWeightRow ? formatMetricValue(latestWeightRow.value, 1) : '—',
      unit: 'lb',
      helper: buildDeltaHelper(weightSeries, { days: 7, digits: 1, unit: 'lb', invertTone: true }),
      stale: weightStale.stale,
      staleLabel: formatDaysAgo(weightStale.daysAgo),
      config: {
        key: 'weight',
        title: 'Weight',
        unit: 'lb',
        tone: 'weight',
        icon: Weight,
        data: weightSeries,
        emptyTitle: 'Sin peso en este rango',
        emptyCopy:
          'La báscula Garmin sincroniza vía Garmin Connect → Apple Health. Si lleva días sin datos, revisa la conexión Bluetooth del iPhone.',
        formatter: (v) => formatMetricValue(v, 1),
      },
    },
    {
      key: 'bodyfat',
      tone: 'bodyfat',
      title: 'Body Fat %',
      icon: Percent,
      value: latestBfRow ? formatMetricValue(latestBfRow.value, 1) : '—',
      unit: '%',
      helper: buildDeltaHelper(bodyFatSeries, { days: 7, digits: 1, unit: '%', invertTone: true }),
      stale: bfStale.stale,
      staleLabel: formatDaysAgo(bfStale.daysAgo),
      config: {
        key: 'bodyfat',
        title: 'Body Fat %',
        unit: '%',
        tone: 'bodyfat',
        icon: Percent,
        data: bodyFatSeries,
        emptyTitle: 'Sin Body Fat en este rango',
        emptyCopy:
          'Solo ciertas básculas Garmin exportan Body Fat %. Puede tomar varios días en propagarse al iPhone.',
        formatter: (v) => formatMetricValue(v, 1),
      },
    },
    {
      key: 'bmi',
      tone: 'bmi',
      title: 'BMI',
      icon: Scale,
      value: latestBmiRow ? formatMetricValue(latestBmiRow.value, 1) : '—',
      unit: '',
      helper: buildDeltaHelper(bmiSeries, { days: 7, digits: 1, unit: '', invertTone: true }),
      stale: false,
      staleLabel: '',
      config: {
        key: 'bmi',
        title: 'BMI',
        unit: '',
        tone: 'bmi',
        icon: Scale,
        data: bmiSeries,
        emptyTitle: 'Sin BMI en este rango',
        emptyCopy: 'BMI se deriva de Body Mass y Height en Apple Health.',
        formatter: (v) => formatMetricValue(v, 1),
      },
    },
    {
      key: 'lean',
      tone: 'lean',
      title: 'Lean Mass',
      icon: Shrink,
      value: latestLeanRow ? formatMetricValue(latestLeanRow.value, 1) : '—',
      unit: 'lb',
      helper: leanSeries.length
        ? buildDeltaHelper(leanSeries, { days: 30, digits: 1, unit: 'lb' })
        : 'Masa magra recién empezó a registrarse',
      stale: false,
      staleLabel: '',
      config: {
        key: 'lean',
        title: 'Lean Body Mass',
        unit: 'lb',
        tone: 'lean',
        icon: Shrink,
        data: leanSeries,
        emptyTitle: 'Sin Lean Mass en este rango',
        emptyCopy:
          'Masa magra es un campo reciente; la báscula lo sube cuando tiene lectura válida.',
        formatter: (v) => formatMetricValue(v, 1),
      },
    },
  ];

  const openConfig = cards.find((card) => card.key === open)?.config ?? null;

  return (
    <section className="mt-10">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-600 dark:text-orange-300">
          <Scale className="h-4 w-4" />
          Body composition
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
          Composición corporal
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
          Peso, grasa corporal, BMI y masa magra juntos para ver si un cambio de peso viene de
          músculo o de grasa.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const tone = TONES[card.tone];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setOpen(card.key)}
              className="text-left"
            >
              <Surface className="h-full p-5 shadow-sm transition hover:border-[var(--accent)]/20 hover:bg-[var(--panel)] dark:shadow-none dark:hover:border-white/15 dark:hover:bg-white/[0.06]">
                <div className="flex items-center justify-between gap-3">
                  <div className={`rounded-2xl border p-3 ${tone.icon}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {card.stale ? (
                      <span className="rounded-full border border-amber-300/40 bg-amber-100/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                        {card.staleLabel}
                      </span>
                    ) : null}
                    <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                      {card.title}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-end gap-2">
                  <div className="text-2xl font-semibold text-[var(--text)] dark:text-white">
                    {card.value}
                  </div>
                  {card.unit ? (
                    <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                      {card.unit}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)] dark:text-white/55">
                  {card.helper}
                </div>
              </Surface>
            </button>
          );
        })}
      </div>

      <ChartModal
        config={openConfig}
        onClose={() => setOpen(null)}
        rangeLabel={openConfig?.title ?? ''}
      />
    </section>
  );
}
