'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, CalendarRange, CircleDollarSign, RefreshCw, Users, XCircle } from 'lucide-react';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';

type RangeKey = '7d' | '30d' | 'month' | 'year' | 'all';
type SportFilter = 'all' | 'PADEL' | 'TENNIS';
type PlayerSortKey = 'name' | 'reservas' | 'gasto' | 'sport';

type Booking = {
  booking_id: string;
  resource_name: string | null;
  sport_id: number | string | null;
  booking_start: string | null;
  booking_end: string | null;
  duration_min: number | null;
  price_amount: number | null;
  price_currency: string | null;
  status: string | null;
  is_canceled: boolean | null;
  owner_id: string | null;
  booking_type: string | null;
  origin: string | null;
  payment_status: string | null;
  synced_at: string | null;
};

type ReconciliationDay = {
  fecha: string;
  label: string;
  totalReservas: number;
  canceladas: number;
  revenueBruto: number;
  paid: number;
  partialPaid: number;
  pending: number;
  notApplicable: number;
  paidRevenue: number;
  partialRevenue: number;
  pendingRevenue: number;
  notApplicableRevenue: number;
  appReservas: number;
  appRevenue: number;
  managerReservas: number;
  managerRevenue: number;
};

type BookingParticipant = {
  booking_id: string;
  player_id: string | null;
  is_owner: boolean | null;
  family_member_id: string | null;
};

type RevenueRow = {
  fecha: string;
  sport_id: number | string | null;
  reservas: number | null;
  revenue: number | null;
  cancelaciones: number | null;
};

type OccupancyRow = {
  resource_name: string | null;
  fecha: string;
  hora: number | null;
  reservas: number | null;
  revenue: number | null;
};

type PlayerRow = {
  playtomic_id: string;
  name: string | null;
  email: string | null;
  player_type: string | null;
  favorite_sport: string | null;
};

type PendingBooking = {
  fecha: string;
  hora: string;
  cancha: string;
  deporte: string;
  monto: number;
  jugador: string;
  email: string;
};

type PendingSummary = {
  jugador: string;
  email: string;
  reservas: number;
  total: number;
};

type ComputedPlayer = {
  name: string | null;
  email: string | null;
  reservas: number;
  gasto: number;
  favorite_sport: string | null;
  player_type: string | null;
};

type CancelPlayerRow = {
  ownerId: string;
  name: string | null;
  email: string | null;
  totalBookings: number;
  canceledBookings: number;
  cancellationRate: number;
};

type ResourceRow = {
  resource_id: string;
  resource_name: string | null;
  sport_id: number | string | null;
  active: boolean | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type SyncRow = {
  sync_type: string | null;
  status: string | null;
  bookings_fetched: number | null;
  bookings_upserted: number | null;
  players_upserted: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

type DashboardData = {
  bookings: Booking[];
  participants: BookingParticipant[];
  revenue: RevenueRow[];
  occupancy: OccupancyRow[];
  players: PlayerRow[];
  resources: ResourceRow[];
  syncs: SyncRow[];
};

const TZ = 'America/Matamoros';
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MXN_FULL = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DAY_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short' });
const DATE_TIME_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
});
const DATE_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, year: 'numeric', month: 'short', day: '2-digit' });
const PENDING_DATE_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const PENDING_TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function nowInTz() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRangeMeta(range: RangeKey) {
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

function formatMoney(value: number | null | undefined, compact = false) {
  if (value == null || Number.isNaN(value)) return '—';
  return compact ? MXN.format(value) : MXN_FULL.format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_FMT.format(date);
}

function normalizeSport(value: string | number | null | undefined) {
  if (value == null) return 'OTRO';
  const raw = String(value).trim().toUpperCase();
  if (raw.includes('PADEL') || raw === '1') return 'PADEL';
  if (raw.includes('TENNIS') || raw.includes('TENIS') || raw === '2') return 'TENNIS';
  return raw || 'OTRO';
}

function statusTone(status: string | null | undefined) {
  const value = (status ?? '').toLowerCase();
  if (value.includes('error') || value.includes('fail')) return 'destructive' as const;
  if (value.includes('success') || value.includes('ok') || value.includes('done')) return 'default' as const;
  if (value.includes('run') || value.includes('progress')) return 'secondary' as const;
  return 'outline' as const;
}

function buildDateLabels(from: Date, to: Date) {
  const labels: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    labels.push(isoDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

type ChartBucket = {
  key: string;
  label: string;
  padel: number;
  tennis: number;
  total: number;
  reservas: number;
  cancelaciones: number;
};

const WEEK_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, month: 'short', year: '2-digit' });
const WEEKDAY_KEY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const HOUR_FMT = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false });
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const WEEKDAY_INDEX_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function isCanceledBooking(booking: Booking) {
  return booking.is_canceled === true || (booking.status ?? '').toLowerCase().includes('cancel');
}

function isoWeekKey(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return isoDateLocal(monday);
}

