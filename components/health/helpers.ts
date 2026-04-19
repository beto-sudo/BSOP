import type { HealthMetricRow } from '@/lib/health';
import type { Point } from './types';

/**
 * Collapse raw metric rows into a single daily-average series, sorted asc by
 * ISO date. Trend charts consume this; hero cards use raw vitals directly.
 */
export function groupDailyAverage(rows: HealthMetricRow[]) {
  const buckets = new Map<string, { total: number; count: number }>();

  rows.forEach((row) => {
    const key = row.date.slice(0, 10);
    const existing = buckets.get(key) ?? { total: 0, count: 0 };
    existing.total += row.value;
    existing.count += 1;
    buckets.set(key, existing);
  });

  return Array.from(buckets.entries())
    .map(([date, bucket]) => ({
      date,
      value: bucket.count ? bucket.total / bucket.count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sleep comes in as one row per stage/segment, from two devices (Sleeptracker®
 * bed and Apple Watch). A plain average is nonsense — it ends up averaging
 * 15-min stage slivers. Correct daily total is SUM per source per day, then
 * GREATEST across sources (never double-count the two devices).
 */
export function groupDailySleep(rows: HealthMetricRow[]): Point[] {
  const buckets = new Map<string, { sleeptracker: number; other: number }>();
  rows.forEach((row) => {
    const key = row.date.slice(0, 10);
    const existing = buckets.get(key) ?? { sleeptracker: 0, other: 0 };
    const isSleeptracker = (row.source ?? '').toLowerCase().includes('sleeptracker');
    if (isSleeptracker) existing.sleeptracker += row.value;
    else existing.other += row.value;
    buckets.set(key, existing);
  });
  return Array.from(buckets.entries())
    .map(([date, b]) => ({ date, value: Math.max(b.sleeptracker, b.other) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Body Mass arrives in lb from Garmin Connect and occasionally in kg from
 * other sources. Normalize everything to lb before charting.
 */
export function normalizeWeightToLb(row: HealthMetricRow): number {
  const unit = (row.unit ?? '').toLowerCase();
  if (unit.startsWith('kg')) return row.value * 2.20462;
  return row.value;
}

/**
 * Daily weight series restricted to a primary source (Garmin Connect), with
 * values normalized to lb. Averages multiple readings on the same day.
 */
export function groupDailyWeightConnect(rows: HealthMetricRow[]): Point[] {
  const connect = rows.filter((row) => row.source === 'Connect');
  const buckets = new Map<string, { total: number; count: number }>();
  connect.forEach((row) => {
    const key = row.date.slice(0, 10);
    const existing = buckets.get(key) ?? { total: 0, count: 0 };
    existing.total += normalizeWeightToLb(row);
    existing.count += 1;
    buckets.set(key, existing);
  });
  return Array.from(buckets.entries())
    .map(([date, bucket]) => ({
      date,
      value: bucket.count ? bucket.total / bucket.count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Average a precomputed daily series over a rolling window. Use this when
 * rows have already been collapsed (e.g. sleep totals, normalized weight) so
 * raw-row averaging doesn't undo the collapse.
 */
export function summarizeDailyWindow(points: Point[], days: number, endOffsetDays: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - endOffsetDays);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const filtered = points.filter((point) => {
    if (point.value <= 0) return false;
    const t = new Date(`${point.date}T12:00:00`).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  if (!filtered.length) return null;
  const total = filtered.reduce((sum, point) => sum + point.value, 0);
  return total / filtered.length;
}

/**
 * Average a metric over a rolling window that ends `endOffsetDays` ago and
 * spans `days` days. Returns null when no rows fall in the window.
 */
export function summarizeWindow(rows: HealthMetricRow[], days: number, endOffsetDays: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - endOffsetDays);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const filtered = rows.filter((row) => {
    const date = new Date(row.date).getTime();
    return date >= start.getTime() && date <= end.getTime();
  });

  if (!filtered.length) return null;
  const total = filtered.reduce((sum, row) => sum + row.value, 0);
  return total / filtered.length;
}

/**
 * Compute the delta between the most recent `currentDays` window and the
 * immediately preceding `prevDays` window, on a precomputed daily series.
 * Returns null when either window is empty. Matches the daily briefing
 * pattern (7d vs prev 23d) so dashboards and briefings stay in sync.
 */
export function computePrevWindowDelta(
  points: Point[],
  currentDays: number,
  prevDays: number
): { current: number; previous: number; delta: number } | null {
  const current = summarizeDailyWindow(points, currentDays, 0);
  const previous = summarizeDailyWindow(points, prevDays, currentDays);
  if (current == null || previous == null) return null;
  return { current, previous, delta: current - previous };
}

/**
 * Flag a metric as stale when its most recent sample is older than
 * `maxDaysStale` days. Used to surface sync gaps on hero cards (e.g. Garmin
 * scale disconnection manifests as Body Mass going stale).
 */
export function isStaleSince(latestIso: string | null | undefined, maxDaysStale: number) {
  if (!latestIso) return { stale: true, daysAgo: null as number | null };
  const latestMs = new Date(latestIso).getTime();
  if (!Number.isFinite(latestMs)) return { stale: true, daysAgo: null as number | null };
  const daysAgo = Math.floor((Date.now() - latestMs) / 86_400_000);
  return { stale: daysAgo > maxDaysStale, daysAgo };
}

/**
 * Group sleep-stage rows into per-stage daily totals, de-duplicated across
 * Sleeptracker®/Apple Watch by taking the larger value per stage per day.
 * Returns series keyed by stage name for breakdown charts.
 */
export function groupSleepStages(rows: HealthMetricRow[]) {
  const stages = ['Sleep Core', 'Sleep Deep', 'Sleep REM', 'Sleep Awake'] as const;
  type Stage = (typeof stages)[number];
  const buckets = new Map<string, Record<Stage, { sleeptracker: number; other: number }>>();
  rows.forEach((row) => {
    const stage = row.metric_name as Stage;
    if (!stages.includes(stage)) return;
    const key = row.date.slice(0, 10);
    const existing =
      buckets.get(key) ??
      (Object.fromEntries(stages.map((s) => [s, { sleeptracker: 0, other: 0 }])) as Record<
        Stage,
        { sleeptracker: number; other: number }
      >);
    const isSleeptracker = (row.source ?? '').toLowerCase().includes('sleeptracker');
    if (isSleeptracker) existing[stage].sleeptracker += row.value;
    else existing[stage].other += row.value;
    buckets.set(key, existing);
  });
  const entries = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const averages: Record<Stage, number> = {
    'Sleep Core': 0,
    'Sleep Deep': 0,
    'Sleep REM': 0,
    'Sleep Awake': 0,
  };
  if (!entries.length) return averages;
  entries.forEach(([, stageMap]) => {
    stages.forEach((stage) => {
      const b = stageMap[stage];
      averages[stage] += Math.max(b.sleeptracker, b.other);
    });
  });
  stages.forEach((stage) => {
    averages[stage] = averages[stage] / entries.length;
  });
  return averages;
}

export function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function buildLinePath(
  trend: Point[],
  min: number,
  range: number,
  width = 320,
  height = 180,
  padding = 14
) {
  return trend
    .map((point, index) => {
      const x = (index / Math.max(trend.length - 1, 1)) * (width - padding * 2) + padding;
      const y = height - 28 - ((point.value - min) / range) * (height - 52);
      return `${index === 0 ? 'M' : 'L'} ${x} ${Number.isFinite(y) ? y : height / 2}`;
    })
    .join(' ');
}

export function getStats(points: Point[]) {
  if (!points.length) return null;
  const values = points.map((point) => point.value);
  const latest = values.at(-1) ?? null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { latest, avg, min, max };
}

export function getDelta(points: Point[]) {
  if (points.length < 2) return null;
  const midpoint = Math.floor(points.length / 2);
  const current = points.slice(midpoint);
  const previous = points.slice(0, midpoint);
  if (!current.length || !previous.length) return null;
  const currentAvg = current.reduce((sum, point) => sum + point.value, 0) / current.length;
  const previousAvg = previous.reduce((sum, point) => sum + point.value, 0) / previous.length;
  return currentAvg - previousAvg;
}
