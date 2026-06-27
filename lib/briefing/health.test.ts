import { describe, expect, it } from 'vitest';
import { summarizeHealth } from './health';
import type { HealthMetricRow } from '@/lib/health';

function isoDaysAgo(k: number): string {
  return new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
}

let id = 1;
function row(
  metric: string,
  daysAgo: number,
  value: number,
  source = 'Apple Watch'
): HealthMetricRow {
  return {
    id: id++,
    metric_name: metric,
    date: `${isoDaysAgo(daysAgo)}T08:00:00Z`,
    value,
    unit: null,
    source,
  };
}

/** Una noche de `h` horas, partida en las 3 etapas que cuenta groupDailySleep. */
function sleepNight(daysAgo: number, h: number): HealthMetricRow[] {
  return [
    row('Sleep Core', daysAgo, h * 0.5),
    row('Sleep Deep', daysAgo, h * 0.2),
    row('Sleep REM', daysAgo, h * 0.3),
  ];
}

describe('daily-briefing · summarizeHealth', () => {
  it('promedia 7d vs 23d previos para sueño/RHR/HRV', () => {
    const sleep = [
      ...sleepNight(1, 7),
      ...sleepNight(2, 7),
      ...sleepNight(3, 7),
      ...sleepNight(12, 6),
      ...sleepNight(15, 6),
      ...sleepNight(18, 6),
    ];
    const rhr = [row('Resting Heart Rate', 1, 60), row('Resting Heart Rate', 15, 64)];
    const hrv = [row('Heart Rate Variability', 1, 45), row('Heart Rate Variability', 15, 40)];

    const out = summarizeHealth(sleep, rhr, hrv);
    expect(out.available).toBe(true);
    expect(out.sleep7d).toBeCloseTo(7, 1);
    expect(out.sleepPrev23d).toBeCloseTo(6, 1);
    expect(out.rhr7d).toBe(60);
    expect(out.rhrPrev23d).toBe(64);
    expect(out.hrv7d).toBe(45);
    expect(out.hrvPrev23d).toBe(40);
    // sin gaps: la métrica más reciente es de ayer.
    expect(out.stale).toHaveLength(0);
  });

  it('la serie por-día incluye solo los últimos 14 días', () => {
    const sleep = [...sleepNight(2, 7), ...sleepNight(20, 6)];
    const out = summarizeHealth(sleep, [], []);
    const dates = out.perDay14d.map((d) => d.date);
    expect(dates).toContain(isoDaysAgo(2));
    expect(dates).not.toContain(isoDaysAgo(20));
  });

  it('no double-countea las dos fuentes de sueño (MAX entre dispositivos)', () => {
    // Misma noche en Sleeptracker (7h) y Apple Watch (5h) → cuenta 7, no 12.
    const sleep = [
      ...sleepNight(1, 7).map((r) => ({ ...r, source: 'Sleeptracker' })),
      ...sleepNight(1, 5),
    ];
    const out = summarizeHealth(sleep, [], []);
    expect(out.sleep7d).toBeCloseTo(7, 1);
  });

  it('sin datos: promedios null y las 3 métricas marcadas como gap', () => {
    const out = summarizeHealth([], [], []);
    expect(out.sleep7d).toBeNull();
    expect(out.rhr7d).toBeNull();
    expect(out.stale.map((s) => s.metric).sort()).toEqual(['HRV', 'RHR', 'Sueño']);
    expect(out.stale.every((s) => s.daysAgo === null)).toBe(true);
  });
});
