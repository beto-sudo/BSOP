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

export function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function buildLinePath(trend: Point[], min: number, range: number, width = 320, height = 180, padding = 14) {
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
