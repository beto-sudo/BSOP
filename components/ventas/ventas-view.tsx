'use client';

/**
 * VentasView — RDB Ventas (Waitry POS) orchestrator.
 *
 * Split from app/rdb/ventas/page.tsx following the same convention as
 * components/app-shell/, health/, travel/, rh/, tasks/:
 *   - ./types           shared shapes + STATUS_OPTIONS
 *   - ./utils           pure helpers (TZ, formatDate, formatCurrency, statusVariant,
 *                       todayRange, rangeForPreset)
 *   - ./summary-bar     Pedidos count + total card pair
 *   - ./ventas-filters  search + status + corte + date range + preset selector
 *   - ./ventas-table    pedidos table with sortable columns
 *   - ./order-detail    drawer with items + pagos + totals
 *
 * Behavior preserved 1:1 — no data-fetching, routing, or UI semantics changed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { ErrorBanner } from '@/components/module-page';
import { OrderDetail } from './order-detail';
import { SummaryBar } from './summary-bar';
import { VentasFilters } from './ventas-filters';
import { VentasTable } from './ventas-table';
import { VentasPorProducto } from './ventas-por-producto';
import type { CorteOption, Pedido } from './types';
import { TZ, rangeForPreset, todayRange } from './utils';

type VentasTab = 'pedidos' | 'por-producto';

export function VentasView() {
  const [tab, setTab] = useState<VentasTab>('pedidos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productoSearch, setProductoSearch] = useState('');
  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Pedido>('timestamp', 'desc');
  const [cortes, setCortes] = useState<CorteOption[]>([]);

  // URL-synced filter defaults are captured once at mount (today's date range).
  // Re-opening a stale tab the next day keeps the previous defaults; that's
  // accepted v1 behavior — the user sees an explicit `?date_from=…` and can
  // hit "Limpiar filtros" to snap back to today.
  const filterDefaults = useMemo(() => {
    const today = todayRange();
    return {
      search: '',
      statusFilter: 'all',
      corteFilter: 'all',
      dateFrom: today.from,
      dateTo: today.to,
      presetKey: 'hoy',
    };
  }, []);
  const { filters, setFilter, setFilters, clearAll, activeCount } = useUrlFilters(filterDefaults);
  const { search, statusFilter, corteFilter, dateFrom, dateTo, presetKey } = filters;

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    const range = rangeForPreset(preset);
    if (range) {
      setFilters({ presetKey: preset, dateFrom: range.from, dateTo: range.to });
    } else {
      setFilter('presetKey', preset);
    }
  };
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch cortes for the selected date range
  const fetchCortes = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      // B.1.extra.a: `rdb.cortes` is a ghost relation (doesn't exist in the DB —
      // it was never created during the phase-2 `caja` → `rdb` migration).
      // The canonical proxy for RDB is `rdb.v_cortes_lista`, which already
      // projects `id, corte_nombre, caja_nombre, hora_inicio, hora_fin, estado`
      // on top of the shared `erp.cortes_caja` base table.
      let query = supabase
        .schema('rdb')
        .from('v_cortes_lista')
        .select('id, corte_nombre, caja_nombre, hora_inicio, hora_fin, estado')
        .order('hora_inicio', { ascending: false });

      if (dateFrom) query = query.gte('hora_inicio', getLocalDayBoundsUtc(dateFrom, TZ).start);
      if (dateTo) query = query.lte('hora_inicio', getLocalDayBoundsUtc(dateTo, TZ).end);

      const { data } = await query;
      setCortes((data ?? []) as CorteOption[]);
    } catch {
      // non-fatal
    }
  }, [dateFrom, dateTo]);

  const fetchPedidos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      let query = supabase
        .schema('rdb')
        .from('waitry_pedidos')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10000);
      if (corteFilter !== 'all') {
        query = query.eq('corte_id', corteFilter);
      } else {
        if (dateFrom) query = query.gte('timestamp', getLocalDayBoundsUtc(dateFrom, TZ).start);
        if (dateTo) query = query.lte('timestamp', getLocalDayBoundsUtc(dateTo, TZ).end);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setPedidos(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, corteFilter]);

  useEffect(() => {
    void fetchCortes();
  }, [fetchCortes]);

  useEffect(() => {
    void fetchPedidos();
  }, [fetchPedidos]);

  const openDetail = async (pedido: Pedido) => {
    setSelected(pedido);
    setDrawerOpen(true);
    setLoadingDetail(true);

    try {
      const supabase = createSupabaseBrowserClient();
      if (!pedido.order_id) {
        setLoadingDetail(false);
        return;
      }
      const orderId = pedido.order_id;
      const [itemsRes, pagosRes] = await Promise.all([
        supabase
          .schema('rdb')
          .from('waitry_productos')
          .select('*')
          .eq('order_id', orderId)
          .limit(50),
        supabase.schema('rdb').from('waitry_pagos').select('*').eq('order_id', orderId).limit(20),
      ]);

      setSelected((prev) =>
        prev?.id === pedido.id
          ? { ...prev, items: itemsRes.data ?? [], pagos: pagosRes.data ?? [] }
          : prev
      );
    } catch {
      // non-fatal
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = pedidos.filter((p) => {
    if (statusFilter !== 'all' && p.status?.toLowerCase() !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(p.order_id ?? '')
        .toLowerCase()
        .includes(q) ||
      String(p.id).toLowerCase().includes(q) ||
      (p.status ?? '').toLowerCase().includes(q)
    );
  });

  const selectedCorte = corteFilter !== 'all' ? cortes.find((c) => c.id === corteFilter) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ventas
          {selectedCorte && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              — {selectedCorte.corte_nombre ?? selectedCorte.caja_nombre ?? 'Corte'}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {selectedCorte
            ? `Pedidos del corte ${selectedCorte.corte_nombre ?? selectedCorte.caja_nombre ?? ''}`
            : 'Pedidos registrados en Waitry'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b">
        {(
          [
            ['pedidos', 'Pedidos'],
            ['por-producto', 'Por producto'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === key
                ? 'border-emerald-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary stats (solo en Pedidos) */}
      {tab === 'pedidos' && !loading && !error && <SummaryBar pedidos={filtered} />}

      {/* Filters */}
      <VentasFilters
        search={tab === 'pedidos' ? search : ''}
        onSearchChange={(value) => setFilter('search', value)}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => setFilter('statusFilter', value)}
        corteFilter={corteFilter}
        onCorteFilterChange={(value) => setFilter('corteFilter', value)}
        cortes={cortes}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => setFilters({ dateFrom: value, presetKey: 'custom' })}
        onDateToChange={(value) => setFilters({ dateTo: value, presetKey: 'custom' })}
        presetKey={presetKey}
        onPresetChange={handlePreset}
        loading={loading}
        onRefresh={() => void fetchPedidos()}
        count={filtered.length}
        activeCount={activeCount}
        onClearAll={clearAll}
      />

      {/* Error */}
      {error ? <ErrorBanner error={error} onRetry={() => void fetchPedidos()} /> : null}

      {tab === 'pedidos' ? (
        <>
          <VentasTable
            pedidos={filtered}
            loading={loading}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            sortData={sortData}
            onRowClick={(pedido) => void openDetail(pedido)}
          />
          <OrderDetail
            pedido={selected}
            loadingDetail={loadingDetail}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        </>
      ) : (
        <VentasPorProducto
          dateFrom={dateFrom}
          dateTo={dateTo}
          corteFilter={corteFilter}
          search={productoSearch}
          onSearchChange={setProductoSearch}
        />
      )}
    </div>
  );
}
