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

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { OrderDetail } from './order-detail';
import { SummaryBar } from './summary-bar';
import { VentasFilters } from './ventas-filters';
import { VentasTable } from './ventas-table';
import type { CorteOption, Pedido } from './types';
import { TZ, rangeForPreset, todayRange } from './utils';

export function VentasView() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [corteFilter, setCorteFilter] = useState<string>('all');
  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Pedido>('timestamp', 'desc');
  const [cortes, setCortes] = useState<CorteOption[]>([]);
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_ventas', preset);
    if (!preset) return;
    const range = rangeForPreset(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_ventas');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

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

      {/* Summary stats */}
      {!loading && !error && <SummaryBar pedidos={filtered} />}

      {/* Filters */}
      <VentasFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        corteFilter={corteFilter}
        onCorteFilterChange={setCorteFilter}
        cortes={cortes}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => {
          setDateFrom(value);
          setPresetKey('custom');
        }}
        onDateToChange={(value) => {
          setDateTo(value);
          setPresetKey('custom');
        }}
        presetKey={presetKey}
        onPresetChange={handlePreset}
        loading={loading}
        onRefresh={() => void fetchPedidos()}
        count={filtered.length}
      />

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Table */}
      <VentasTable
        pedidos={filtered}
        loading={loading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        sortData={sortData}
        onRowClick={(pedido) => void openDetail(pedido)}
      />

      {/* Order detail drawer */}
      <OrderDetail
        pedido={selected}
        loadingDetail={loadingDetail}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
