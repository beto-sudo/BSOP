import { DATE_TIME_FMT, DAY_FMT, MONTH_FMT, MXN, MXN_FULL, TZ, WEEK_FMT } from './constants';
import type { Booking, ChartBucket, RangeKey, RevenueRow } from './types';

export function nowInTz() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isoDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getRangeMeta(range: RangeKey) {
  const to = nowInTz();
  let from: Date;
  let label: string;

  switch (range) {
    case '7d':
      from = addDays(to, -6);
      label = 'Últimos 7 días';
      break;
    case '30d':
      from = addDays(to, -29);
      label = 'Últimos 30 días';
      break;
    case 'month': {
      from = new Date(to.getFullYear(), to.getMonth(), 1);
      const monthName = to.toLocaleString('es-MX', { month: 'long' });
      label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${to.getFullYear()}`;
      break;
    }
    case 'year':
      from = new Date(to.getFullYear(), 0, 1);
      label = `Año ${to.getFullYear()}`;
      break;
    case 'all':
      from = new Date(2020, 0, 1);
      label = 'Todo el historial';
      break;
    default:
      from = addDays(to, -29);
      label = 'Últimos 30 días';
  }

  return {
    from,
    to,
    fromIso: isoDateLocal(from),
    toIso: isoDateLocal(to),
    label,
  };
}

export function formatMoney(value: number | null | undefined, compact = false) {
  if (value == null || Number.isNaN(value)) return '—';
  return compact ? MXN.format(value) : MXN_FULL.format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_FMT.format(date);
}

export function normalizeSport(value: string | number | null | undefined) {
  if (value == null) return 'OTRO';
  const raw = String(value).trim().toUpperCase();
  if (raw.includes('PADEL') || raw === '1') return 'PADEL';
  if (raw.includes('TENNIS') || raw.includes('TENIS') || raw === '2') return 'TENNIS';
  return raw || 'OTRO';
}

export function statusTone(status: string | null | undefined) {
  const value = (status ?? '').toLowerCase();
  if (value.includes('error') || value.includes('fail')) return 'destructive' as const;
  if (value.includes('success') || value.includes('ok') || value.includes('done'))
    return 'default' as const;
  if (value.includes('run') || value.includes('progress')) return 'secondary' as const;
  return 'outline' as const;
}

export function buildDateLabels(from: Date, to: Date) {
  const labels: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    labels.push(isoDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

export function isCanceledBooking(booking: Booking) {
  return booking.is_canceled === true || (booking.status ?? '').toLowerCase().includes('cancel');
}

export function isoWeekKey(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return isoDateLocal(monday);
}

export function bucketRevenue(
  revenueRows: RevenueRow[],
  from: Date,
  to: Date,
  mode: 'day' | 'week' | 'month'
): ChartBucket[] {
  if (mode === 'day') {
    const dateLabels = buildDateLabels(from, to);
    const map = new Map<string, ChartBucket>();
    dateLabels.forEach((date) => {
      map.set(date, {
        key: date,
        label: DAY_FMT.format(new Date(`${date}T12:00:00`)),
        padel: 0,
        tennis: 0,
        total: 0,
        reservas: 0,
        cancelaciones: 0,
      });
    });
    revenueRows.forEach((row) => {
      const bucket = map.get(row.fecha);
      if (!bucket) return;
      const sport = normalizeSport(row.sport_id);
      const revenue = row.revenue ?? 0;
      if (sport === 'PADEL') bucket.padel += revenue;
      else if (sport === 'TENNIS') bucket.tennis += revenue;
      bucket.total += revenue;
      bucket.reservas += row.reservas ?? 0;
      bucket.cancelaciones += row.cancelaciones ?? 0;
    });
    return Array.from(map.values());
  }

  if (mode === 'week') {
    const map = new Map<string, ChartBucket>();
    revenueRows.forEach((row) => {
      const wk = isoWeekKey(row.fecha);
      if (!map.has(wk)) {
        map.set(wk, {
          key: wk,
          label: WEEK_FMT.format(new Date(`${wk}T12:00:00`)),
          padel: 0,
          tennis: 0,
          total: 0,
          reservas: 0,
          cancelaciones: 0,
        });
      }
      const bucket = map.get(wk)!;
      const sport = normalizeSport(row.sport_id);
      const revenue = row.revenue ?? 0;
      if (sport === 'PADEL') bucket.padel += revenue;
      else if (sport === 'TENNIS') bucket.tennis += revenue;
      bucket.total += revenue;
      bucket.reservas += row.reservas ?? 0;
      bucket.cancelaciones += row.cancelaciones ?? 0;
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  // month
  const map = new Map<string, ChartBucket>();
  revenueRows.forEach((row) => {
    const mk = row.fecha.substring(0, 7); // YYYY-MM
    if (!map.has(mk)) {
      map.set(mk, {
        key: mk,
        label: MONTH_FMT.format(new Date(`${mk}-15T12:00:00`)),
        padel: 0,
        tennis: 0,
        total: 0,
        reservas: 0,
        cancelaciones: 0,
      });
    }
    const bucket = map.get(mk)!;
    const sport = normalizeSport(row.sport_id);
    const revenue = row.revenue ?? 0;
    if (sport === 'PADEL') bucket.padel += revenue;
    else if (sport === 'TENNIS') bucket.tennis += revenue;
    bucket.total += revenue;
    bucket.reservas += row.reservas ?? 0;
    bucket.cancelaciones += row.cancelaciones ?? 0;
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function pickBucketMode(range: RangeKey): 'day' | 'week' | 'month' {
  if (range === '7d' || range === 'month') return 'day';
  if (range === '30d') return 'day';
  if (range === 'year') return 'week';
  return 'month'; // 'all'
}

export function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function durationLabel(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return '<1 min';
  return `${minutes} min`;
}
