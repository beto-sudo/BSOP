import { describe, expect, it } from 'vitest';
import type { HealthMetricRow } from '@/lib/health';
import {
  classifyBand,
  getRecoveryFlag,
  groupDailySleep,
  groupDailySleepEfficiency,
  groupSleepStages,
  type Band,
} from './helpers';
import type { Point } from './types';

function row(
  metric_name: string,
  date: string,
  value: number,
  source = 'Sleeptracker®'
): HealthMetricRow {
  return { id: 1, metric_name, date, value, unit: 'hr', source };
}

describe('groupDailySleepEfficiency', () => {
  it('returns (asleep / inBed) × 100 per day, capped at 100', () => {
    const points = groupDailySleepEfficiency([
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 5.6),
      row('Sleep Deep', '2026-04-23T23:16:00.000Z', 0.85),
      row('Sleep REM', '2026-04-23T23:16:00.000Z', 2.13),
      row('Sleep In Bed', '2026-04-23T23:16:00.000Z', 8.75),
      row('Sleep Awake', '2026-04-23T23:16:00.000Z', 0.12), // ignored — not asleep
    ]);
    expect(points).toHaveLength(1);
    // (5.6 + 0.85 + 2.13) / 8.75 × 100 ≈ 98.06
    expect(points[0]!.value).toBeCloseTo(98.06, 1);
  });

  it('skips days that have asleep but no In Bed (Apple Watch nap)', () => {
    const points = groupDailySleepEfficiency([
      row('Sleep Core', '2026-04-29T18:00:00.000Z', 0.5, "Adalberto's Apple Watch"),
    ]);
    expect(points).toEqual([]);
  });

  it('takes the larger of Sleeptracker® and Apple Watch per day for each side', () => {
    const points = groupDailySleepEfficiency([
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 5, 'Sleeptracker®'),
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 4.5, "Adalberto's Apple Watch"),
      row('Sleep Deep', '2026-04-23T23:16:00.000Z', 1, 'Sleeptracker®'),
      row('Sleep REM', '2026-04-23T23:16:00.000Z', 2, 'Sleeptracker®'),
      row('Sleep In Bed', '2026-04-23T23:16:00.000Z', 8, 'Sleeptracker®'),
    ]);
    // Use Sleeptracker® totals (larger asleep): (5+1+2)/8 = 100%
    expect(points[0]!.value).toBe(100);
  });

  it('caps efficiency at 100 even if asleep > inBed (data quirk)', () => {
    const points = groupDailySleepEfficiency([
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 9),
      row('Sleep In Bed', '2026-04-23T23:16:00.000Z', 8),
    ]);
    expect(points[0]!.value).toBe(100);
  });

  it('collapses fragmented samples per source/stage via MAX, not SUM', () => {
    // HAE Time Grouping = Minute splits one night into N samples, each
    // carrying the cumulative session total. Naive sum would inflate.
    const aw = "Adalberto's Apple Watch";
    const points = groupDailySleepEfficiency([
      row('Sleep Core', '2026-05-05T03:37:00.000Z', 5.74, aw),
      row('Sleep Core', '2026-05-05T06:29:00.000Z', 4.35, aw),
      row('Sleep Core', '2026-05-05T07:49:00.000Z', 3.02, aw),
      row('Sleep Deep', '2026-05-05T03:37:00.000Z', 0.74, aw),
      row('Sleep Deep', '2026-05-05T06:29:00.000Z', 0.09, aw),
      row('Sleep REM', '2026-05-05T03:37:00.000Z', 2.8, aw),
      row('Sleep In Bed', '2026-05-05T03:37:00.000Z', 9.5, 'Sleeptracker®'),
    ]);
    // asleep = max stages: Core 5.74 + Deep 0.74 + REM 2.8 = 9.28
    // inBed = 9.5
    // efficiency = 9.28 / 9.5 ≈ 97.7 (NOT >100 from a 24h sum)
    expect(points[0]!.value).toBeCloseTo(97.68, 1);
  });
});

