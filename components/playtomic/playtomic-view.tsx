'use client';

import { useCallback, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { CancellationSection } from './cancellation-section';
import { computeCancellationAnalysis, computeComputedPlayers, computeKpis } from './derivations';
import { computePendingPayments } from './pending-payments';
import { computeReconciliation } from './reconciliation';
import { HeaderSection } from './header-section';
import { KpiSection } from './kpi-section';
import { OccupancySection } from './occupancy-section';
import { PlayersSection } from './players-section';
import { ReconciliationSection } from './reconciliation-section';
import { RevenueSection } from './revenue-section';
import { SyncSection } from './sync-section';
import type { ChartBucket, PendingBooking, PlayerSortKey, RangeKey, SportFilter } from './types';
import { usePlaytomicData } from './use-playtomic-data';
import { bucketRevenue, getRangeMeta, normalizeSport, pickBucketMode } from './utils';

export function PlaytomicView() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerSort, setPlayerSort] = useState<PlayerSortKey>('gasto');
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const {
    sortKey: pendingSortKey,
    sortDir: pendingSortDir,
    onSort: pendingOnSort,
    sortData: pendingSortData,
  } = useSortableTable<PendingBooking>('fecha', 'desc');

  const meta = useMemo(() => getRangeMeta(range), [range]);

  const { data, loading, refreshing, error, fetchData } = usePlaytomicData({
    range,
    fromIso: meta.fromIso,
    toIso: meta.toIso,
  });

  const revenueSeries = useMemo<ChartBucket[]>(() => {
    const mode = pickBucketMode(range);
    return bucketRevenue(data.revenue, meta.from, meta.to, mode);
  }, [data.revenue, meta.from, meta.to, range]);

  const kpis = useMemo(() => computeKpis(data), [data]);

  const filteredOccupancy = useMemo(() => {
    if (sportFilter === 'all') return data.occupancy;
    const allowed = new Set(
      data.resources
        .filter((resource) => normalizeSport(resource.sport_id) === sportFilter)
        .map((resource) => resource.resource_name ?? '')
    );
    return data.occupancy.filter((row) => allowed.has(row.resource_name ?? ''));
  }, [data.occupancy, data.resources, sportFilter]);

  const cancellationAnalysis = useMemo(
    () => computeCancellationAnalysis(data.bookings, data.players),
    [data.bookings, data.players]
  );

  const computedPlayers = useMemo(
    () => computeComputedPlayers(data.bookings, data.participants, data.players),
    [data.bookings, data.participants, data.players]
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

  const reconciliation = useMemo(() => computeReconciliation(data.bookings), [data.bookings]);

  const pendingPayments = useMemo(
    () => computePendingPayments(data.bookings, data.participants, data.players),
    [data.bookings, data.participants, data.players]
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
            sportFilter={sportFilter}
            onSportFilterChange={setSportFilter}
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
          <CancellationSection
            analysis={cancellationAnalysis}
            totalBookings={data.bookings.length}
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
