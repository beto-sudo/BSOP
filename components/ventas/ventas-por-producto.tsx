'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency } from '@/lib/format';
import { Download, Package, Search } from 'lucide-react';
import { TZ } from './utils';

type ProductoAgg = {
  product_id: string;
  product_name: string;
  unidades: number;
  importe: number;
  pedidos: number;
  ticket_prom: number;
  pct_total: number;
};

type WaitryItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number | null;
  total_price: number | null;
};

export type VentasPorProductoProps = {
  dateFrom: string;
  dateTo: string;
  corteFilter: string;
  search: string;
  onSearchChange: (value: string) => void;
};

export function VentasPorProducto({
  dateFrom,
  dateTo,
  corteFilter,
  search,
  onSearchChange,
}: VentasPorProductoProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductoAgg[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      let pedidosQuery = supabase
        .schema('rdb')
        .from('waitry_pedidos')
        .select('order_id, status')
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

      const validOrderIds = (pedidos ?? [])
        .filter((p) => !(p.status ?? '').toLowerCase().includes('cancel'))
        .map((p) => p.order_id)
        .filter((id): id is string => !!id);

      if (validOrderIds.length === 0) {
        setRows([]);
        return;
      }

      const CHUNK = 500;
      const allItems: WaitryItemRow[] = [];
      for (let i = 0; i < validOrderIds.length; i += CHUNK) {
        const chunk = validOrderIds.slice(i, i + CHUNK);
        const { data: items, error: itemsErr } = await supabase
          .schema('rdb')
          .from('waitry_productos')
          .select('order_id, product_id, product_name, quantity, total_price')
          .in('order_id', chunk);
        if (itemsErr) throw itemsErr;
        allItems.push(...((items ?? []) as WaitryItemRow[]));
      }

      const agg = new Map<
        string,
        {
          product_id: string;
          product_name: string;
          unidades: number;
          importe: number;
          ordersSet: Set<string>;
        }
      >();

      for (const it of allItems) {
        const key = it.product_id ?? `name:${it.product_name}`;
        const prev = agg.get(key);
        const unidades = Number(it.quantity ?? 0);
        const importe = Number(it.total_price ?? 0);
        if (prev) {
          prev.unidades += unidades;
          prev.importe += importe;
          prev.ordersSet.add(it.order_id);
        } else {
          agg.set(key, {
            product_id: it.product_id ?? key,
            product_name: it.product_name,
            unidades,
            importe,
            ordersSet: new Set([it.order_id]),
          });
        }
      }

      const totalGeneral = Array.from(agg.values()).reduce((s, a) => s + a.importe, 0);
      const result: ProductoAgg[] = Array.from(agg.values()).map((a) => ({
        product_id: a.product_id,
        product_name: a.product_name,
        unidades: a.unidades,
        importe: a.importe,
        pedidos: a.ordersSet.size,
        ticket_prom: a.ordersSet.size ? a.importe / a.ordersSet.size : 0,
        pct_total: totalGeneral ? (a.importe / totalGeneral) * 100 : 0,
      }));

      setRows(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar ventas por producto');
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
    return rows.filter((r) => r.product_name.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      unidades: filtered.reduce((s, r) => s + r.unidades, 0),
      importe: filtered.reduce((s, r) => s + r.importe, 0),
      productos: filtered.length,
    }),
    [filtered]
  );

  const exportCsv = () => {
    const header = ['Producto', 'Unidades', 'Importe', 'Pedidos', 'Ticket prom.', '% del total'];
    const lines = [header.join(',')];
    // Sort by importe desc to match the visible table default sort.
    const sorted = [...filtered].sort((a, b) => b.importe - a.importe);
    for (const r of sorted) {
      lines.push(
        [
          `"${r.product_name.replace(/"/g, '""')}"`,
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
    a.download = `rdb-ventas-por-producto-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Productos distintos
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.productos}</div>
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
            placeholder="Buscar producto…"
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

      <DataTable<ProductoAgg>
        data={filtered}
        columns={productoColumns}
        rowKey="product_id"
        loading={loading}
        error={error}
        onRetry={() => void fetchData()}
        initialSort={{ key: 'importe', dir: 'desc' }}
        emptyIcon={<Package className="h-8 w-8 opacity-50" />}
        emptyTitle="Sin ventas en el rango seleccionado"
        showDensityToggle={false}
      />
    </div>
  );
}

const productoColumns: Column<ProductoAgg>[] = [
  {
    key: 'product_name',
    label: 'Producto',
    cellClassName: 'font-medium',
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
