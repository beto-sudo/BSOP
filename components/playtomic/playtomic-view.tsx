'use client';

import { useCallback, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { CancellationSection } from './cancellation-section';
import { CoachesSection } from './coaches-section';
import {
  buildBookingCoachMap,
  computeCancellationAnalysis,
  computeCoaches,
  computeComputedPlayers,
  computeKpis,
} from './derivations';
import { KNOWN_COACH_NAMES } from '@/lib/playtomic/conciliacion';
import { computePendingPayments } from './pending-payments';
import { computeReconciliation } from './reconciliation';
import { HeaderSection } from './header-section';
import { KpiSection } from './kpi-section';
import { OccupancySection } from './occupancy-section';
import { PlayersSection } from './players-section';
import { ReconciliationSection } from './reconciliation-section';
import { RevenueSection } from './revenue-section';
import { SyncSection } from './sync-section';
import type {
  BookingFilters,
  ChartBucket,
  CoachSortKey,
  PendingBooking,
  PlayerSortKey,
  RangeKey,
} from './types';
import { usePlaytomicData } from './use-playtomic-data';
import {
  applyBookingFilters,
  bucketRevenue,
  getRangeMeta,
  isoDateLocal,
  normalizeSport,
  pickBucketMode,
} from './utils';

const DEFAULT_FILTERS: BookingFilters = {
  sport: 'all',
  resource: '',
  coachSlug: '',
  activity: '',
};

const COACH_LABELS: Record<string, string> = {
  omar: 'Omar',
  anibal: 'Aníbal',
  manuel: 'Manuel',
  paco: 'Paco',
  hugo: 'Hugo',
};

export function PlaytomicView() {
  const [range, setRange] = useState<RangeKey>('month');
  // Defaults para custom inicializan en el mes actual también — si el user
  // cambia a "Custom" sin tocar las fechas, no se queda con un rango vacío.
  const [customFromIso, setCustomFromIso] = useState(() => {
    const now = new Date();
    return isoDateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customToIso, setCustomToIso] = useState(() => isoDateLocal(new Date()));
  const [filters, setFilters] = useState<BookingFilters>(DEFAULT_FILTERS);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerSort, setPlayerSort] = useState<PlayerSortKey>('gasto');
  const [coachSort, setCoachSort] = useState<CoachSortKey>('revenue');
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const {
    sortKey: pendingSortKey,
    sortDir: pendingSortDir,
    onSort: pendingOnSort,
    sortData: pendingSortData,
  } = useSortableTable<PendingBooking>('fecha', 'desc');

  const meta = useMemo(
    () => getRangeMeta(range, customFromIso, customToIso),
    [range, customFromIso, customToIso]
  );

  const { data, loading, refreshing, error, fetchData, coveredBookingIds } = usePlaytomicData({
    range,
    fromIso: meta.fromIso,
    toIso: meta.toIso,
  });

  // Mapa booking_id → coaches involucrados (owner o participantes con
  // nombre que matchea uno de los slugs conocidos). Lo precomputamos UNA
  // vez por dataset y lo reusamos para filtrar y para ranquear.
  const bookingCoachMap = useMemo(
    () => buildBookingCoachMap(data.bookings, data.participants, data.players),
    [data.bookings, data.participants, data.players]
  );

  const filteredBookings = useMemo(
    () => applyBookingFilters(data.bookings, filters, bookingCoachMap),
    [data.bookings, filters, bookingCoachMap]
  );

  const filteredBookingIds = useMemo(
    () => new Set(filteredBookings.map((b) => b.booking_id)),
    [filteredBookings]
  );

  const filteredParticipants = useMemo(
    () => data.participants.filter((p) => filteredBookingIds.has(p.booking_id)),
    [data.participants, filteredBookingIds]
  );

  const revenueSeries = useMemo<ChartBucket[]>(() => {
    const mode = pickBucketMode(range);
    return bucketRevenue(data.revenue, meta.from, meta.to, mode);
  }, [data.revenue, meta.from, meta.to, range]);

  // KPIs y demás derivations operan sobre las bookings filtradas. Pasamos
  // un "DashboardData proxy" con bookings/participants reemplazados — el
  // resto (revenue, occupancy, players, syncs, resources) sigue siendo el
  // dataset crudo del periodo.
  const filteredData = useMemo(
    () => ({ ...data, bookings: filteredBookings, participants: filteredParticipants }),
    [data, filteredBookings, filteredParticipants]
  );

  const kpis = useMemo(() => computeKpis(filteredData), [filteredData]);

  const filteredOccupancy = useMemo(() => {
    if (filters.sport === 'all') return data.occupancy;
    const allowed = new Set(
      data.resources
        .filter((resource) => normalizeSport(resource.sport_id) === filters.sport)
        .map((resource) => resource.resource_name ?? '')
    );
    return data.occupancy.filter((row) => allowed.has(row.resource_name ?? ''));
  }, [data.occupancy, data.resources, filters.sport]);

  const cancellationAnalysis = useMemo(
    () => computeCancellationAnalysis(filteredBookings, data.players),
    [filteredBookings, data.players]
  );

  const computedPlayers = useMemo(
    () => computeComputedPlayers(filteredBookings, filteredParticipants, data.players),
    [filteredBookings, filteredParticipants, data.players]
  );

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
      if (playerSort === 'sport')
        return (a.favorite_sport ?? '').localeCompare(b.favorite_sport ?? '', 'es');
      return b.gasto - a.gasto;
    });
  }, [computedPlayers, playerQuery, playerSort]);

  const coaches = useMemo(
    () => computeCoaches(filteredBookings, bookingCoachMap),
    [filteredBookings, bookingCoachMap]
  );

  const sortedCoaches = useMemo(() => {
    return [...coaches].sort((a, b) => {
      if (coachSort === 'name') return a.display_name.localeCompare(b.display_name, 'es');
      if (coachSort === 'reservas') return b.reservas - a.reservas;
      if (coachSort === 'jugadores') return b.jugadores_unicos - a.jugadores_unicos;
      return b.revenue - a.revenue;
    });
  }, [coaches, coachSort]);

  // Opciones de los selectores: derivadas del periodo, ordenadas alfa.
  const resourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const resource of data.resources) {
      if (resource.resource_name) seen.add(resource.resource_name);
    }
    for (const booking of data.bookings) {
      if (booking.resource_name) seen.add(booking.resource_name);
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((name) => ({ value: name, label: name }));
  }, [data.resources, data.bookings]);

  // Coach options = solo los coaches conocidos que tienen al menos 1
  // booking detectado en el periodo (filtrar la lista hardcoded contra
  // el bookingCoachMap evita mostrar opciones vacías).
  const coachOptions = useMemo(() => {
    const present = new Set<string>();
    for (const slugs of bookingCoachMap.values()) {
      for (const slug of slugs) present.add(slug);
    }
    return KNOWN_COACH_NAMES.filter((slug) => present.has(slug))
      .map((slug) => ({ value: slug, label: COACH_LABELS[slug] ?? slug }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [bookingCoachMap]);

  const activityOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const booking of data.bookings) {
      const name = booking.activity_name ?? booking.course_name;
      if (name) seen.add(name);
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((name) => ({ value: name, label: name }));
  }, [data.bookings]);

  const reconciliation = useMemo(() => computeReconciliation(filteredBookings), [filteredBookings]);

  const pendingPayments = useMemo(
    () =>
      computePendingPayments(filteredBookings, filteredParticipants, data.players, {
        coveredBookingIds,
      }),
    [filteredBookings, filteredParticipants, data.players, coveredBookingIds]
  );

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
      ...reconciliation.csvRows.map((row) =>
        headers.map((header) => escapeCsv(row[header as keyof typeof row] ?? '')).join(',')
      ),
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
    <div className="space-y-6 pb-8">
      <HeaderSection
        range={range}
        onRangeChange={setRange}
        rangeLabel={meta.label}
        customFromIso={customFromIso}
        customToIso={customToIso}
        onCustomRangeChange={(from, to) => {
          setCustomFromIso(from);
          setCustomToIso(to);
        }}
        filters={filters}
        onFiltersChange={setFilters}
        resourceOptions={resourceOptions}
        coachOptions={coachOptions}
        activityOptions={activityOptions}
        refreshing={refreshing}
        onRefresh={() => void fetchData(true)}
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-3xl" />
          <Skeleton className="h-[420px] rounded-3xl" />
          <Skeleton className="h-[360px] rounded-3xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : (
        <>
          <KpiSection
            kpis={kpis}
            rangeLabel={meta.label}
            pendingRevenue={reconciliation.summary.pendingRevenue}
          />
          <RevenueSection revenueSeries={revenueSeries} />
          <OccupancySection
            sportFilter={filters.sport}
            onSportFilterChange={(sport) => setFilters((prev) => ({ ...prev, sport }))}
            filteredOccupancy={filteredOccupancy}
            resources={data.resources}
          />
          <PlayersSection
            topPlayers={topPlayers}
            playerQuery={playerQuery}
            onPlayerQueryChange={setPlayerQuery}
            playerSort={playerSort}
            onPlayerSortChange={setPlayerSort}
            cancellationAnalysis={cancellationAnalysis}
          />
          <CoachesSection coaches={sortedCoaches} sort={coachSort} onSortChange={setCoachSort} />
          <CancellationSection
            analysis={cancellationAnalysis}
            totalBookings={filteredBookings.length}
          />
          <ReconciliationSection
            reconciliation={reconciliation}
            pendingPayments={pendingPayments}
            onExportCsv={exportReconciliationCsv}
            showPendingDetails={showPendingDetails}
            onToggleDetails={() => setShowPendingDetails((value) => !value)}
            pendingSortKey={pendingSortKey}
            pendingSortDir={pendingSortDir}
            pendingOnSort={pendingOnSort}
            pendingSortData={pendingSortData}
          />
          <SyncSection syncs={data.syncs} />
        </>
      )}
    </div>
  );
}
