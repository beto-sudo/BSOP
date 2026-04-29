'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, RefreshCw, Search } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { ActiveFiltersChip, DataTable, type Column } from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCurrency, formatNumber } from '@/lib/format';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type ProductoInfo = {
  id: string;
  nombre: string;
  unidad: string | null;
  categoria_nombre: string | null;
  ultimo_costo: number | null;
  ultimo_precio_venta: number | null;
};

type InsumoReceta = {
  insumo_id: string;
  insumo_nombre: string;
  insumo_unidad: string | null;
  cantidad: number;
  unidad: string;
  costo_insumo: number | null;
  costo_subtotal: number | null;
};

type Receta = {
  producto_venta_id: string;
  producto_venta_nombre: string;
  categoria_nombre: string | null;
  precio_venta: number | null;
  insumos: InsumoReceta[];
  insumos_count: number;
  costo_total: number | null;
  margen_pct: number | null;
};

const FILTER_DEFAULTS = {
  search: '',
  soloMargenNegativo: false,
};

function computeReceta(
  producto: ProductoInfo,
  rawInsumos: Array<{ insumo_id: string; cantidad: number; unidad: string }>,
  productoLookup: Map<string, ProductoInfo>
): Receta {
  let costoTotal: number | null = 0;
  let allCostsKnown = rawInsumos.length > 0;

  const insumos: InsumoReceta[] = rawInsumos.map((row) => {
    const insumo = productoLookup.get(row.insumo_id);
    const costoUnit = insumo?.ultimo_costo ?? null;
    const subtotal = costoUnit == null ? null : costoUnit * row.cantidad;
    if (subtotal == null) {
      allCostsKnown = false;
    } else if (costoTotal != null) {
      costoTotal += subtotal;
    }
    return {
      insumo_id: row.insumo_id,
      insumo_nombre: insumo?.nombre ?? 'Insumo eliminado',
      insumo_unidad: insumo?.unidad ?? null,
      cantidad: row.cantidad,
      unidad: row.unidad,
      costo_insumo: costoUnit,
      costo_subtotal: subtotal,
    };
  });

  const finalCosto = allCostsKnown ? costoTotal : null;
  const precio = producto.ultimo_precio_venta;
  const margen =
    finalCosto != null && precio != null && precio > 0
      ? ((precio - finalCosto) / precio) * 100
      : null;

  return {
    producto_venta_id: producto.id,
    producto_venta_nombre: producto.nombre,
    categoria_nombre: producto.categoria_nombre,
    precio_venta: precio,
    insumos,
    insumos_count: insumos.length,
    costo_total: finalCosto,
    margen_pct: margen,
  };
}

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

  const [selected, setSelected] = useState<Receta | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchRecetas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const [recetaRes, productoRes] = await Promise.all([
        supabase
          .schema('erp')
          .from('producto_receta')
          .select('producto_venta_id, insumo_id, cantidad, unidad')
          .eq('empresa_id', RDB_EMPRESA_ID),
        supabase.schema('rdb').from('v_productos_tabla').select('*'),
      ]);
      if (recetaRes.error) throw recetaRes.error;
      if (productoRes.error) throw productoRes.error;

      const productoLookup = new Map<string, ProductoInfo>();
      for (const p of productoRes.data ?? []) {
        if (!p.id) continue;
        productoLookup.set(p.id, {
          id: p.id,
          nombre: p.nombre ?? 'Sin nombre',
          unidad: p.unidad ?? null,
          categoria_nombre: p.categoria_nombre ?? null,
          ultimo_costo: p.ultimo_costo == null ? null : Number(p.ultimo_costo),
          ultimo_precio_venta: p.ultimo_precio_venta == null ? null : Number(p.ultimo_precio_venta),
        });
      }

      const grouped = new Map<
        string,
        Array<{ insumo_id: string; cantidad: number; unidad: string }>
      >();
      for (const row of recetaRes.data ?? []) {
        if (!row.producto_venta_id) continue;
        const list = grouped.get(row.producto_venta_id) ?? [];
        list.push({
          insumo_id: row.insumo_id ?? '',
          cantidad: Number(row.cantidad ?? 0),
          unidad: row.unidad ?? '',
        });
        grouped.set(row.producto_venta_id, list);
      }

      const out: Receta[] = [];
      for (const [productoVentaId, rows] of grouped) {
        const producto = productoLookup.get(productoVentaId);
        if (!producto) continue; // receta huérfana — producto venta eliminado
        out.push(computeReceta(producto, rows, productoLookup));
      }
      out.sort((a, b) => a.producto_venta_nombre.localeCompare(b.producto_venta_nombre));
      setRecetas(out);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecetas();
  }, [fetchRecetas]);

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
        <Button variant="outline" size="sm" onClick={() => void fetchRecetas()}>
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
        onRetry={() => void fetchRecetas()}
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
                    <span>{i.insumo_nombre}</span>
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
