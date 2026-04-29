'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChefHat, RefreshCw, Search } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { ActiveFiltersChip, DataTable, type Column } from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCurrency, formatNumber } from '@/lib/format';
import { fetchRecetas, type Receta } from '@/lib/productos/recetas';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

const FILTER_DEFAULTS = {
  search: '',
  soloMargenNegativo: false,
};

export default function ProductosRecetasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <ProductosRecetasBody />
    </RequireAccess>
  );
}

function ProductosRecetasBody() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll } = useUrlFilters(FILTER_DEFAULTS);
  const search = filters.search;
  const soloMargenNegativo = filters.soloMargenNegativo;

  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const [selected, setSelected] = useState<Receta | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const data = await fetchRecetas(supabase, RDB_EMPRESA_ID);
      setRecetas(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-abrir drawer cuando llega un ?focus=<id> (deep-link desde Auditoría).
  useEffect(() => {
    if (!focusId || recetas.length === 0) return;
    const match = recetas.find((r) => r.producto_venta_id === focusId);
    if (match) {
      setSelected(match);
      setDrawerOpen(true);
    }
  }, [focusId, recetas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recetas.filter((r) => {
      if (soloMargenNegativo) {
        if (r.margen_pct == null || r.margen_pct >= 0) return false;
      }
      if (q) {
        const inProd = r.producto_venta_nombre.toLowerCase().includes(q);
        const inCat = (r.categoria_nombre ?? '').toLowerCase().includes(q);
        const inInsumo = r.insumos.some((i) => i.insumo_nombre.toLowerCase().includes(q));
        if (!inProd && !inCat && !inInsumo) return false;
      }
      return true;
    });
  }, [recetas, search, soloMargenNegativo]);

  const activeCount = (search.trim() ? 1 : 0) + (soloMargenNegativo ? 1 : 0);

  const columns = useMemo<Column<Receta>[]>(
    () => [
      {
        key: 'producto_venta_nombre',
        label: 'Producto',
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.producto_venta_nombre}</span>
            {row.categoria_nombre ? (
              <span className="text-muted-foreground text-xs">{row.categoria_nombre}</span>
            ) : null}
          </div>
        ),
        accessor: (row) => row.producto_venta_nombre.toLowerCase(),
      },
      {
        key: 'insumos_count',
        label: 'Insumos',
        type: 'number',
        accessor: (row) => row.insumos_count,
      },
      {
        key: 'costo_total',
        label: 'Costo receta',
        type: 'currency',
        accessor: (row) => row.costo_total ?? 0,
        render: (row) =>
          row.costo_total == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatCurrency(row.costo_total)
          ),
      },
      {
        key: 'precio_venta',
        label: 'Precio venta',
        type: 'currency',
        accessor: (row) => row.precio_venta ?? 0,
        render: (row) =>
          row.precio_venta == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatCurrency(row.precio_venta)
          ),
      },
      {
        key: 'margen_pct',
        label: 'Margen',
        type: 'number',
        accessor: (row) => row.margen_pct ?? -Infinity,
        render: (row) => {
          if (row.margen_pct == null) return <span className="text-muted-foreground">—</span>;
          const cls =
            row.margen_pct < 0
              ? 'text-red-600'
              : row.margen_pct < 30
                ? 'text-amber-600'
                : 'text-emerald-600';
          return <span className={`tabular-nums ${cls}`}>{row.margen_pct.toFixed(1)}%</span>;
        },
      },
    ],
    []
  );

  const openDrawer = useCallback((row: Receta) => {
    setSelected(row);
    setDrawerOpen(true);
  }, []);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text)]/60">
          Productos vendibles con su receta: insumos consumidos, costo calculado y margen vs precio
          de venta. El costo del insumo viene del último costo registrado; insumos sin costo
          conocido dejan la receta sin costo total.
        </p>
        <Button variant="outline" size="sm" onClick={() => void fetchData()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar producto, categoría o insumo…"
            className="pl-8"
            aria-label="Buscar producto, categoría o insumo"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloMargenNegativo}
            onChange={(e) => setFilter('soloMargenNegativo', e.target.checked)}
          />
          Solo margen negativo
        </label>
        <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey="producto_venta_id"
        onRowClick={openDrawer}
        loading={loading}
        error={error}
        onRetry={() => void fetchData()}
        initialSort={{ key: 'producto_venta_nombre', dir: 'asc' }}
        emptyTitle="No hay recetas configuradas"
        emptyDescription="Cuando un producto vendible tenga insumos en erp.producto_receta, aparecerá aquí."
        emptyIcon={<ChefHat className="h-6 w-6" />}
      />

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected?.producto_venta_nombre ?? 'Receta'}
        description={
          selected
            ? [selected.categoria_nombre, `${selected.insumos_count} insumos`]
                .filter(Boolean)
                .join(' · ') || undefined
            : undefined
        }
        meta={
          selected ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {selected.precio_venta == null
                ? 'Sin precio'
                : `Precio ${formatCurrency(selected.precio_venta)}`}
              {' · '}
              {selected.costo_total == null
                ? 'Sin costo'
                : `Costo ${formatCurrency(selected.costo_total)}`}
              {selected.margen_pct == null ? '' : ` · Margen ${selected.margen_pct.toFixed(1)}%`}
            </span>
          ) : null
        }
        size="lg"
      >
        <DetailDrawerContent>
          {selected ? <InsumosSection receta={selected} /> : null}
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

function InsumosSection({ receta }: { receta: Receta }) {
  if (receta.insumos.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm">
        Esta receta no tiene insumos configurados.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        Insumos · cantidad y costo
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Insumo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-left font-medium">Unidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {receta.insumos.map((i) => (
              <tr key={i.insumo_id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className={i.insumo_orfano ? 'text-red-600' : ''}>{i.insumo_nombre}</span>
                    {i.insumo_unidad && i.insumo_unidad !== i.unidad ? (
                      <span className="text-muted-foreground text-xs">
                        unidad base: {i.insumo_unidad}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(i.cantidad)}</td>
                <td className="px-3 py-2">{i.unidad}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {i.costo_insumo == null ? '—' : formatCurrency(i.costo_insumo)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {i.costo_subtotal == null ? '—' : formatCurrency(i.costo_subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr className="border-t border-[var(--border)] font-medium">
              <td className="px-3 py-2" colSpan={4}>
                Total receta
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {receta.costo_total == null ? '—' : formatCurrency(receta.costo_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Edición de receta vive en la pestaña Catálogo, en el drawer del producto. La edición masiva
        consolidada llega en sprint posterior.
      </p>
    </div>
  );
}