describe('groupDailySleep', () => {
  const aw = "Adalberto's Apple Watch";

  it('skips Awake and In Bed; sums Core + Deep + REM per source', () => {
    const points = groupDailySleep([
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 5, 'Sleeptracker®'),
      row('Sleep Deep', '2026-04-23T23:16:00.000Z', 1, 'Sleeptracker®'),
      row('Sleep REM', '2026-04-23T23:16:00.000Z', 2, 'Sleeptracker®'),
      row('Sleep Awake', '2026-04-23T23:16:00.000Z', 0.2, 'Sleeptracker®'), // skipped
      row('Sleep In Bed', '2026-04-23T23:16:00.000Z', 8.8, 'Sleeptracker®'), // skipped
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.value).toBeCloseTo(8, 5);
  });

  it('collapses HAE-fragmented samples via MAX per (source, stage), not SUM', () => {
    // Real shape from 4-5 may: Apple Watch wrote 4 samples for one night,
    // each carrying the full session total (not segments). Sum = 24.4h
    // (impossible). MAX per stage = ~9h (correct).
    const points = groupDailySleep([
      row('Sleep Core', '2026-05-05T03:37:00.000Z', 5.74, aw),
      row('Sleep Core', '2026-05-05T06:29:00.000Z', 4.35, aw),
      row('Sleep Core', '2026-05-05T07:49:00.000Z', 3.02, aw),
      row('Sleep Core', '2026-05-05T09:18:00.000Z', 1.93, aw),
      row('Sleep Deep', '2026-05-05T03:37:00.000Z', 0.74, aw),
      row('Sleep Deep', '2026-05-05T06:29:00.000Z', 0.09, aw),
      row('Sleep REM', '2026-05-05T03:37:00.000Z', 2.8, aw),
      row('Sleep REM', '2026-05-05T06:29:00.000Z', 1.97, aw),
      row('Sleep REM', '2026-05-05T07:49:00.000Z', 1.97, aw),
      row('Sleep REM', '2026-05-05T09:18:00.000Z', 1.67, aw),
    ]);
    expect(points).toHaveLength(1);
    // max Core 5.74 + max Deep 0.74 + max REM 2.8 = 9.28
    expect(points[0]!.value).toBeCloseTo(9.28, 2);
  });

  it('takes the larger of Sleeptracker® and Apple Watch when both report', () => {
    const points = groupDailySleep([
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 5, 'Sleeptracker®'),
      row('Sleep Deep', '2026-04-23T23:16:00.000Z', 1, 'Sleeptracker®'),
      row('Sleep REM', '2026-04-23T23:16:00.000Z', 2, 'Sleeptracker®'),
      row('Sleep Core', '2026-04-23T23:16:00.000Z', 4, aw),
      row('Sleep Deep', '2026-04-23T23:16:00.000Z', 0.3, aw),
      row('Sleep REM', '2026-04-23T23:16:00.000Z', 1.7, aw),
    ]);
    // Sleeptracker total 8 vs Apple Watch total 6 → 8
    expect(points[0]!.value).toBeCloseTo(8, 5);
  });
});

describe('groupSleepStages', () => {
  it('returns per-stage averages collapsed via MAX across fragmented samples', () => {
    const aw = "Adalberto's Apple Watch";
    const averages = groupSleepStages([
      // Night 1: fragmented Apple Watch
      row('Sleep Core', '2026-05-05T03:37:00.000Z', 5.74, aw),
      row('Sleep Core', '2026-05-05T06:29:00.000Z', 4.35, aw),
      row('Sleep Deep', '2026-05-05T03:37:00.000Z', 0.74, aw),
      row('Sleep REM', '2026-05-05T03:37:00.000Z', 2.8, aw),
      row('Sleep Awake', '2026-05-05T03:37:00.000Z', 0.05, aw),
    ]);
    // 1 night, MAX per stage (not sum across the 2 Core fragments)
    expect(averages['Sleep Core']).toBeCloseTo(5.74, 2);
    expect(averages['Sleep Deep']).toBeCloseTo(0.74, 2);
    expect(averages['Sleep REM']).toBeCloseTo(2.8, 2);
    expect(averages['Sleep Awake']).toBeCloseTo(0.05, 2);
  });
});

