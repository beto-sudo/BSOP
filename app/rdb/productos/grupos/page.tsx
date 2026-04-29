'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, RefreshCw, Search } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { ActiveFiltersChip, DataTable, type Column } from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCurrency, formatNumber } from '@/lib/format';

type Hijo = {
  id: string;
  nombre: string;
  factor_consumo: number;
  precio: number | null;
};

type Grupo = {
  padre_id: string;
  padre_nombre: string;
  categoria: string | null;
  costo_unitario: number | null;
  unidad: string | null;
  total_hijos: number;
  hijos: Hijo[];
};

const FILTER_DEFAULTS = {
  search: '',
  soloConHijos: false,
};

function parseHijos(raw: unknown): Hijo[] {
  if (!Array.isArray(raw)) return [];
  const out: Hijo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== 'string' || typeof v.nombre !== 'string') continue;
    out.push({
      id: v.id,
      nombre: v.nombre,
      factor_consumo: Number(v.factor_consumo ?? 1),
      precio: v.precio == null ? null : Number(v.precio),
    });
  }
  return out;
}

export default function ProductosGruposPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <ProductosGruposBody />
    </RequireAccess>
  );
}

function ProductosGruposBody() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll } = useUrlFilters(FILTER_DEFAULTS);
  const search = filters.search;
  const soloConHijos = filters.soloConHijos;

  const [selected, setSelected] = useState<Grupo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchGrupos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: viewError } = await supabase
        .schema('rdb')
        .from('v_productos_grupo')
        .select('*')
        .order('padre_nombre', { ascending: true });
      if (viewError) throw viewError;
      const mapped: Grupo[] = (data ?? []).map((row) => ({
        padre_id: row.padre_id ?? '',
        padre_nombre: row.padre_nombre ?? 'Sin nombre',
        categoria: row.categoria ?? null,
        costo_unitario: row.costo_unitario == null ? null : Number(row.costo_unitario),
        unidad: row.unidad ?? null,
        total_hijos: row.total_hijos == null ? 0 : Number(row.total_hijos),
        hijos: parseHijos(row.hijos),
      }));
      setGrupos(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar grupos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGrupos();
  }, [fetchGrupos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grupos.filter((g) => {
      if (soloConHijos && g.total_hijos === 0) return false;
      if (q) {
        const inPadre = g.padre_nombre.toLowerCase().includes(q);
        const inCategoria = (g.categoria ?? '').toLowerCase().includes(q);
        const inHijo = g.hijos.some((h) => h.nombre.toLowerCase().includes(q));
        if (!inPadre && !inCategoria && !inHijo) return false;
      }
      return true;
    });
  }, [grupos, search, soloConHijos]);

  const activeCount = (search.trim() ? 1 : 0) + (soloConHijos ? 1 : 0);

  const columns = useMemo<Column<Grupo>[]>(
    () => [
      {
        key: 'padre_nombre',
        label: 'Producto padre',
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.padre_nombre}</span>
            {row.categoria ? (
              <span className="text-muted-foreground text-xs">{row.categoria}</span>
            ) : null}
          </div>
        ),
        accessor: (row) => row.padre_nombre.toLowerCase(),
      },
      {
        key: 'costo_unitario',
        label: 'Costo unitario',
        type: 'currency',
        accessor: (row) => row.costo_unitario ?? 0,
        render: (row) =>
          row.costo_unitario == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatCurrency(row.costo_unitario)
          ),
      },
      {
        key: 'unidad',
        label: 'Unidad',
        type: 'text',
        render: (row) =>
          row.unidad ? row.unidad : <span className="text-muted-foreground">—</span>,
      },
      {
        key: 'total_hijos',
        label: 'Hijos',
        type: 'number',
        accessor: (row) => row.total_hijos,
      },
    ],
    []
  );

  const openDrawer = useCallback((row: Grupo) => {
    setSelected(row);
    setDrawerOpen(true);
  }, []);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text)]/60">
          Productos padres con sus hijos y factor de consumo. Solo lectura — la edición masiva del
          factor llega en Sprint 3.
        </p>
        <Button variant="outline" size="sm" onClick={() => void fetchGrupos()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar padre, categoría o hijo…"
            className="pl-8"
            aria-label="Buscar padre, categoría o hijo"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloConHijos}
            onChange={(e) => setFilter('soloConHijos', e.target.checked)}
          />
          Solo padres con hijos
        </label>
        <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey="padre_id"
        onRowClick={openDrawer}
        loading={loading}
        error={error}
        onRetry={() => void fetchGrupos()}
        initialSort={{ key: 'padre_nombre', dir: 'asc' }}
        emptyTitle="No hay grupos configurados"
        emptyDescription="Cuando un producto tenga otros con parent_id apuntando a él, aparecerá aquí como padre."
        emptyIcon={<Layers className="h-6 w-6" />}
      />

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected?.padre_nombre ?? 'Grupo'}
        description={
          selected
            ? [selected.categoria, selected.unidad].filter(Boolean).join(' · ') || undefined
            : undefined
        }
        meta={
          selected ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {selected.costo_unitario == null
                ? 'Sin costo'
                : `Costo ${formatCurrency(selected.costo_unitario)}`}
              {' · '}
              {selected.total_hijos} {selected.total_hijos === 1 ? 'hijo' : 'hijos'}
            </span>
          ) : null
        }
        size="lg"
      >
        <DetailDrawerContent>
          {selected ? <HijosSection grupo={selected} /> : null}
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

function HijosSection({ grupo }: { grupo: Grupo }) {
  if (grupo.hijos.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm">
        Este padre no tiene hijos configurados todavía.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        Hijos · factor de consumo y precio
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Hijo</th>
              <th className="px-3 py-2 text-right font-medium">Factor</th>
              <th className="px-3 py-2 text-right font-medium">Precio</th>
            </tr>
          </thead>
          <tbody>
            {grupo.hijos.map((h) => (
              <tr key={h.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{h.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(h.factor_consumo)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {h.precio == null ? '—' : formatCurrency(h.precio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Edición masiva del factor de consumo llega en Sprint 3.
      </p>
    </div>
  );
}
