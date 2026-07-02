'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency } from '@/lib/format';
import { Download, Package, Search, X } from 'lucide-react';
import { TZ } from './utils';
import { CategoriaBadge } from './categoria-badge';
import type { CategoriaFilter } from './types';
import { prorratearLineas, ventaCobrada } from './venta-cobrada';
import { fetchPagosPorPedido, matchTipoPago } from './tipo-pago';

type ProductoAgg = {
  product_id: string;
  product_name: string;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  unidades: number;
  importe: number;
  pedidos: number;
  ticket_prom: number;
  pct_total: number;
};

type CategoriaItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  quantity: number | null;
  total_price: number | null;
};

export type VentasPorProductoProps = {
  dateFrom: string;
  dateTo: string;
  corteFilter: string;
  pagoFilter: string;
  search: string;
  onSearchChange: (value: string) => void;
  categoriaFilter: CategoriaFilter | null;
  onClearCategoriaFilter: () => void;
};

export function VentasPorProducto({
  dateFrom,
  dateTo,
  corteFilter,
  pagoFilter,
  search,
  onSearchChange,
  categoriaFilter,
  onClearCategoriaFilter,
}: VentasPorProductoProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductoAgg[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      // Vista canónica excluye fantasmas (rdb-waitry-deduplicacion ADR-031).
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

      let validPedidos = (pedidos ?? []).filter(
        (p) => !!p.order_id && !(p.status ?? '').toLowerCase().includes('cancel')
      );

      // Filtro por tipo de pago — mismo criterio que el tab Pedidos: el
      // pedido matchea si alguno de sus pagos usa ese tipo, y se reporta
      // completo (no se parte el monto por método).
      if (pagoFilter !== 'all') {
        const pagosPorPedido = await fetchPagosPorPedido(
          supabase,
          validPedidos.map((p) => p.order_id as string)
        );
        validPedidos = validPedidos.filter((p) =>
          matchTipoPago(pagosPorPedido.get(p.order_id as string)?.tipos, pagoFilter)
        );
      }

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

      // v_waitry_productos_categoria enriquece cada línea con su categoría
      // del catálogo (rdb-ventas-por-categoria Sprint 1).
      const CHUNK = 500;
      const allItems: CategoriaItemRow[] = [];
      for (let i = 0; i < validOrderIds.length; i += CHUNK) {
        const chunk = validOrderIds.slice(i, i + CHUNK);
        const { data: items, error: itemsErr } = await supabase
          .schema('rdb')
          .from('v_waitry_productos_categoria')
          .select(
            'order_id, product_id, product_name, categoria_id, categoria_nombre, categoria_color, quantity, total_price'
          )
          .in('order_id', chunk);
        if (itemsErr) throw itemsErr;
        allItems.push(...((items ?? []) as CategoriaItemRow[]));
      }

      const lineasCobradas = prorratearLineas(allItems, cobradoPorPedido);

      const agg = new Map<
        string,
        {
          product_id: string;
          product_name: string;
          categoria_id: string | null;
          categoria_nombre: string | null;
          categoria_color: string | null;
          unidades: number;
          importe: number;
          ordersSet: Set<string>;
        }
      >();

      for (const it of lineasCobradas) {
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
            // Un product_id resuelve siempre a la misma categoría vía la
            // vista, así que la primera línea define la del producto.
            categoria_id: it.categoria_id,
            categoria_nombre: it.categoria_nombre,
            categoria_color: it.categoria_color,
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
      setError(e instanceof Error ? e.message : 'Error al cargar ventas por producto');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, corteFilter, pagoFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    let r = rows;
    // Filtro de categoría — llega del drill-down desde el tab "Por
    // categoría". id null = fila "Sin categoría".
    if (categoriaFilter) {
      r =
        categoriaFilter.id === null
          ? r.filter((x) => x.categoria_id == null)
          : r.filter((x) => x.categoria_id === categoriaFilter.id);
    }
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.product_name.toLowerCase().includes(q));
    }
    return r;
  }, [rows, search, categoriaFilter]);

  const totals = useMemo(
    () => ({
      unidades: filtered.reduce((s, r) => s + r.unidades, 0),
      importe: filtered.reduce((s, r) => s + r.importe, 0),
      productos: filtered.length,
    }),
    [filtered]
  );

  const exportCsv = () => {
    const header = [
      'Producto',
      'Categoría',
      'Unidades',
      'Importe',
      'Pedidos',
      'Ticket prom.',
      '% del total',
    ];
    const lines = [header.join(',')];
    // Sort by importe desc to match the visible table default sort.
    const sorted = [...filtered].sort((a, b) => b.importe - a.importe);
    for (const r of sorted) {
      lines.push(
        [
          `"${r.product_name.replace(/"/g, '""')}"`,
          `"${(r.categoria_nombre ?? 'Sin categoría').replace(/"/g, '""')}"`,
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
        {categoriaFilter && (
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pl-2 pr-1">
            <span className="text-xs text-muted-foreground">Categoría:</span>
            <CategoriaBadge nombre={categoriaFilter.nombre} color={categoriaFilter.color} />
            <button
              type="button"
              onClick={onClearCategoriaFilter}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Quitar filtro de categoría"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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
        emptyTitle={
          categoriaFilter
            ? `Sin ventas de ${categoriaFilter.nombre} en el rango seleccionado`
            : 'Sin ventas en el rango seleccionado'
        }
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
    key: 'categoria_nombre',
    label: 'Categoría',
    render: (r) => (
      <CategoriaBadge nombre={r.categoria_nombre ?? 'Sin categoría'} color={r.categoria_color} />
    ),
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
