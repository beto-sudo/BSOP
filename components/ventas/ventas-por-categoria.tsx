'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency } from '@/lib/format';
import { Download, Search, Tags } from 'lucide-react';
import { TZ } from './utils';
import { CategoriaBadge } from './categoria-badge';
import type { CategoriaFilter } from './types';
import { prorratearLineas, ventaCobrada } from './venta-cobrada';

// Las líneas de venta cuyo producto no resuelve a una categoría del
// catálogo (product_id sin match en erp.productos.codigo, o producto sin
// categoria_id) se agrupan acá — el gap queda visible, no oculto.
const SIN_CATEGORIA_KEY = 'sin-categoria';
const SIN_CATEGORIA_LABEL = 'Sin categoría';

type CategoriaAgg = {
  categoria_id: string;
  categoria_nombre: string;
  categoria_color: string | null;
  unidades: number;
  importe: number;
  pedidos: number;
  ticket_prom: number;
  pct_total: number;
};

type CategoriaItemRow = {
  order_id: string;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  quantity: number | null;
  total_price: number | null;
};

export type VentasPorCategoriaProps = {
  dateFrom: string;
  dateTo: string;
  corteFilter: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCategoriaClick: (categoria: CategoriaFilter) => void;
};

export function VentasPorCategoria({
  dateFrom,
  dateTo,
  corteFilter,
  search,
  onSearchChange,
  onCategoriaClick,
}: VentasPorCategoriaProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CategoriaAgg[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      // Mismo conjunto de pedidos válidos que el tab "Por producto": vista
      // canónica (excluye fantasmas, rdb-waitry-deduplicacion ADR-031) y
      // descartando cancelados — así el importe total cuadra entre tabs.
      let pedidosQuery = supabase
        .schema('rdb')
        .from('v_waitry_pedidos')
        .select('order_id, status, total_amount, total_discount')
        .limit(10000);

      if (corteFilter !== 'all') {
        pedidosQuery = pedidosQuery.eq('corte_id', corteFilter);
      } else {
        if (dateFrom)
          pedidosQuery = pedidosQuery.gte('timestamp', getLocalDayBoundsUtc(dateFrom, TZ).start);
        if (dateTo)
          pedidosQuery = pedidosQuery.lte('timestamp', getLocalDayBoundsUtc(dateTo, TZ).end);
      }

      const { data: pedidos, error: pedidosErr } = await pedidosQuery;
      if (pedidosErr) throw pedidosErr;

      const validPedidos = (pedidos ?? []).filter(
        (p) => !!p.order_id && !(p.status ?? '').toLowerCase().includes('cancel')
      );
      const validOrderIds = validPedidos.map((p) => p.order_id as string);

      if (validOrderIds.length === 0) {
        setRows([]);
        return;
      }

      // Venta cobrada por pedido — las líneas se prorratean a esta cifra para
      // que el importe total cuadre con el tab Pedidos (descuentos de
      // cabecera y líneas incompletas del POS incluidos).
      const cobradoPorPedido = new Map(
        validPedidos.map((p) => [p.order_id as string, ventaCobrada(p)])
      );

      const CHUNK = 500;
      const allItems: CategoriaItemRow[] = [];
      for (let i = 0; i < validOrderIds.length; i += CHUNK) {
        const chunk = validOrderIds.slice(i, i + CHUNK);
        const { data: items, error: itemsErr } = await supabase
          .schema('rdb')
          .from('v_waitry_productos_categoria')
          .select(
            'order_id, categoria_id, categoria_nombre, categoria_color, quantity, total_price'
          )
          .in('order_id', chunk);
        if (itemsErr) throw itemsErr;
        allItems.push(...((items ?? []) as CategoriaItemRow[]));
      }

      const lineasCobradas = prorratearLineas(allItems, cobradoPorPedido);

      const agg = new Map<
        string,
        {
          categoria_id: string;
          categoria_nombre: string;
          categoria_color: string | null;
          unidades: number;
          importe: number;
          ordersSet: Set<string>;
        }
      >();

      for (const it of lineasCobradas) {
        const key = it.categoria_id ?? SIN_CATEGORIA_KEY;
        const prev = agg.get(key);
        const unidades = Number(it.quantity ?? 0);
        const importe = Number(it.total_price ?? 0);
        if (prev) {
          prev.unidades += unidades;
          prev.importe += importe;
          prev.ordersSet.add(it.order_id);
        } else {
          agg.set(key, {
            categoria_id: key,
            categoria_nombre: it.categoria_nombre ?? SIN_CATEGORIA_LABEL,
            categoria_color: it.categoria_color,
            unidades,
            importe,
            ordersSet: new Set([it.order_id]),
          });
        }
      }

      const totalGeneral = Array.from(agg.values()).reduce((s, a) => s + a.importe, 0);
      const result: CategoriaAgg[] = Array.from(agg.values()).map((a) => ({
        categoria_id: a.categoria_id,
        categoria_nombre: a.categoria_nombre,
        categoria_color: a.categoria_color,
        unidades: a.unidades,
        importe: a.importe,
        pedidos: a.ordersSet.size,
        ticket_prom: a.ordersSet.size ? a.importe / a.ordersSet.size : 0,
        pct_total: totalGeneral ? (a.importe / totalGeneral) * 100 : 0,
      }));

      setRows(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar ventas por categoría');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, corteFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.categoria_nombre.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      unidades: filtered.reduce((s, r) => s + r.unidades, 0),
      importe: filtered.reduce((s, r) => s + r.importe, 0),
      categorias: filtered.length,
    }),
    [filtered]
  );

  const exportCsv = () => {
    const header = ['Categoría', 'Unidades', 'Importe', 'Pedidos', 'Ticket prom.', '% del total'];
    const lines = [header.join(',')];
    // Sort by importe desc to match the visible table default sort.
    const sorted = [...filtered].sort((a, b) => b.importe - a.importe);
    for (const r of sorted) {
      lines.push(
        [
          `"${r.categoria_nombre.replace(/"/g, '""')}"`,
          r.unidades.toString(),
          r.importe.toFixed(2),
          r.pedidos.toString(),
          r.ticket_prom.toFixed(2),
          r.pct_total.toFixed(2),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rdb-ventas-por-categoria-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categorías con venta
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.categorias}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unidades vendidas
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {totals.unidades.toLocaleString('es-MX')}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Importe total
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCurrency(totals.importe)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar categoría…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!filtered.length}
          className="gap-2"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <DataTable<CategoriaAgg>
        data={filtered}
        columns={categoriaColumns}
        rowKey="categoria_id"
        loading={loading}
        error={error}
        onRetry={() => void fetchData()}
        onRowClick={(r) =>
          onCategoriaClick({
            id: r.categoria_id === SIN_CATEGORIA_KEY ? null : r.categoria_id,
            nombre: r.categoria_nombre,
            color: r.categoria_color,
          })
        }
        initialSort={{ key: 'importe', dir: 'desc' }}
        emptyIcon={<Tags className="h-8 w-8 opacity-50" />}
        emptyTitle="Sin ventas en el rango seleccionado"
        showDensityToggle={false}
      />
    </div>
  );
}

const categoriaColumns: Column<CategoriaAgg>[] = [
  {
    key: 'categoria_nombre',
    label: 'Categoría',
    render: (r) => <CategoriaBadge nombre={r.categoria_nombre} color={r.categoria_color} />,
  },
  {
    key: 'unidades',
    label: 'Unidades',
    type: 'number',
    render: (r) => r.unidades.toLocaleString('es-MX'),
  },
  {
    key: 'importe',
    label: 'Importe',
    type: 'currency',
    cellClassName: 'font-medium',
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    type: 'number',
    cellClassName: 'text-muted-foreground',
    render: (r) => r.pedidos,
  },
  {
    key: 'ticket_prom',
    label: 'Ticket prom.',
    type: 'currency',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'pct_total',
    label: '% del total',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (r) => (
      <div className="flex items-center justify-end gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-emerald-500/70"
            style={{ width: `${Math.min(100, r.pct_total)}%` }}
          />
        </div>
        <span className="w-12 text-right">{r.pct_total.toFixed(1)}%</span>
      </div>
    ),
  },
];