function bucketRevenue(revenueRows: RevenueRow[], from: Date, to: Date, mode: 'day' | 'week' | 'month'): ChartBucket[] {
  if (mode === 'day') {
    const dateLabels = buildDateLabels(from, to);
    const map = new Map<string, ChartBucket>();
    dateLabels.forEach((date) => {
      map.set(date, {
        key: date,
        label: DAY_FMT.format(new Date(`${date}T12:00:00`)),
        padel: 0, tennis: 0, total: 0, reservas: 0, cancelaciones: 0,
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
          padel: 0, tennis: 0, total: 0, reservas: 0, cancelaciones: 0,
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
        padel: 0, tennis: 0, total: 0, reservas: 0, cancelaciones: 0,
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

function pickBucketMode(range: RangeKey): 'day' | 'week' | 'month' {
  if (range === '7d' || range === 'month') return 'day';
  if (range === '30d') return 'day';
  if (range === 'year') return 'week';
  return 'month'; // 'all'
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function durationLabel(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return '<1 min';
  return `${minutes} min`;
}

function KpiCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/50">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[var(--text)]/55">{hint}</div> : null}
    </div>
  );
}

function RevenueChart({ data }: { data: ChartBucket[] }) {
  const width = 920;
  const chartHeight = 280;
  const barWidth = Math.max(8, Math.min(28, width / Math.max(data.length, 1) - 4));
  const gap = Math.max(4, Math.min(12, (width - barWidth * data.length) / Math.max(data.length - 1, 1)));
  const maxValue = Math.max(...data.map((item) => item.total), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-[var(--text)]/65">
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Padel</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Tennis</div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${chartHeight + 36}`} className="min-w-[760px] text-[var(--text)]">
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartHeight - tick * chartHeight;
            return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
          })}
          {data.map((item, index) => {
            const x = index * (barWidth + gap);
            const padelHeight = (item.padel / maxValue) * chartHeight;
            const tennisHeight = (item.tennis / maxValue) * chartHeight;
            const totalHeight = padelHeight + tennisHeight;
            const yTop = chartHeight - totalHeight;
            return (
              <g key={item.key}>
                <rect x={x} y={chartHeight - padelHeight} width={barWidth} height={padelHeight} rx={Math.min(6, barWidth / 2)} fill="#10b981" />
                <rect x={x} y={yTop} width={barWidth} height={tennisHeight} rx={Math.min(6, barWidth / 2)} fill="#0ea5e9" />
                {(index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0) ? (
                  <text x={x + barWidth / 2} y={chartHeight + 20} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.45">
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CancellationWeekdayChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 520;
  const height = 220;
  const chartHeight = 160;
  const barWidth = 44;
  const gap = 28;
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">Cancelaciones por día</h3>
        <p className="text-sm text-[var(--text)]/55">Distribución semanal de reservas canceladas.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[460px] text-[var(--text)]">
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartHeight - tick * chartHeight;
            return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
          })}
          {data.map((item, index) => {
            const x = 20 + index * (barWidth + gap);
            const barHeight = (item.value / maxValue) * chartHeight;
            const y = chartHeight - barHeight;
            return (
              <g key={item.label}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx="12" fill="#f43f5e" />
                <text x={x + barWidth / 2} y={Math.max(y - 8, 12)} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.75">
                  {item.value}
                </text>
                <text x={x + barWidth / 2} y={chartHeight + 22} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CancellationHourChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 960;
  const height = 220;
  const chartHeight = 160;
  const barWidth = Math.max(12, Math.min(24, width / Math.max(data.length, 1) - 4));
  const gap = Math.max(3, Math.min(10, (width - barWidth * data.length) / Math.max(data.length - 1, 1)));
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">Cancelaciones por hora</h3>
        <p className="text-sm text-[var(--text)]/55">Horas del día con más cancelaciones.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] text-[var(--text)]">
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartHeight - tick * chartHeight;
            return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
          })}
          {data.map((item, index) => {
            const x = index * (barWidth + gap);
            const barHeight = (item.value / maxValue) * chartHeight;
            const y = chartHeight - barHeight;
            const showLabel = index === 0 || index === data.length - 1 || index % 3 === 0;
            return (
              <g key={item.label}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" fill="#ef4444" />
                {item.value > 0 ? (
                  <text x={x + barWidth / 2} y={Math.max(y - 8, 12)} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.72">
                    {item.value}
                  </text>
                ) : null}
                {showLabel ? (
                  <text x={x + barWidth / 2} y={chartHeight + 22} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function OccupancyHeatmap({
  rows,
  resources,
  sportFilter,
}: {
  rows: OccupancyRow[];
  resources: ResourceRow[];
  sportFilter: SportFilter;
}) {
  const resourceSportMap = useMemo(
    () => new Map(resources.map((resource) => [resource.resource_name ?? '', normalizeSport(resource.sport_id)])),
    [resources],
  );

  const filteredResources = useMemo(() => {
    const sorted = [...resources].sort((a, b) => (a.resource_name ?? '').localeCompare(b.resource_name ?? '', 'es', { numeric: true }));
    return sorted.filter((resource) => sportFilter === 'all' || normalizeSport(resource.sport_id) === sportFilter);
  }, [resources, sportFilter]);

  const hours = useMemo(() => {
    const found = Array.from(new Set(rows.map((row) => row.hora).filter((value): value is number => typeof value === 'number'))).sort((a, b) => a - b);
    return found.length ? found : Array.from({ length: 18 }, (_, index) => index + 6);
  }, [rows]);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const resourceName = row.resource_name ?? '';
      const sport = resourceSportMap.get(resourceName) ?? 'OTRO';
      if (sportFilter !== 'all' && sport !== sportFilter) return;
      if (row.hora == null) return;
      const key = `${resourceName}__${row.hora}`;
      map.set(key, (map.get(key) ?? 0) + (row.reservas ?? 0));
    });
    return map;
  }, [resourceSportMap, rows, sportFilter]);

  const maxReservations = Math.max(...Array.from(cellMap.values()), 1);

  const colorForValue = (value: number) => {
    if (!value) return 'rgba(148, 163, 184, 0.08)';
    const alpha = 0.18 + (value / maxReservations) * 0.72;
    return sportFilter === 'TENNIS' ? `rgba(14, 165, 233, ${alpha})` : `rgba(16, 185, 129, ${alpha})`;
  };

  return (
    <div className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[var(--text)]">Mapa de ocupación</div>
          <div className="text-sm text-[var(--text)]/55">Intensidad por hora y cancha. Más oscuro = más reservas.</div>
        </div>
        <div className="text-xs text-[var(--text)]/45">{filteredResources.length} canchas</div>
      </div>
      <div className="min-w-[760px]">
        <div className="grid" style={{ gridTemplateColumns: `180px repeat(${hours.length}, minmax(42px, 1fr))` }}>
          <div className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">Cancha</div>
          {hours.map((hour) => (
            <div key={hour} className="border-b border-[var(--border)] px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text)]/45">
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
          {filteredResources.map((resource) => (
            <div key={resource.resource_id} className="contents">
              <div className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm text-[var(--text)]">
                <div className="font-medium">{resource.resource_name ?? 'Sin nombre'}</div>
                <div className="text-xs text-[var(--text)]/45">{normalizeSport(resource.sport_id)}</div>
              </div>
              {hours.map((hour) => {
                const value = cellMap.get(`${resource.resource_name ?? ''}__${hour}`) ?? 0;
                return (
                  <div
                    key={`${resource.resource_id}-${hour}`}
                    className="flex h-12 items-center justify-center border-b border-[var(--border)] text-xs font-medium text-[var(--text)]"
                    style={{ backgroundColor: colorForValue(value) }}
                    title={`${resource.resource_name ?? 'Cancha'} · ${hour}:00 · ${value} reserva${value === 1 ? '' : 's'}`}
                  >
                    {value || ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PlaytomicPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerSort, setPlayerSort] = useState<PlayerSortKey>('gasto');
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const { sortKey: pendingSortKey, sortDir: pendingSortDir, onSort: pendingOnSort, sortData: pendingSortData } = useSortableTable<PendingBooking>('fecha', 'desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    participants: [],
    revenue: [],
    occupancy: [],
    players: [],
    resources: [],
    syncs: [],
  });

  const meta = useMemo(() => getRangeMeta(range), [range]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const schema = supabase.schema('playtomic');

      const bookingsFromBounds = getLocalDayBoundsUtc(meta.fromIso, TZ);
      const bookingsToBounds = getLocalDayBoundsUtc(meta.toIso, TZ);

      const bookingsQuery = schema
        .from('bookings')
        .select('booking_id,resource_name,sport_id,booking_start,booking_end,duration_min,price_amount,price_currency,status,is_canceled,owner_id,booking_type,origin,payment_status,synced_at')
        .gte('booking_start', bookingsFromBounds.start)
        .lte('booking_start', bookingsToBounds.end)
        .order('booking_start', { ascending: true })
        .limit(range === 'all' || range === 'year' ? 15000 : range === '30d' || range === 'month' ? 5000 : 2000);

      const revenueQuery = schema
        .from('v_revenue_diario')
        .select('fecha,sport_id,reservas,revenue,cancelaciones')
        .gte('fecha', meta.fromIso)
        .lte('fecha', meta.toIso)
        .order('fecha', { ascending: true });

      const occupancyQuery = schema
        .from('v_ocupacion_diaria')
        .select('resource_name,fecha,hora,reservas,revenue')
        .gte('fecha', meta.fromIso)
        .lte('fecha', meta.toIso)
        .order('resource_name', { ascending: true });

      const playersQuery = schema
        .from('players')
        .select('playtomic_id,name,email,player_type,favorite_sport')
        .limit(2000);

      const resourcesQuery = schema
        .from('resources')
        .select('resource_id,resource_name,sport_id,active,first_seen_at,last_seen_at')
        .order('resource_name', { ascending: true })
        .limit(50);

      const syncsQuery = schema
        .from('sync_log')
        .select('sync_type,status,bookings_fetched,bookings_upserted,players_upserted,started_at,finished_at,error_message')
        .order('started_at', { ascending: false })
        .limit(10);

      const [bookingsRes, revenueRes, occupancyRes, playersRes, resourcesRes, syncsRes] = await Promise.all([
        bookingsQuery,
        revenueQuery,
        occupancyQuery,
        playersQuery,
        resourcesQuery,
        syncsQuery,
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (revenueRes.error) throw revenueRes.error;
      if (occupancyRes.error) throw occupancyRes.error;
      if (playersRes.error) throw playersRes.error;
      if (resourcesRes.error) throw resourcesRes.error;
      if (syncsRes.error) throw syncsRes.error;

      const bookings = (bookingsRes.data ?? []) as Booking[];
      const bookingIds = bookings.map((booking) => booking.booking_id).filter(Boolean);
      const participants: BookingParticipant[] = [];

      if (bookingIds.length) {
        const bookingChunks = chunkArray(bookingIds, 500);
        const participantResponses = await Promise.all(
          bookingChunks.map((chunk) =>
            schema
              .from('booking_participants')
              .select('booking_id,player_id,is_owner,family_member_id')
              .in('booking_id', chunk),
          ),
        );

        participantResponses.forEach((response) => {
          if (response.error) throw response.error;
          participants.push(...((response.data ?? []) as BookingParticipant[]));
        });
      }

      setData({
        bookings,
        participants,
        revenue: (revenueRes.data ?? []) as RevenueRow[],
        occupancy: (occupancyRes.data ?? []) as OccupancyRow[],
        players: (playersRes.data ?? []) as PlayerRow[],
        resources: (resourcesRes.data ?? []) as ResourceRow[],
        syncs: (syncsRes.data ?? []) as SyncRow[],
      });
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar el dashboard de Playtomic');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [meta.fromIso, meta.toIso, range]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const revenueSeries = useMemo<ChartBucket[]>(() => {
    const mode = pickBucketMode(range);
    return bucketRevenue(data.revenue, meta.from, meta.to, mode);
  }, [data.revenue, meta.from, meta.to, range]);

  const kpis = useMemo(() => {
    const totalBookings = data.bookings.length;
    const revenueTotal = data.bookings
      .filter((booking) => !booking.is_canceled && !(booking.status ?? '').toLowerCase().includes('cancel'))
      .reduce((acc, booking) => acc + (booking.price_amount ?? 0), 0);
    const canceledCount = data.bookings.filter((booking) => booking.is_canceled || (booking.status ?? '').toLowerCase().includes('cancel')).length;
    const cancellationRate = totalBookings ? (canceledCount / totalBookings) * 100 : 0;
    const avgBookingValue = totalBookings ? revenueTotal / totalBookings : 0;
    const uniquePlayers = new Set<string>();

    data.bookings.forEach((booking) => {
      if (booking.owner_id) uniquePlayers.add(booking.owner_id);
    });
    data.participants.forEach((participant) => {
      if (participant.player_id) uniquePlayers.add(participant.player_id);
      if (participant.family_member_id) uniquePlayers.add(participant.family_member_id);
    });

    return {
      totalBookings,
      revenueTotal,
      cancellationRate,
      uniquePlayers: uniquePlayers.size,
      avgBookingValue,
      lastSync: data.syncs[0] ?? null,
    };
  }, [data.bookings, data.participants, data.syncs]);

  const filteredOccupancy = useMemo(() => {
    if (sportFilter === 'all') return data.occupancy;
    const allowed = new Set(
      data.resources
        .filter((resource) => normalizeSport(resource.sport_id) === sportFilter)
        .map((resource) => resource.resource_name ?? ''),
    );
    return data.occupancy.filter((row) => allowed.has(row.resource_name ?? ''));
  }, [data.occupancy, data.resources, sportFilter]);

  const cancellationAnalysis = useMemo(() => {
    const playerMap = new Map(data.players.map((player) => [player.playtomic_id, player]));
    const canceledBookings = data.bookings.filter((booking) => isCanceledBooking(booking));
    const sports = {
      PADEL: { total: 0, canceled: 0 },
      TENNIS: { total: 0, canceled: 0 },
    };

    const cancellationsByWeekday = WEEKDAY_LABELS.map((label) => ({ label, value: 0 }));
    const cancellationsByHour = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: 0 }));
    const cancelers = new Map<string, { totalBookings: number; canceledBookings: number }>();
    let canceledDurationTotal = 0;
    let canceledDurationCount = 0;

    data.bookings.forEach((booking) => {
      const canceled = isCanceledBooking(booking);
      const sport = normalizeSport(booking.sport_id);
      if (sport === 'PADEL' || sport === 'TENNIS') {
        sports[sport].total += 1;
        if (canceled) sports[sport].canceled += 1;
      }

      if (booking.owner_id) {
        const entry = cancelers.get(booking.owner_id) ?? { totalBookings: 0, canceledBookings: 0 };
        entry.totalBookings += 1;
        if (canceled) entry.canceledBookings += 1;
        cancelers.set(booking.owner_id, entry);
      }

      if (!canceled || !booking.booking_start) return;

      if (typeof booking.duration_min === 'number' && Number.isFinite(booking.duration_min)) {
        canceledDurationTotal += booking.duration_min;
        canceledDurationCount += 1;
      }

      const bookingDate = new Date(booking.booking_start);
      if (Number.isNaN(bookingDate.getTime())) return;

      const weekdayKey = WEEKDAY_KEY_FMT.format(bookingDate);
      const weekdayIndex = WEEKDAY_INDEX_MAP[weekdayKey];
      if (weekdayIndex != null) cancellationsByWeekday[weekdayIndex].value += 1;

      const hourValue = Number.parseInt(HOUR_FMT.format(bookingDate), 10);
      if (!Number.isNaN(hourValue) && cancellationsByHour[hourValue]) cancellationsByHour[hourValue].value += 1;
    });

    const topCancelers = Array.from(cancelers.entries())
      .map(([ownerId, stats]) => ({
        ownerId,
        name: playerMap.get(ownerId)?.name ?? null,
        email: playerMap.get(ownerId)?.email ?? null,
        totalBookings: stats.totalBookings,
        canceledBookings: stats.canceledBookings,
        cancellationRate: stats.totalBookings ? (stats.canceledBookings / stats.totalBookings) * 100 : 0,
      }))
      .filter((player): player is CancelPlayerRow => player.canceledBookings >= 2)
      .sort((a, b) => b.canceledBookings - a.canceledBookings || b.cancellationRate - a.cancellationRate || (a.name ?? '').localeCompare(b.name ?? '', 'es'))
      .slice(0, 10);

    return {
      canceledCount: canceledBookings.length,
      cancellationRate: data.bookings.length ? (canceledBookings.length / data.bookings.length) * 100 : 0,
      avgCanceledDuration: canceledDurationCount ? canceledDurationTotal / canceledDurationCount : 0,
      sports,
      cancellationsByWeekday,
      cancellationsByHour,
      topCancelers,
    };
  }, [data.bookings, data.players]);

  const computedPlayers = useMemo<ComputedPlayer[]>(() => {
    // Build a map of player_id -> { bookings count, total spend } from filtered bookings
    const playerStats = new Map<string, { reservas: number; gasto: number; sports: Map<string, number> }>();

    // Map booking_id -> booking for quick lookup
    const bookingMap = new Map(data.bookings.map((b) => [b.booking_id, b]));

    // Count owner bookings
    data.bookings.forEach((b) => {
      if (b.owner_id && !b.is_canceled) {
        const entry = playerStats.get(b.owner_id) ?? { reservas: 0, gasto: 0, sports: new Map() };
        entry.reservas += 1;
        entry.gasto += b.price_amount ?? 0;
        const sport = normalizeSport(b.sport_id);
        entry.sports.set(sport, (entry.sports.get(sport) ?? 0) + 1);
        playerStats.set(b.owner_id, entry);
      }
    });

    // Count participant bookings (non-owner)
    data.participants.forEach((p) => {
      if (p.player_id && !p.is_owner) {
        const booking = bookingMap.get(p.booking_id);
        if (booking && !booking.is_canceled) {
          const entry = playerStats.get(p.player_id) ?? { reservas: 0, gasto: 0, sports: new Map() };
          entry.reservas += 1;
          const sport = normalizeSport(booking.sport_id);
          entry.sports.set(sport, (entry.sports.get(sport) ?? 0) + 1);
          playerStats.set(p.player_id, entry);
        }
      }
    });

    // Build player lookup
    const playerMap = new Map(data.players.map((p) => [p.playtomic_id, p]));

    // Merge stats with player info
    return Array.from(playerStats.entries()).map(([playerId, stats]) => {
      const player = playerMap.get(playerId);
      // Determine favorite sport from period data
      let favSport: string | null = null;
      let maxCount = 0;
      stats.sports.forEach((count, sport) => {
        if (count > maxCount) { maxCount = count; favSport = sport; }
      });
      return {
        name: player?.name ?? null,
        email: player?.email ?? null,
        reservas: stats.reservas,
        gasto: stats.gasto,
        favorite_sport: favSport,
        player_type: player?.player_type ?? null,
      };
    });
  }, [data.bookings, data.participants, data.players]);

  const topPlayers = useMemo(() => {
    const searched = computedPlayers.filter((player) => {
      if (!playerQuery.trim()) return true;
      const query = playerQuery.toLowerCase();
      return (
        (player.name ?? '').toLowerCase().includes(query) ||
        (player.email ?? '').toLowerCase().includes(query) ||
        (player.favorite_sport ?? '').toLowerCase().includes(query)
      );
    });

    return [...searched].sort((a, b) => {
      if (playerSort === 'name') return (a.name ?? '').localeCompare(b.name ?? '', 'es');
      if (playerSort === 'reservas') return b.reservas - a.reservas;
      if (playerSort === 'sport') return (a.favorite_sport ?? '').localeCompare(b.favorite_sport ?? '', 'es');
      return b.gasto - a.gasto;
    });
  }, [computedPlayers, playerQuery, playerSort]);

  const reconciliation = useMemo(() => {
    const dayMap = new Map<string, ReconciliationDay>();

    data.bookings.forEach((booking) => {
      if (!booking.booking_start || isCanceledBooking(booking)) return;

      const bookingDate = new Date(booking.booking_start);
      if (Number.isNaN(bookingDate.getTime())) return;

      const fecha = bookingDate.toLocaleDateString('en-CA', { timeZone: TZ });
      const amount = booking.price_amount ?? 0;
      const paymentStatus = (booking.payment_status ?? 'NOT_APPLICABLE').toUpperCase();
      const origin = (booking.origin ?? '').toUpperCase();

      const existing = dayMap.get(fecha) ?? {
        fecha,
        label: DATE_FMT.format(new Date(`${fecha}T12:00:00`)),
        totalReservas: 0,
        canceladas: 0,
        revenueBruto: 0,
        paid: 0,
        partialPaid: 0,
        pending: 0,
        notApplicable: 0,
        paidRevenue: 0,
        partialRevenue: 0,
        pendingRevenue: 0,
        notApplicableRevenue: 0,
        appReservas: 0,
        appRevenue: 0,
        managerReservas: 0,
        managerRevenue: 0,
      } satisfies ReconciliationDay;

      existing.totalReservas += 1;
      existing.revenueBruto += amount;

      if (paymentStatus === 'PAID') {
        existing.paid += 1;
        existing.paidRevenue += amount;
      } else if (paymentStatus === 'PARTIAL_PAID') {
        existing.partialPaid += 1;
        existing.partialRevenue += amount;
      } else if (paymentStatus === 'PENDING') {
        existing.pending += 1;
        existing.pendingRevenue += amount;
      } else {
        existing.notApplicable += 1;
        existing.notApplicableRevenue += amount;
      }

      if (origin === 'APP_IOS' || origin === 'APP_ANDROID') {
        existing.appReservas += 1;
        existing.appRevenue += amount;
      } else if (origin === 'MANAGER' || origin === 'PLAYTOMIC_MANAGER') {
        existing.managerReservas += 1;
        existing.managerRevenue += amount;
      }

      dayMap.set(fecha, existing);
    });

    const allDays = Array.from(dayMap.values());
    const sortedDays = [...allDays].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const rows = sortedDays.slice(0, 60);
    const truncated = allDays.length > 60;

    const totals = allDays.reduce(
      (acc, day) => ({
        fecha: 'TOTAL',
        label: 'Totales',
        totalReservas: acc.totalReservas + day.totalReservas,
        canceladas: acc.canceladas + day.canceladas,
        revenueBruto: acc.revenueBruto + day.revenueBruto,
        paid: acc.paid + day.paid,
        partialPaid: acc.partialPaid + day.partialPaid,
        pending: acc.pending + day.pending,
        notApplicable: acc.notApplicable + day.notApplicable,
        paidRevenue: acc.paidRevenue + day.paidRevenue,
        partialRevenue: acc.partialRevenue + day.partialRevenue,
        pendingRevenue: acc.pendingRevenue + day.pendingRevenue,
        notApplicableRevenue: acc.notApplicableRevenue + day.notApplicableRevenue,
        appReservas: acc.appReservas + day.appReservas,
        appRevenue: acc.appRevenue + day.appRevenue,
        managerReservas: acc.managerReservas + day.managerReservas,
        managerRevenue: acc.managerRevenue + day.managerRevenue,
      }),
      {
        fecha: 'TOTAL',
        label: 'Totales',
        totalReservas: 0,
        canceladas: 0,
        revenueBruto: 0,
        paid: 0,
        partialPaid: 0,
        pending: 0,
        notApplicable: 0,
        paidRevenue: 0,
        partialRevenue: 0,
        pendingRevenue: 0,
        notApplicableRevenue: 0,
        appReservas: 0,
        appRevenue: 0,
        managerReservas: 0,
        managerRevenue: 0,
      } satisfies ReconciliationDay,
    );

    const csvRows = sortedDays.map((day) => ({
      Fecha: day.fecha,
      Reservas: day.totalReservas,
      'Revenue Bruto': day.revenueBruto,
      Pagado: day.paid,
      'Pagado Revenue': day.paidRevenue,
      Parcial: day.partialPaid,
      'Parcial Revenue': day.partialRevenue,
      Pendiente: day.pending,
      'Pendiente Revenue': day.pendingRevenue,
      'N/A': day.notApplicable,
      'N/A Revenue': day.notApplicableRevenue,
      'Vía App': day.appReservas,
      'Vía App Revenue': day.appRevenue,
      Directo: day.managerReservas,
      'Directo Revenue': day.managerRevenue,
    }));

    return {
      rows,
      totals,
      truncated,
      totalDays: allDays.length,
      summary: {
        revenueBruto: totals.revenueBruto,
        appRevenue: totals.appRevenue,
        managerRevenue: totals.managerRevenue,
        pendingRevenue: totals.pendingRevenue,
      },
      csvRows,
    };
  }, [data.bookings]);

  const pendingPayments = useMemo(() => {
    const playerMap = new Map(data.players.map((player) => [player.playtomic_id, player]));
    const ownerParticipantMap = new Map<string, BookingParticipant>();

    data.participants.forEach((participant) => {
      if (participant.booking_id && participant.is_owner) {
        ownerParticipantMap.set(participant.booking_id, participant);
      }
    });

    const rowsWithSort = data.bookings
      .filter((booking) => !isCanceledBooking(booking) && (booking.payment_status ?? '').toUpperCase() === 'PENDING')
      .map((booking) => {
        const bookingDate = booking.booking_start ? new Date(booking.booking_start) : null;
        const ownerParticipant = ownerParticipantMap.get(booking.booking_id);
        const player = ownerParticipant?.player_id ? playerMap.get(ownerParticipant.player_id) : undefined;
        const jugador = player?.name ?? 'Sin registro';
        const email = player?.email ?? '-';

        return {
          sortDate: bookingDate && !Number.isNaN(bookingDate.getTime()) ? bookingDate.getTime() : 0,
          row: {
            fecha: bookingDate && !Number.isNaN(bookingDate.getTime()) ? PENDING_DATE_FMT.format(bookingDate) : '—',
            hora: bookingDate && !Number.isNaN(bookingDate.getTime()) ? PENDING_TIME_FMT.format(bookingDate) : '—',
            cancha: booking.resource_name ?? '-',
            deporte: normalizeSport(booking.sport_id) === 'PADEL' ? 'Padel' : normalizeSport(booking.sport_id) === 'TENNIS' ? 'Tennis' : String(booking.sport_id ?? '—'),
            monto: booking.price_amount ?? 0,
            jugador,
            email,
          } satisfies PendingBooking,
        };
      })
      .sort((a, b) => b.sortDate - a.sortDate);

    const bookings = rowsWithSort.map((entry) => entry.row);
    const detailRows = bookings.slice(0, 200);
    const detailTruncated = bookings.length > 200;

    const summaryMap = new Map<string, PendingSummary>();
    bookings.forEach((booking) => {
      const key = `${booking.jugador}__${booking.email}`;
      const existing = summaryMap.get(key) ?? { jugador: booking.jugador, email: booking.email, reservas: 0, total: 0 };
      existing.reservas += 1;
      existing.total += booking.monto;
      summaryMap.set(key, existing);
    });

    const playerSummary = Array.from(summaryMap.values()).sort(
      (a, b) => b.total - a.total || b.reservas - a.reservas || a.jugador.localeCompare(b.jugador, 'es'),
    );

    const totalMonto = bookings.reduce((acc, booking) => acc + booking.monto, 0);

    return {
      bookings,
      detailRows,
      detailTruncated,
      playerSummary,
      totalReservas: bookings.length,
      totalMonto,
    };
  }, [data.bookings, data.participants, data.players]);

  const exportReconciliationCsv = useCallback(() => {
    const headers = [
      'Fecha',
      'Reservas',
      'Revenue Bruto',
      'Pagado',
      'Pagado Revenue',
      'Parcial',
      'Parcial Revenue',
      'Pendiente',
      'Pendiente Revenue',
      'N/A',
      'N/A Revenue',
      'Vía App',
      'Vía App Revenue',
      'Directo',
      'Directo Revenue',
    ];

    const escapeCsv = (value: string | number) => {
      const stringValue = String(value ?? '');
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };

    const lines = [
      headers.join(','),
      ...reconciliation.csvRows.map((row) => headers.map((header) => escapeCsv(row[header as keyof typeof row] ?? '')).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `playtomic-conciliacion-${meta.fromIso}-a-${meta.toIso}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }, [meta.fromIso, meta.toIso, reconciliation.csvRows]);

  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
    <div className="space-y-6 pb-8">
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">RDB x Playtomic</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Dashboard Playtomic</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text)]/60">Reservas, ingresos, ocupación, jugadores y salud de sincronización en una sola vista.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['year', 'Este año'], ['all', 'Todo']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={[
                  'rounded-full border px-3 py-2 text-sm transition',
                  range === value
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/65 hover:text-[var(--text)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={() => void fetchData(true)} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]/65">
          <CalendarRange className="h-4 w-4" />
          {meta.label}
        </div>
      </section>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-[360px] rounded-3xl" />
          <Skeleton className="h-[420px] rounded-3xl" />
          <Skeleton className="h-[360px] rounded-3xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="Reservas" value={String(kpis.totalBookings)} hint={meta.label} icon={<CalendarRange className="h-4 w-4" />} />
            <KpiCard label="Ingresos" value={formatMoney(kpis.revenueTotal)} hint="Total del periodo" icon={<CircleDollarSign className="h-4 w-4" />} />
            <KpiCard label="Cancelación" value={`${kpis.cancellationRate.toFixed(1)}%`} hint="Sobre reservas del periodo" icon={<XCircle className="h-4 w-4" />} />
            <KpiCard label="Jugadores únicos" value={String(kpis.uniquePlayers)} hint="Owners + participantes" icon={<Users className="h-4 w-4" />} />
            <KpiCard label="Valor promedio" value={formatMoney(kpis.avgBookingValue)} hint="Ingreso promedio por reserva" icon={<Activity className="h-4 w-4" />} />
            <KpiCard label="Pendiente de cobro" value={formatMoney(reconciliation.summary.pendingRevenue)} hint="Reservas con pago pendiente" icon={<RefreshCw className="h-4 w-4" />} />
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Ingresos diarios</h2>
                <p className="text-sm text-[var(--text)]/55">Barras apiladas por deporte, sin librerías externas.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-[var(--text)]/60 sm:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Total</div>
                  <div className="mt-1 font-semibold text-[var(--text)]">{formatMoney(revenueSeries.reduce((acc, day) => acc + day.total, 0), true)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Padel</div>
                  <div className="mt-1 font-semibold text-[var(--text)]">{formatMoney(revenueSeries.reduce((acc, day) => acc + day.padel, 0), true)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Tennis</div>
                  <div className="mt-1 font-semibold text-[var(--text)]">{formatMoney(revenueSeries.reduce((acc, day) => acc + day.tennis, 0), true)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Canceladas</div>
                  <div className="mt-1 font-semibold text-[var(--text)]">{revenueSeries.reduce((acc, day) => acc + day.cancelaciones, 0)}</div>
                </div>
              </div>
            </div>
            <RevenueChart data={revenueSeries} />
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Ocupación</h2>
                <p className="text-sm text-[var(--text)]/55">Vista cruzada de canchas por hora dentro del rango seleccionado.</p>
              </div>
              <div className="w-full max-w-[220px]">
                <Select value={sportFilter} onValueChange={(value) => setSportFilter(value as SportFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar deporte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los deportes</SelectItem>
                    <SelectItem value="PADEL">Solo padel</SelectItem>
                    <SelectItem value="TENNIS">Solo tennis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <OccupancyHeatmap rows={filteredOccupancy} resources={data.resources} sportFilter={sportFilter} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text)]">Top jugadores</h2>
                  <p className="text-sm text-[var(--text)]/55">Ranking operable con búsqueda y orden.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="Buscar jugador o correo…" className="sm:w-64" />
                  <Select value={playerSort} onValueChange={(value) => setPlayerSort(value as PlayerSortKey)}>
                    <SelectTrigger className="sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasto">Ordenar por gasto</SelectItem>
                      <SelectItem value="reservas">Ordenar por reservas</SelectItem>
                      <SelectItem value="name">Ordenar por nombre</SelectItem>
                      <SelectItem value="sport">Ordenar por deporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jugador</TableHead>
                      <TableHead>Reservas</TableHead>
                      <TableHead className="text-right">Gasto estimado</TableHead>
                      <TableHead>Deporte favorito</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPlayers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                          No hay jugadores para el filtro actual.
                        </TableCell>
                      </TableRow>
                    ) : (
                      topPlayers.slice(0, 10).map((player) => (
                        <TableRow key={`${player.email ?? 'sin-correo'}-${player.name ?? 'sin-nombre'}`}>
                          <TableCell>
                            <div className="font-medium text-[var(--text)]">{player.name ?? 'Sin nombre'}</div>
                          </TableCell>
                          <TableCell>{player.reservas}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(player.gasto)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{player.favorite_sport ?? '—'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] self-start">
              <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
                <h3 className="text-base font-semibold text-[var(--text)]">Top canceladores</h3>
                <p className="text-sm text-[var(--text)]/55">Jugadores con al menos 2 cancelaciones dentro del periodo.</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Total Reservas</TableHead>
                    <TableHead>Canceladas</TableHead>
                    <TableHead className="text-right">Tasa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancellationAnalysis.topCancelers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                        No hay jugadores con 2 o más cancelaciones en este periodo.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cancellationAnalysis.topCancelers.map((player) => (
                      <TableRow key={player.ownerId}>
                        <TableCell className="font-medium text-[var(--text)]">{player.name ?? 'Sin nombre'}</TableCell>
                        <TableCell>{player.totalBookings}</TableCell>
                        <TableCell>{player.canceledBookings}</TableCell>
                        <TableCell className="text-right font-medium text-rose-600 dark:text-rose-300">{player.cancellationRate.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Análisis de Cancelaciones</h2>
              <p className="text-sm text-[var(--text)]/55">Patrones y tendencias en reservas canceladas dentro del periodo seleccionado.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Total cancelaciones</div>
                <div className="mt-2 text-3xl font-semibold text-[var(--text)]">{cancellationAnalysis.canceledCount}</div>
                <div className="mt-1 text-sm text-[var(--text)]/55">Reservas marcadas como canceladas.</div>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Tasa de cancelación</div>
                <div className="mt-2 text-3xl font-semibold text-[var(--text)]">{cancellationAnalysis.cancellationRate.toFixed(1)}%</div>
                <div className="mt-1 text-sm text-[var(--text)]/55">Sobre {data.bookings.length} reservas del periodo.</div>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Padel vs Tennis</div>
                <div className="mt-2 space-y-1 text-sm text-[var(--text)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Padel</span>
                    <span className="font-medium">{cancellationAnalysis.sports.PADEL.canceled} ({cancellationAnalysis.sports.PADEL.total ? ((cancellationAnalysis.sports.PADEL.canceled / cancellationAnalysis.sports.PADEL.total) * 100).toFixed(1) : '0.0'}%)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Tennis</span>
                    <span className="font-medium">{cancellationAnalysis.sports.TENNIS.canceled} ({cancellationAnalysis.sports.TENNIS.total ? ((cancellationAnalysis.sports.TENNIS.canceled / cancellationAnalysis.sports.TENNIS.total) * 100).toFixed(1) : '0.0'}%)</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Duración cancelada promedio</div>
                <div className="mt-2 text-3xl font-semibold text-[var(--text)]">{cancellationAnalysis.avgCanceledDuration.toFixed(0)} min</div>
                <div className="mt-1 text-sm text-[var(--text)]/55">Promedio de minutos en reservas canceladas.</div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <CancellationWeekdayChart data={cancellationAnalysis.cancellationsByWeekday} />
              <CancellationHourChart data={cancellationAnalysis.cancellationsByHour} />
            </div>

          </section>

          <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Conciliación de Ingresos</h2>
                <p className="text-sm text-[var(--text)]/55">Desglose diario de reservas por estado de pago y origen para cuadrar contra depósitos.</p>
              </div>
              <Button variant="outline" size="sm" onClick={exportReconciliationCsv} disabled={reconciliation.rows.length === 0}>
                Exportar CSV
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue bruto total" value={formatMoney(reconciliation.summary.revenueBruto)} hint="Solo reservas no canceladas" icon={<CircleDollarSign className="h-4 w-4" />} />
              <KpiCard label="Cobrado vía App" value={formatMoney(reconciliation.summary.appRevenue)} hint="APP_IOS + APP_ANDROID" icon={<Activity className="h-4 w-4" />} />
              <KpiCard label="Cobrado directo" value={formatMoney(reconciliation.summary.managerRevenue)} hint="MANAGER + PLAYTOMIC_MANAGER" icon={<Users className="h-4 w-4" />} />
              <KpiCard label="% Cobrado" value={reconciliation.summary.revenueBruto > 0 ? `${((1 - reconciliation.summary.pendingRevenue / reconciliation.summary.revenueBruto) * 100).toFixed(1)}%` : '—'} hint="Revenue cobrado vs bruto" icon={<Activity className="h-4 w-4" />} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Reservas</TableHead>
                      <TableHead className="text-right">Revenue Bruto</TableHead>
                      <TableHead className="text-right">Pagado</TableHead>
                      <TableHead className="text-right">Parcial</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
                      <TableHead className="text-right">N/A</TableHead>
                      <TableHead className="text-right">Vía App</TableHead>
                      <TableHead className="text-right">Directo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliation.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-[var(--text)]/50">
                          No hay datos de conciliación para este rango.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {reconciliation.rows.map((day) => (
                          <TableRow key={day.fecha}>
                            <TableCell className="font-medium text-[var(--text)]">{day.label}</TableCell>
                            <TableCell className="text-right">{day.totalReservas}</TableCell>
                            <TableCell className="text-right font-medium">{formatMoney(day.revenueBruto)}</TableCell>
                            <TableCell className="text-right">{`${day.paid} · ${formatMoney(day.paidRevenue, true)}`}</TableCell>
                            <TableCell className="text-right">{`${day.partialPaid} · ${formatMoney(day.partialRevenue, true)}`}</TableCell>
                            <TableCell className="text-right">{`${day.pending} · ${formatMoney(day.pendingRevenue, true)}`}</TableCell>
                            <TableCell className="text-right">{`${day.notApplicable} · ${formatMoney(day.notApplicableRevenue, true)}`}</TableCell>
                            <TableCell className="text-right">{`${day.appReservas} · ${formatMoney(day.appRevenue, true)}`}</TableCell>
                            <TableCell className="text-right">{`${day.managerReservas} · ${formatMoney(day.managerRevenue, true)}`}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-[var(--panel)]/80 font-semibold">
                          <TableCell className="font-semibold text-[var(--text)]">{reconciliation.totals.label}</TableCell>
                          <TableCell className="text-right font-semibold">{reconciliation.totals.totalReservas}</TableCell>
                          <TableCell className="text-right font-semibold">{formatMoney(reconciliation.totals.revenueBruto)}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.paid} · ${formatMoney(reconciliation.totals.paidRevenue, true)}`}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.partialPaid} · ${formatMoney(reconciliation.totals.partialRevenue, true)}`}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.pending} · ${formatMoney(reconciliation.totals.pendingRevenue, true)}`}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.notApplicable} · ${formatMoney(reconciliation.totals.notApplicableRevenue, true)}`}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.appReservas} · ${formatMoney(reconciliation.totals.appRevenue, true)}`}</TableCell>
                          <TableCell className="text-right font-semibold">{`${reconciliation.totals.managerReservas} · ${formatMoney(reconciliation.totals.managerRevenue, true)}`}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            {reconciliation.truncated ? (
              <p className="text-sm text-[var(--text)]/55">Mostrando 60 de {reconciliation.totalDays} días. Los totales reflejan el periodo completo.</p>
            ) : null}

            <div className="border-t border-[var(--border)] pt-6">
              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text)]">Resumen por Jugador</h3>
                  <p className="text-sm text-[var(--text)]/55">Top 20 jugadores con saldo pendiente acumulado.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  <div className="max-h-[28rem] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Reservas</TableHead>
                          <TableHead className="text-right">Total Pendiente</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingPayments.playerSummary.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                              No hay pagos pendientes en este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {pendingPayments.playerSummary.slice(0, 20).map((player) => (
                              <TableRow key={`${player.jugador}-${player.email}`}>
                                <TableCell className="font-medium text-[var(--text)]">{player.jugador}</TableCell>
                                <TableCell className="text-[var(--text)]/60">{player.email}</TableCell>
                                <TableCell className="text-right">{player.reservas}</TableCell>
                                <TableCell className="text-right font-medium">{formatMoney(player.total)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-[var(--panel)]/80 font-semibold">
                              <TableCell className="font-semibold text-[var(--text)]">Totales</TableCell>
                              <TableCell className="text-[var(--text)]/60">—</TableCell>
                              <TableCell className="text-right font-semibold">{pendingPayments.totalReservas}</TableCell>
                              <TableCell className="text-right font-semibold">{formatMoney(pendingPayments.totalMonto)}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/35 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text)]">Detalle de Reservas Pendientes</h3>
                    <p className="text-sm text-[var(--text)]/55">Listado individual de reservas pendientes.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowPendingDetails((value) => !value)}>
                    {showPendingDetails ? 'Ocultar detalle' : 'Ver detalle'}
                  </Button>
                </div>

                {showPendingDetails ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                      <div className="max-h-[32rem] overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableHead sortKey="fecha" label="Fecha" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                              <SortableHead sortKey="hora" label="Hora" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                              <SortableHead sortKey="cancha" label="Cancha" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                              <SortableHead sortKey="deporte" label="Deporte" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                              <SortableHead sortKey="monto" label="Monto" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} className="text-right" />
                              <SortableHead sortKey="jugador" label="Jugador" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                              <SortableHead sortKey="email" label="Email" currentSort={pendingSortKey} currentDir={pendingSortDir} onSort={pendingOnSort} />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingPayments.detailRows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="py-10 text-center text-[var(--text)]/50">
                                  No hay reservas pendientes para mostrar.
                                </TableCell>
                              </TableRow>
                            ) : (
                              pendingSortData(pendingPayments.detailRows).map((booking, index) => (
                                <TableRow key={`${booking.fecha}-${booking.hora}-${booking.email}-${index}`}>
                                  <TableCell className="font-medium text-[var(--text)]">{booking.fecha}</TableCell>
                                  <TableCell>{booking.hora}</TableCell>
                                  <TableCell>{booking.cancha}</TableCell>
                                  <TableCell>{booking.deporte}</TableCell>
                                  <TableCell className="text-right font-medium">{formatMoney(booking.monto)}</TableCell>
                                  <TableCell>{booking.jugador}</TableCell>
                                  <TableCell className="text-[var(--text)]/60">{booking.email}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    {pendingPayments.detailTruncated ? (
                      <p className="text-sm text-[var(--text)]/55">Mostrando 200 de {pendingPayments.totalReservas} reservas pendientes.</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--text)]">Sincronización</h2>
              {(() => {
                const lastSuccess = data.syncs.find((s) => s.status === 'success');
                const lastError = data.syncs.find((s) => s.status === 'error');
                if (!lastSuccess && !lastError) {
                  return <span className="text-sm text-[var(--text)]/50">Sin registros</span>;
                }
                return (
                  <div className="flex flex-col items-end gap-1 text-sm">
                    {lastSuccess ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ Último éxito: {formatDateTime(lastSuccess.finished_at ?? lastSuccess.started_at)}
                        {lastSuccess.bookings_fetched != null ? ` · ${lastSuccess.bookings_fetched} bookings` : ''}
                      </span>
                    ) : null}
                    {lastError ? (
                      <span className="text-red-500 dark:text-red-400 max-w-md truncate">
                        ✗ Último error: {formatDateTime(lastError.finished_at ?? lastError.started_at)}
                        {lastError.error_message ? ` — ${lastError.error_message}` : ''}
                      </span>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </section>

        </>
      )}
    </div>
    </RequireAccess>
  );
}
