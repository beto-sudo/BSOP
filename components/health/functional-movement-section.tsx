'use client';

import { useState } from 'react';
import { Footprints, GitCompare, MoveDown, MoveUp, Zap } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue, type HealthMetricRow } from '@/lib/health';
import { ChartModal } from './chart-modal';
import { classifyBand, groupDailyAverage, summarizeDailyWindow, type Band } from './helpers';
import { StatPill } from './stat-pill';
import { TONES } from './tones';
import { TrendSvg } from './trend-svg';
import type { ChartConfig } from './types';

// Clinical thresholds tuned for an active 50-year-old post-bypass profile.
// Walking Speed in m/s — population baseline ~1.2 m/s for healthy adults
// 50–60. Sub-1.0 m/s is associated with reduced functional independence;
// >1.4 m/s is cardiac-rehab "good".
const WALKING_SPEED_BANDS: ReadonlyArray<Band<'low' | 'mid' | 'good' | 'great'>> = [
  { key: 'low', max: 0.8, label: 'Bajo', color: 'rose' },
  { key: 'mid', max: 1.0, label: 'Moderado', color: 'amber' },
  { key: 'good', max: 1.4, label: 'Bueno', color: 'lime' },
  { key: 'great', max: Infinity, label: 'Muy bueno', color: 'emerald' },
];

// Walking Asymmetry % — Apple Watch reports left/right step time asymmetry.
// <2% is typical for a symmetric gait; sustained >4% can suggest a limp,
// post-surgical compensation, or musculoskeletal issue.
const ASYMMETRY_BANDS: ReadonlyArray<Band<'good' | 'mid' | 'flag'>> = [
  { key: 'good', max: 2, label: 'Simétrico', color: 'emerald' },
  { key: 'mid', max: 4, label: 'Atender', color: 'amber' },
  { key: 'flag', max: Infinity, label: 'Asimétrico', color: 'rose' },
];

// Walking Double Support % — fraction of gait cycle with both feet on the
// ground. Healthy adults sit at 18–24%. Higher numbers reflect a more
// cautious gait (common after cardiac events / lower confidence).
const DOUBLE_SUPPORT_BANDS: ReadonlyArray<Band<'good' | 'mid' | 'flag'>> = [
  { key: 'good', max: 24, label: 'Confiado', color: 'emerald' },
  { key: 'mid', max: 28, label: 'Cauto', color: 'amber' },
  { key: 'flag', max: Infinity, label: 'Inseguro', color: 'rose' },
];

// Stair Speed Up in m/s — cardiac functional test proxy. <0.3 m/s is
// reduced power output; >0.5 m/s tracks restored capacity.
const STAIR_UP_BANDS: ReadonlyArray<Band<'low' | 'mid' | 'good'>> = [
  { key: 'low', max: 0.3, label: 'Bajo', color: 'rose' },
  { key: 'mid', max: 0.5, label: 'Moderado', color: 'amber' },
  { key: 'good', max: Infinity, label: 'Bueno', color: 'emerald' },
];

function bandText(color: Band['color']): string {
  switch (color) {
    case 'emerald':
      return 'text-emerald-600 dark:text-emerald-300';
    case 'lime':
      return 'text-lime-600 dark:text-lime-300';
    case 'amber':
      return 'text-amber-600 dark:text-amber-300';
    case 'rose':
      return 'text-rose-600 dark:text-rose-300';
  }
}

type ChartKey = 'walkingSpeed' | 'asymmetry' | 'doubleSupport' | 'stairUp';

/**
 * Functional movement — gait quality (Walking Speed / Asymmetry / Double
 * Support) and stair power (Stair Speed Up). Apple Watch captures all of
 * these continuously, zero effort. Used as early-warning indicators in
 * cardiac rehab: gait deterioration often precedes overt cardiovascular
 * regression by weeks.
 */