// Build N daily Points centered on today, with values supplied via callback.
// Index 0 = oldest day; index N-1 = today.
function buildSeries(days: number, valueFor: (idx: number) => number): Point[] {
  const points: Point[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    points.push({ date: d.toISOString().slice(0, 10), value: valueFor(i) });
  }
  return points;
}

describe('getRecoveryFlag', () => {
  it('returns null when there are < 14 days of data', () => {
    const points = buildSeries(7, () => 50);
    expect(getRecoveryFlag(points, { type: 'drop', threshold: 0.1 })).toBeNull();
  });

  it('flags HRV drop > 10% vs previous 7d baseline', () => {
    // First 7 days: HRV 50, last 7 days: HRV 40 → 20% drop
    const points = buildSeries(14, (i) => (i < 7 ? 50 : 40));
    const flag = getRecoveryFlag(points, { type: 'drop', threshold: 0.1 });
    expect(flag).toEqual({ tone: 'warning', label: '↓ 20%' });
  });

  it('does not flag HRV drop within 10%', () => {
    // Only 5% drop
    const points = buildSeries(14, (i) => (i < 7 ? 50 : 47.5));
    expect(getRecoveryFlag(points, { type: 'drop', threshold: 0.1 })).toBeNull();
  });

  it('flags RHR rise > 5 bpm vs previous 7d baseline', () => {
    // First 7 days: RHR 60, last 7 days: RHR 67 → +7 bpm
    const points = buildSeries(14, (i) => (i < 7 ? 60 : 67));
    const flag = getRecoveryFlag(points, { type: 'rise', thresholdAbs: 5 });
    expect(flag).toEqual({ tone: 'warning', label: '↑ 7 bpm' });
  });

  it('does not flag RHR rise within 5 bpm', () => {
    const points = buildSeries(14, (i) => (i < 7 ? 60 : 63));
    expect(getRecoveryFlag(points, { type: 'rise', thresholdAbs: 5 })).toBeNull();
  });

  it('returns null when previous baseline is 0 (avoid divide-by-zero)', () => {
    const points = buildSeries(14, (i) => (i < 7 ? 0 : 50));
    expect(getRecoveryFlag(points, { type: 'drop', threshold: 0.1 })).toBeNull();
  });
});

describe('classifyBand', () => {
  const speedBands: ReadonlyArray<Band<'low' | 'mid' | 'good' | 'great'>> = [
    { key: 'low', max: 0.8, label: 'Bajo', color: 'rose' },
    { key: 'mid', max: 1.0, label: 'Moderado', color: 'amber' },
    { key: 'good', max: 1.4, label: 'Bueno', color: 'lime' },
    { key: 'great', max: Infinity, label: 'Muy bueno', color: 'emerald' },
  ];

  it('returns null for null/undefined/NaN', () => {
    expect(classifyBand(null, speedBands)).toBeNull();
    expect(classifyBand(undefined, speedBands)).toBeNull();
    expect(classifyBand(Number.NaN, speedBands)).toBeNull();
  });

  it('classifies into the first matching band by ascending max', () => {
    expect(classifyBand(0.5, speedBands)?.key).toBe('low');
    expect(classifyBand(0.9, speedBands)?.key).toBe('mid');
    expect(classifyBand(1.2, speedBands)?.key).toBe('good');
    expect(classifyBand(1.5, speedBands)?.key).toBe('great');
  });

  it('treats max as inclusive (boundary lands in lower band)', () => {
    expect(classifyBand(0.8, speedBands)?.key).toBe('low');
    expect(classifyBand(1.0, speedBands)?.key).toBe('mid');
    expect(classifyBand(1.4, speedBands)?.key).toBe('good');
  });

  it('falls into the catch-all band (max: Infinity) for very high values', () => {
    expect(classifyBand(99, speedBands)?.key).toBe('great');
  });
});
