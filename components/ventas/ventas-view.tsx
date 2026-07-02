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
import { useUrlFilters } from '@/hooks/use-url-filters';
import { ErrorBanner } from '@/components/module-page';
import { OrderDetail } from './order-detail';
import { SummaryBar } from './summary-bar';
import { VentasFilters } from './ventas-filters';
import { VentasTable } from './ventas-table';
import { VentasPorProducto } from './ventas-por-producto';
import { VentasPorCategoria } from './ventas-por-categoria';
import { VentasComparativo } from './ventas-comparativo';
import type { CategoriaFilter, CorteOption, Pedido } from './types';
import { TZ, rangeForPreset, todayRange } from './utils';
import { fetchPagosPorPedido, type PagosPedido } from './tipo-pago';

type VentasTab = 'pedidos' | 'por-producto' | 'por-categoria' | 'comparativo';

export function VentasView() {
  const [tab, setTab] = useState<VentasTab>('pedidos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productoSearch, setProductoSearch] = useState('');
  const [categoriaSearch, setCategoriaSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState<CategoriaFilter | null>(null);
  const [cortes, setCortes] = useState<CorteOption[]>([]);
  // Pagos por pedido (rdb.waitry_pagos) — alimenta la columna "Pago", los
  // KPIs por método del summary y el filtro de tipo de pago. Se carga tras
  // cada fetch de pedidos.
  const [pagosPorPedido, setPagosPorPedido] = useState<Map<string, PagosPedido> | null>(null);
  const [loadingPagos, setLoadingPagos] = useState(false);

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
      pagoFilter: 'all',
      dateFrom: today.from,
      dateTo: today.to,
      presetKey: 'hoy',
      showDuplicados: 'off',
    };
  }, []);
  const { filters, setFilter, setFilters, clearAll, activeCount } = useUrlFilters(filterDefaults);
  const {
    search,
    statusFilter,
    corteFilter,
    pagoFilter,
    dateFrom,
    dateTo,
    presetKey,
    showDuplicados,
  } = filters;
  const showFantasmas = showDuplicados === 'on';

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    const range = rangeForPreset(preset);
    if (range) {
      setFilters({ presetKey: preset, dateFrom: range.from, dateTo: range.to });
    } else {
      setFilter('presetKey', preset);
    }
  };

  // Drill-down: hacer click en una categoría del tab "Por categoría" abre
  // el tab "Por producto" filtrado a esa categoría. Las fechas y el corte
  // son globales a VentasView, así que el rango seleccionado se preserva.
  const handleCategoriaClick = (cat: CategoriaFilter) => {
    setCategoriaFilter(cat);
    setTab('por-producto');
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

      // Iniciativa rdb-waitry-deduplicacion (ADR-031): default leemos de la
      // vista canónica `rdb.v_waitry_pedidos` que excluye los fantasmas
      // detectados por el bug del POS Waitry. Con el toggle "Mostrar
      // duplicados detectados" activo cambiamos a `v_waitry_pedidos_con_fantasmas`
      // que proyecta `es_fantasma` boolean para destacarlos en la tabla.
      const sourceView = showFantasmas ? 'v_waitry_pedidos_con_fantasmas' : 'v_waitry_pedidos';
      let query = supabase
        .schema('rdb')
        .from(sourceView)
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
      // Cast: las vistas en types/supabase.ts tipan TODAS las columnas como
      // nullable porque PostgREST no infiere NOT NULL de vistas. La tabla
      // base sí garantiza id NOT NULL — los datos son sanos.
      setPedidos((data ?? []) as Pedido[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, corteFilter, showFantasmas]);

  useEffect(() => {
    void fetchCortes();
  }, [fetchCortes]);

  useEffect(() => {
    void fetchPedidos();
  }, [fetchPedidos]);

  // Resolver los pagos de los pedidos cargados. Se refresca cuando cambia el
  // conjunto de pedidos.
  useEffect(() => {
    const orderIds = pedidos.map((p) => p.order_id).filter((id): id is string => !!id);
    if (orderIds.length === 0) {
      setPagosPorPedido(new Map());
      return;
    }
    let cancelled = false;
    setLoadingPagos(true);
    fetchPagosPorPedido(createSupabaseBrowserClient(), orderIds)
      .then((map) => {
        if (!cancelled) setPagosPorPedido(map);
      })
      .catch(() => {
        // non-fatal: sin el mapa, la columna "Pago" y los KPIs por método
        // quedan vacíos y el filtro específico no matchea nada; el usuario
        // puede reintentar con "Actualizar".
        if (!cancelled) setPagosPorPedido(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoadingPagos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pedidos]);

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

  // Pedidos enriquecidos con sus tipos/montos de pago — la columna "Pago" de
  // la tabla y los KPIs del summary leen estos campos.
  const pedidosConPagos = useMemo(
    () =>
      pedidos.map((p) => {
        const pagosPedido = p.order_id ? pagosPorPedido?.get(p.order_id) : undefined;
        if (!pagosPedido) return p;
        return { ...p, tipos_pago: [...pagosPedido.tipos], montos_pago: pagosPedido.montoPorTipo };
      }),
    [pedidos, pagosPorPedido]
  );

  const filtered = pedidosConPagos.filter((p) => {
    if (statusFilter !== 'all' && p.status?.toLowerCase() !== statusFilter) return false;
    if (pagoFilter !== 'all' && !(p.tipos_pago as string[] | undefined)?.includes(pagoFilter))
      return false;
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
  // Solo cuenta fantasmas cuando el toggle está ON: con OFF la query usa la
  // vista canónica que ya los excluye, así que `pedidos` no los contiene.
  const fantasmasCount = showFantasmas ? filtered.filter((p) => p.es_fantasma).length : undefined;

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
            ['por-categoria', 'Por categoría'],
            ['comparativo', 'Comparativo'],
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

      {/* Filters — el comparativo usa su propia ventana fija (últimas 6
          semanas), no el filtro global de fecha/corte. */}
      {tab !== 'comparativo' && (
        <VentasFilters
          search={tab === 'pedidos' ? search : ''}
          onSearchChange={(value) => setFilter('search', value)}
          statusFilter={statusFilter}
          onStatusFilterChange={(value) => setFilter('statusFilter', value)}
          corteFilter={corteFilter}
          onCorteFilterChange={(value) => setFilter('corteFilter', value)}
          cortes={cortes}
          pagoFilter={pagoFilter}
          onPagoFilterChange={(value) => setFilter('pagoFilter', value)}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(value) => setFilters({ dateFrom: value, presetKey: 'custom' })}
          onDateToChange={(value) => setFilters({ dateTo: value, presetKey: 'custom' })}
          presetKey={presetKey}
          onPresetChange={handlePreset}
          loading={loading || loadingPagos}
          onRefresh={() => void fetchPedidos()}
          count={filtered.length}
          activeCount={activeCount}
          onClearAll={clearAll}
          showFantasmas={showFantasmas}
          onShowFantasmasChange={(v) => setFilter('showDuplicados', v ? 'on' : 'off')}
          fantasmasCount={fantasmasCount}
        />
      )}

      {/* Error */}
      {error ? <ErrorBanner error={error} onRetry={() => void fetchPedidos()} /> : null}

      {tab === 'pedidos' && (
        <>
          <VentasTable
            pedidos={filtered}
            loading={loading || loadingPagos}
            onRowClick={(pedido) => void openDetail(pedido)}
          />
          <OrderDetail
            pedido={selected}
            loadingDetail={loadingDetail}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        </>
      )}
      {tab === 'por-producto' && (
        <VentasPorProducto
          dateFrom={dateFrom}
          dateTo={dateTo}
          corteFilter={corteFilter}
          pagoFilter={pagoFilter}
          search={productoSearch}
          onSearchChange={setProductoSearch}
          categoriaFilter={categoriaFilter}
          onClearCategoriaFilter={() => setCategoriaFilter(null)}
        />
      )}
      {tab === 'por-categoria' && (
        <VentasPorCategoria
          dateFrom={dateFrom}
          dateTo={dateTo}
          corteFilter={corteFilter}
          pagoFilter={pagoFilter}
          search={categoriaSearch}
          onSearchChange={setCategoriaSearch}
          onCategoriaClick={handleCategoriaClick}
        />
      )}
      {tab === 'comparativo' && <VentasComparativo />}
    </div>
  );
}
