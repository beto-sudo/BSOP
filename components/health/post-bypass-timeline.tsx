'use client';

import { HeartPulse, Flame, Footprints, Milestone, Weight } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { CARDIAC_BYPASS_ISO, formatMetricValue, type TimelineMonthlyRow } from '@/lib/health';
import { TONES } from './tones';

type Row = { month: string; value: number };

/**
 * Slim custom sparkline for monthly rollups. Paints a surgery marker
 * at the first data point on or after the bypass ISO so pre/post is
 * obvious at a glance.
 */
function MonthlySparkline({
  rows,
  color,
  markerIso,
  formatter,
  unit,
}: {
  rows: Row[];
  color: string;
  markerIso: string;
  formatter: (v: number) => string;
  unit: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex h-28 items-center justify-center text-xs text-[var(--muted-foreground)] dark:text-white/45">
        Sin histórico
      </div>
    );
  }
  const width = 360;
  const height = 110;
  const padding = 12;
  const values = rows.map((row) => row.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max > min ? max - min : 1;
  const markerIdx = rows.findIndex((row) => row.month >= markerIso);
  const markerX =
    markerIdx >= 0
      ? (markerIdx / Math.max(rows.length - 1, 1)) * (width - padding * 2) + padding
      : null;

  const path = rows
    .map((row, index) => {
      const x = (index / Math.max(rows.length - 1, 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((row.value - min) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const latest = rows.at(-1);
  const bypassValue = markerIdx >= 0 ? rows[markerIdx]?.value : null;
  const deltaVsBypass = latest && bypassValue != null ? latest.value - bypassValue : null;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {markerX != null ? (
          <line
            x1={markerX}
            x2={markerX}
            y1={padding / 2}
            y2={height - padding / 2}
            stroke="rgba(244,114,182,0.6)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        ) : null}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {rows.map((row, index) => {
          const x = (index / Math.max(rows.length - 1, 1)) * (width - padding * 2) + padding;
          const y = height - padding - ((row.value - min) / range) * (height - padding * 2);
          return <circle key={row.month} cx={x} cy={y} r="2" fill={color} />;
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted-foreground)] dark:text-white/45">
        <span>{rows[0]?.month.slice(0, 7)}</span>
        <span className="text-rose-500 dark:text-rose-300">bypass</span>
        <span>{rows.at(-1)?.month.slice(0, 7)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-[var(--muted-foreground)] dark:text-white/55">
          Último mes: {formatter(latest?.value ?? 0)} {unit}
        </span>
        {deltaVsBypass != null ? (
          <span
            className={
              deltaVsBypass >= 0
                ? 'text-emerald-500 dark:text-emerald-300'
                : 'text-rose-500 dark:text-rose-300'
            }
          >
            {deltaVsBypass >= 0 ? '+' : ''}
            {formatter(deltaVsBypass)} {unit} vs. mes del bypass
          </span>
        ) : null}
      </div>
    </div>
  );
}

const METRIC_META = [
  {
    metric: 'Resting Heart Rate',
    title: 'Resting HR',
    icon: HeartPulse,
    tone: TONES.hr.line,
    iconTone: TONES.hr.icon,
    unit: 'bpm',
    digits: 0,
    helpful: 'Bajar el pulso en reposo es señal de recuperación cardiovascular.',
  },
  {
    metric: 'Body Mass',
    title: 'Peso',
    icon: Weight,
    tone: TONES.weight.line,
    iconTone: TONES.weight.icon,
    unit: 'lb',
    digits: 1,
    helpful: 'La tendencia mensual filtra fluctuaciones diarias.',
  },
  {
    metric: 'Step Count',
    title: 'Pasos',
    icon: Footprints,
    tone: TONES.steps.line,
    iconTone: TONES.steps.icon,
    unit: '',
    digits: 0,
    helpful: 'Actividad basal — subir es volver al ritmo de vida.',
  },
  {
    metric: 'Active Energy',
    title: 'Active Energy',
    icon: Flame,
    tone: TONES.activeEnergy.line,
    iconTone: TONES.activeEnergy.icon,
    unit: 'kcal',
    digits: 0,
    helpful: 'kcal activas promedio diarias por mes.',
  },
] as const;

export function PostBypassTimeline({ rows }: { rows: TimelineMonthlyRow[] }) {
  const byMetric = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric_name) ?? [];
    list.push({ month: row.month_start, value: row.avg_value });
    byMetric.set(row.metric_name, list);
  }
  for (const list of byMetric.values()) {
    list.sort((a, b) => a.month.localeCompare(b.month));
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">
          <Milestone className="h-4 w-4" />
          Post-bypass timeline
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
          Recuperación vs. cirugía (julio 2024)
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
          Promedios mensuales de los últimos 24 meses. La línea punteada marca el mes del triple
          bypass — todo a la derecha es recuperación.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {METRIC_META.map((meta) => {
          const Icon = meta.icon;
          const series = byMetric.get(meta.metric) ?? [];
          return (
            <Surface key={meta.metric} className="p-5 shadow-sm dark:shadow-none">
              <div className="mb-3 flex items-center gap-3 text-[var(--text)] dark:text-white">
                <div className={`rounded-2xl border p-3 ${meta.iconTone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{meta.title}</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)] dark:text-white/45">
                    {meta.helpful}
                  </p>
                </div>
              </div>
              <MonthlySparkline
                rows={series}
                color={meta.tone}
                markerIso={CARDIAC_BYPASS_ISO}
                formatter={(v) => formatMetricValue(v, meta.digits)}
                unit={meta.unit}
              />
            </Surface>
          );
        })}
      </div>
    </section>
  );
}
