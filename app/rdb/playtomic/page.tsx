'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, CalendarRange, CircleDollarSign, RefreshCw, Users, XCircle } from 'lucide-react';

type RangeKey = '7d' | '30d' | '90d';
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
  synced_at: string | null;
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

type TopPlayerRow = {
  name: string | null;
  email: string | null;
  reservas_periodo: number | null;
  gasto_estimado: number | null;
  player_type: string | null;
  favorite_sport: string | null;
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

type RevenueDay = {
  fecha: string;
  label: string;
  padel: number;
  tennis: number;
  total: number;
  reservas: number;
  cancelaciones: number;
};

type DashboardData = {
  bookings: Booking[];
  participants: BookingParticipant[];
  revenue: RevenueRow[];
  occupancy: OccupancyRow[];
  topPlayers: TopPlayerRow[];
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
  const days = range === '7d' ? 6 : range === '30d' ? 29 : 89;
  const from = addDays(to, -days);
  return {
    from,
    to,
    fromIso: isoDateLocal(from),
    toIso: isoDateLocal(to),
    label: range === '7d' ? 'Últimos 7 días' : range === '30d' ? 'Últimos 30 días' : 'Últimos 90 días',
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

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FMT.format(date);
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

function RevenueChart({ data }: { data: RevenueDay[] }) {
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
              <g key={item.fecha}>
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
    const sorted = [...resources].sort((a, b) => (a.resource_name ?? '').localeCompare(b.resource_name ?? '', 'es'));
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    participants: [],
    revenue: [],
    occupancy: [],
    topPlayers: [],
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

      const bookingsQuery = schema
        .from('bookings')
        .select('booking_id,resource_name,sport_id,booking_start,booking_end,duration_min,price_amount,price_currency,status,is_canceled,owner_id,booking_type,origin,synced_at')
        .gte('booking_start', `${meta.fromIso}T00:00:00-06:00`)
        .lte('booking_start', `${meta.toIso}T23:59:59-06:00`)
        .order('booking_start', { ascending: true })
        .limit(range === '90d' ? 12000 : 5000);

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

      const topPlayersQuery = schema
        .from('v_top_players')
        .select('name,email,reservas_periodo,gasto_estimado,player_type,favorite_sport')
        .order('gasto_estimado', { ascending: false })
        .limit(250);

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

      const [bookingsRes, revenueRes, occupancyRes, topPlayersRes, resourcesRes, syncsRes] = await Promise.all([
        bookingsQuery,
        revenueQuery,
        occupancyQuery,
        topPlayersQuery,
        resourcesQuery,
        syncsQuery,
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (revenueRes.error) throw revenueRes.error;
      if (occupancyRes.error) throw occupancyRes.error;
      if (topPlayersRes.error) throw topPlayersRes.error;
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
        topPlayers: (topPlayersRes.data ?? []) as TopPlayerRow[],
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

  const revenueSeries = useMemo<RevenueDay[]>(() => {
    const dateLabels = buildDateLabels(meta.from, meta.to);
    const map = new Map<string, RevenueDay>();

    dateLabels.forEach((date) => {
      map.set(date, {
        fecha: date,
        label: DAY_FMT.format(new Date(`${date}T12:00:00`)),
        padel: 0,
        tennis: 0,
        total: 0,
        reservas: 0,
        cancelaciones: 0,
      });
    });

    data.revenue.forEach((row) => {
      const day = map.get(row.fecha);
      if (!day) return;
      const sport = normalizeSport(row.sport_id);
      const revenue = row.revenue ?? 0;
      if (sport === 'PADEL') day.padel += revenue;
      else if (sport === 'TENNIS') day.tennis += revenue;
      day.total += revenue;
      day.reservas += row.reservas ?? 0;
      day.cancelaciones += row.cancelaciones ?? 0;
    });

    return Array.from(map.values());
  }, [data.revenue, meta.from, meta.to]);

  const kpis = useMemo(() => {
    const totalBookings = data.bookings.length;
    const revenueTotal = data.bookings.reduce((acc, booking) => acc + (booking.price_amount ?? 0), 0);
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

  const topPlayers = useMemo(() => {
    const searched = data.topPlayers.filter((player) => {
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
      if (playerSort === 'reservas') return (b.reservas_periodo ?? 0) - (a.reservas_periodo ?? 0);
      if (playerSort === 'sport') return (a.favorite_sport ?? '').localeCompare(b.favorite_sport ?? '', 'es');
      return (b.gasto_estimado ?? 0) - (a.gasto_estimado ?? 0);
    });
  }, [data.topPlayers, playerQuery, playerSort]);

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">RDB x Playtomic</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Dashboard Playtomic</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text)]/60">Reservas, ingresos, ocupación, jugadores y salud de sincronización en una sola vista.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['7d', '30d', '90d'] as const).map((value) => (
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
                {value === '7d' ? '7 días' : value === '30d' ? '30 días' : '90 días'}
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
            <KpiCard
              label="Última sincronización"
              value={kpis.lastSync?.status ?? 'Sin datos'}
              hint={kpis.lastSync ? `${formatDateTime(kpis.lastSync.finished_at ?? kpis.lastSync.started_at)} · ${kpis.lastSync.sync_type ?? 'sync'}` : 'No hay registros'}
              icon={<RefreshCw className="h-4 w-4" />}
            />
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
                      topPlayers.slice(0, 25).map((player) => (
                        <TableRow key={`${player.email ?? 'sin-correo'}-${player.name ?? 'sin-nombre'}`}>
                          <TableCell>
                            <div className="font-medium text-[var(--text)]">{player.name ?? 'Sin nombre'}</div>
                            <div className="text-xs text-[var(--text)]/45">{player.email ?? 'Sin correo'}</div>
                          </TableCell>
                          <TableCell>{player.reservas_periodo ?? 0}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(player.gasto_estimado)}</TableCell>
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

            <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Sincronización</h2>
                <p className="text-sm text-[var(--text)]/55">Últimos 10 eventos del pipeline Playtomic.</p>
              </div>
              <div className="space-y-3">
                {data.syncs.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--border)] px-4 py-6 text-sm text-[var(--text)]/55">No hay registros de sync.</div>
                ) : (
                  data.syncs.map((sync, index) => (
                    <div key={`${sync.started_at ?? 'sin-fecha'}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-[var(--text)]">{sync.sync_type ?? 'sync'}</div>
                          <div className="mt-1 text-xs text-[var(--text)]/45">{formatDateTime(sync.finished_at ?? sync.started_at)}</div>
                        </div>
                        <Badge variant={statusTone(sync.status)}>{sync.status ?? '—'}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[var(--text)]/60">
                        <div>
                          <div className="uppercase tracking-[0.15em] text-[var(--text)]/40">Fetched</div>
                          <div className="mt-1 font-medium text-[var(--text)]">{sync.bookings_fetched ?? 0}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-[0.15em] text-[var(--text)]/40">Upsert reservas</div>
                          <div className="mt-1 font-medium text-[var(--text)]">{sync.bookings_upserted ?? 0}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-[0.15em] text-[var(--text)]/40">Upsert jugadores</div>
                          <div className="mt-1 font-medium text-[var(--text)]">{sync.players_upserted ?? 0}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-[var(--text)]/50">Duración: {durationLabel(sync.started_at, sync.finished_at)}</div>
                      {sync.error_message ? <div className="mt-2 text-xs text-red-600 dark:text-red-300">{sync.error_message}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Canchas</h2>
              <p className="text-sm text-[var(--text)]/55">Inventario actual de recursos detectados por Playtomic.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cancha</TableHead>
                    <TableHead>Deporte</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Primera vez vista</TableHead>
                    <TableHead>Última vez vista</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.resources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-[var(--text)]/50">No hay recursos disponibles.</TableCell>
                    </TableRow>
                  ) : (
                    data.resources.map((resource) => (
                      <TableRow key={resource.resource_id}>
                        <TableCell className="font-medium text-[var(--text)]">{resource.resource_name ?? 'Sin nombre'}</TableCell>
                        <TableCell>{normalizeSport(resource.sport_id)}</TableCell>
                        <TableCell>
                          <Badge variant={resource.active ? 'default' : 'outline'}>{resource.active ? 'Activa' : 'Inactiva'}</Badge>
                        </TableCell>
                        <TableCell>{formatDateOnly(resource.first_seen_at)}</TableCell>
                        <TableCell>{formatDateOnly(resource.last_seen_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
