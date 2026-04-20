'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { SortableHead } from '@/components/ui/sortable-head';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Package, Search } from 'lucide-react';
import { TZ, formatCurrency } from './utils';

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

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<ProductoAgg>('importe', 'desc');

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
    for (const r of sortData(filtered)) {
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

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                sortKey="product_name"
                label="Producto"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                sortKey="unidades"
                label="Unidades"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
              <SortableHead
                sortKey="importe"
                label="Importe"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
              <SortableHead
                sortKey="pedidos"
                label="Pedidos"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
              <SortableHead
                sortKey="ticket_prom"
                label="Ticket prom."
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
              <SortableHead
                sortKey="pct_total"
                label="% del total"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  Sin ventas en el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              sortData(filtered).map((r) => (
                <TableRow key={r.product_id}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.unidades.toLocaleString('es-MX')}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(r.importe)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.pedidos}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(r.ticket_prom)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500/70"
                          style={{ width: `${Math.min(100, r.pct_total)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{r.pct_total.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