export function FunctionalMovementSection({
  walkingSpeed,
  walkingAsymmetry,
  walkingDoubleSupport,
  stairSpeedUp,
  stairSpeedDown,
  trendDays,
  rangeLabel,
}: {
  walkingSpeed: HealthMetricRow[];
  walkingAsymmetry: HealthMetricRow[];
  walkingDoubleSupport: HealthMetricRow[];
  stairSpeedUp: HealthMetricRow[];
  stairSpeedDown: HealthMetricRow[];
  trendDays: number;
  rangeLabel: string;
}) {
  const [openChart, setOpenChart] = useState<ChartKey | null>(null);

  const speedDaily = groupDailyAverage(walkingSpeed);
  const asymmetryDaily = groupDailyAverage(walkingAsymmetry);
  const doubleSupportDaily = groupDailyAverage(walkingDoubleSupport);
  const stairUpDaily = groupDailyAverage(stairSpeedUp);
  const stairDownDaily = groupDailyAverage(stairSpeedDown);

  const speed7d = summarizeDailyWindow(speedDaily, 7, 0);
  const asym7d = summarizeDailyWindow(asymmetryDaily, 7, 0);
  const dsupp7d = summarizeDailyWindow(doubleSupportDaily, 7, 0);
  const stairUp7d = summarizeDailyWindow(stairUpDaily, 7, 0);
  const stairDown7d = summarizeDailyWindow(stairDownDaily, 7, 0);

  const speedBand = classifyBand(speed7d, WALKING_SPEED_BANDS);
  const asymBand = classifyBand(asym7d, ASYMMETRY_BANDS);
  const dsuppBand = classifyBand(dsupp7d, DOUBLE_SUPPORT_BANDS);
  const stairUpBand = classifyBand(stairUp7d, STAIR_UP_BANDS);

  const speedSeries = speedDaily.slice(-trendDays);
  const asymSeries = asymmetryDaily.slice(-trendDays);
  const dsuppSeries = doubleSupportDaily.slice(-trendDays);
  const stairUpSeries = stairUpDaily.slice(-trendDays);

  const speedConfig: ChartConfig = {
    key: 'walkSpeed',
    title: 'Walking Speed (m/s)',
    unit: 'm/s',
    tone: 'walkSpeed',
    icon: Footprints,
    data: speedSeries,
    emptyTitle: 'Sin Walking Speed aún',
    emptyCopy: 'Apple Watch publica esta serie tras caminatas significativas.',
    formatter: (v) => formatMetricValue(v, 2),
  };

  const asymConfig: ChartConfig = {
    key: 'walkAsym',
    title: 'Walking Asymmetry (%)',
    unit: '%',
    tone: 'walkAsym',
    icon: GitCompare,
    data: asymSeries,
    emptyTitle: 'Sin lecturas',
    emptyCopy: 'Asimetría izquierda/derecha de tu marcha.',
    formatter: (v) => formatMetricValue(v, 1),
  };

  const dsuppConfig: ChartConfig = {
    key: 'walkDouble',
    title: 'Double Support (%)',
    unit: '%',
    tone: 'walkDouble',
    icon: GitCompare,
    data: dsuppSeries,
    emptyTitle: 'Sin lecturas',
    emptyCopy: '% del ciclo de marcha con ambos pies en piso.',
    formatter: (v) => formatMetricValue(v, 1),
  };

  const stairUpConfig: ChartConfig = {
    key: 'stairUp',
    title: 'Stair Speed Up (m/s)',
    unit: 'm/s',
    tone: 'stairUp',
    icon: MoveUp,
    data: stairUpSeries,
    emptyTitle: 'Sin lecturas',
    emptyCopy: 'Apple Watch mide la velocidad cuando subes escaleras.',
    formatter: (v) => formatMetricValue(v, 2),
  };

  const noData =
    !speedDaily.length &&
    !asymmetryDaily.length &&
    !doubleSupportDaily.length &&
    !stairUpDaily.length;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">
            <Zap className="h-4 w-4" />
            Functional movement
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
            Calidad de marcha y potencia
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            Indicadores de movilidad que Apple Watch captura continuo: cómo caminas, qué tan
            simétrica es tu pisada, y cuánta potencia tienes al subir escaleras. En rehab
            post-bypass, deterioros sostenidos aquí aparecen antes que en la cardio formal.
          </p>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted-foreground)] dark:border-white/10 dark:bg-white/5 dark:text-white/70">
          {rangeLabel}
        </div>
      </div>

      {noData ? (
        <Surface className="p-6 shadow-sm dark:shadow-none">
          <p className="text-sm text-[var(--muted-foreground)] dark:text-white/45">
            Sin datos de movilidad aún en este rango. Las series vienen de Apple Health (Walking
            Speed / Asymmetry / Double Support / Stair Speed Up).
          </p>
        </Surface>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => setOpenChart('walkingSpeed')} className="text-left">
            <Surface className="p-5 shadow-sm transition hover:border-emerald-300/40 dark:shadow-none">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-3 ${TONES.walkHr.icon}`}>
                  <Footprints className="h-5 w-5" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  Walking Speed
                </div>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                  {speed7d == null ? '—' : formatMetricValue(speed7d, 2)}
                </div>
                <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                  m/s · 7d
                </div>
              </div>
              {speedBand ? (
                <div className={`mt-2 text-sm font-medium ${bandText(speedBand.color)}`}>
                  {speedBand.label}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Población sana 50+ ~ 1.2 m/s
              </div>
            </Surface>
          </button>

          <button type="button" onClick={() => setOpenChart('asymmetry')} className="text-left">
            <Surface className="p-5 shadow-sm transition hover:border-emerald-300/40 dark:shadow-none">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-3 ${TONES.walkHr.icon}`}>
                  <GitCompare className="h-5 w-5" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  Asimetría
                </div>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                  {asym7d == null ? '—' : formatMetricValue(asym7d, 1)}
                </div>
                <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                  % · 7d
                </div>
              </div>
              {asymBand ? (
                <div className={`mt-2 text-sm font-medium ${bandText(asymBand.color)}`}>
                  {asymBand.label}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Sano &lt; 2% · sostenido &gt; 4% bandera
              </div>
            </Surface>
          </button>

          <button type="button" onClick={() => setOpenChart('doubleSupport')} className="text-left">
            <Surface className="p-5 shadow-sm transition hover:border-emerald-300/40 dark:shadow-none">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-3 ${TONES.walkHr.icon}`}>
                  <GitCompare className="h-5 w-5" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  Double Support
                </div>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                  {dsupp7d == null ? '—' : formatMetricValue(dsupp7d, 1)}
                </div>
                <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                  % · 7d
                </div>
              </div>
              {dsuppBand ? (
                <div className={`mt-2 text-sm font-medium ${bandText(dsuppBand.color)}`}>
                  {dsuppBand.label}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Sano 18–24% · &gt; 28% gait inseguro
              </div>
            </Surface>
          </button>

          <button type="button" onClick={() => setOpenChart('stairUp')} className="text-left">
            <Surface className="p-5 shadow-sm transition hover:border-emerald-300/40 dark:shadow-none">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-3 ${TONES.walkHr.icon}`}>
                  <MoveUp className="h-5 w-5" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                  Stair Speed Up
                </div>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                  {stairUp7d == null ? '—' : formatMetricValue(stairUp7d, 2)}
                </div>
                <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                  m/s · 7d
                </div>
              </div>
              {stairUpBand ? (
                <div className={`mt-2 text-sm font-medium ${bandText(stairUpBand.color)}`}>
                  {stairUpBand.label}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                Bueno &gt; 0.5 m/s · proxy de potencia cardíaca
              </div>
            </Surface>
          </button>
        </div>
      )}

      {stairDown7d != null ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatPill
            label="Stair Speed Down · 7d"
            value={`${formatMetricValue(stairDown7d, 2)} m/s`}
          />
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs text-[var(--muted-foreground)] dark:border-white/10 dark:bg-black/20 dark:text-white/55">
            <MoveDown className="h-4 w-4" />
            Bajar escaleras se ve menos afectado por la rehab; útil como contraste del Up.
          </div>
        </div>
      ) : null}

      <ChartModal
        config={
          openChart === 'walkingSpeed'
            ? speedConfig
            : openChart === 'asymmetry'
              ? asymConfig
              : openChart === 'doubleSupport'
                ? dsuppConfig
                : openChart === 'stairUp'
                  ? stairUpConfig
                  : null
        }
        onClose={() => setOpenChart(null)}
        rangeLabel={rangeLabel}
      />
    </section>
  );
}
