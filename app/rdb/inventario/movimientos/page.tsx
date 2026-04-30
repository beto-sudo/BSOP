'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Search, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  ModuleFilters,
  ModuleContent,
  ErrorBanner,
  DataTable,
  type Column,
} from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DesktopOnlyNotice } from '@/components/responsive';
import { RDB_EMPRESA_ID, type MovimientoRow } from '@/components/inventario/types';
import { tipoColorClass, tipoLabel } from '@/components/inventario/utils';
import { formatCurrency, formatDateTime } from '@/lib/format';

type OrigenKey = 'todos' | 'oc' | 'venta' | 'manual';

function origenLabel(referenciaTipo: string | null): { key: OrigenKey; label: string } {
  if (referenciaTipo === 'oc_recepcion' || referenciaTipo === 'orden_compra') {
    return { key: 'oc', label: 'Por compra' };
  }
  if (referenciaTipo === 'venta_waitry' || referenciaTipo?.startsWith('venta')) {
    return { key: 'venta', label: 'Venta' };
  }
  return { key: 'manual', label: 'Manual' };
}

const movimientoColumns: Column<MovimientoRow>[] = [
  {
    key: 'created_at',
    label: 'Fecha',
    cellClassName: 'whitespace-nowrap text-sm text-muted-foreground',
    render: (m) => formatDateTime(m.created_at),
  },
  {
    key: 'producto',
    label: 'Producto',
    cellClassName: 'font-medium',
    accessor: (m) => m.productos?.nombre ?? '',
    render: (m) => m.productos?.nombre ?? '—',
  },
  {
    key: 'tipo_movimiento',
    label: 'Tipo',
    render: (m) => {
      const isPositive =
        m.tipo_movimiento === 'entrada' || (m.tipo_movimiento === 'ajuste' && m.cantidad >= 0);
      return (
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          )}
          <Badge variant="outline" className={tipoColorClass(m.tipo_movimiento, m.cantidad)}>
            {tipoLabel(m.tipo_movimiento, m.cantidad)}
          </Badge>
        </div>
      );
    },
  },
  {
    key: 'cantidad',
    label: 'Cantidad',
    type: 'number',
    render: (m) => {
      const isPositive =
        m.tipo_movimiento === 'entrada' || (m.tipo_movimiento === 'ajuste' && m.cantidad >= 0);
      const color = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
      return (
        <span className={`font-semibold ${color}`}>
          {isPositive ? '+' : '−'}
          {Math.abs(m.cantidad)}
        </span>
      );
    },
  },
  {
    key: 'costo_unitario',
    label: 'Costo Unit.',
    type: 'currency',
    cellClassName: 'text-sm',
    render: (m) => formatCurrency(m.costo_unitario),
  },
  {
    key: 'origen',
    label: 'Origen',
    sortable: false,
    accessor: (m) => origenLabel(m.referencia_tipo).label,
    render: (m) => {
      const origen = origenLabel(m.referencia_tipo);
      if (origen.key === 'oc' && m.oc_codigo && m.referencia_id) {
        return (
          <Link
            href={`/rdb/ordenes-compra?focus=${m.referencia_id}`}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
            title="Abrir OC origen"
          >
            <Truck className="h-3 w-3" />
            <span className="font-mono">{m.oc_codigo}</span>
          </Link>
        );
      }
      if (origen.key === 'oc') {
        return (
          <Badge variant="outline" className="gap-1">
            <Truck className="h-3 w-3" />
            Por compra
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Package className="h-3 w-3" />
          {origen.label}
        </Badge>
      );
    },
  },
  {
    key: 'notas',
    label: 'Notas',
    sortable: false,
    cellClassName: 'max-w-[220px] truncate text-sm text-muted-foreground',
    render: (m) => m.notas ?? '—',
  },
];

/**
 * Inventario · tab "Movimientos" (kardex consolidado).
 *
 * Layout (`app/rdb/inventario/layout.tsx`) provee `<ModulePage>`,
 * `<ModuleHeader>`, `<RoutedModuleTabs>` y `<RequireAccess>` (ADR-005).
 * Esta página solo carga la lista de movimientos y la presenta como tabla.
 *
 * Para registrar un movimiento manual, el usuario va al tab Stock (que
 * tiene la lista de productos cargada para alimentar el combobox del
 * dialog). Si en el futuro se quiere disparar el registro desde acá, hay
 * que cargar productos también o levantar el state del dialog al layout.
 *
 * @module Inventario — Movimientos (RDB)
 * @responsive desktop-only
 */
export default function InventarioMovimientosPage() {
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [origenFilter, setOrigenFilter] = useState<OrigenKey>('todos');

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .schema('erp')
        .from('movimientos_inventario')
        .select(
          'id, producto_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, referencia_id, notas, created_at, productos(nombre)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false })
        .limit(300);
      if (queryError) throw queryError;

      const rows = ((data ?? []) as unknown as MovimientoRow[]).map((m) => ({
        ...m,
        oc_codigo: null as string | null,
      }));

      // Resolver codigo de OC para movimientos con referencia_tipo='oc_recepcion'
      const ocIds = Array.from(
        new Set(
          rows
            .filter((m) => m.referencia_tipo === 'oc_recepcion' && m.referencia_id)
            .map((m) => m.referencia_id as string)
        )
      );
      if (ocIds.length > 0) {
        const { data: ocsData } = await supabase
          .schema('erp')
          .from('ordenes_compra')
          .select('id, codigo')
          .in('id', ocIds);
        const ocMap = new Map<string, string>();
        for (const oc of ocsData ?? []) {
          if (oc.id && oc.codigo) ocMap.set(oc.id, oc.codigo);
        }
        for (const m of rows) {
          if (m.referencia_id && ocMap.has(m.referencia_id)) {
            m.oc_codigo = ocMap.get(m.referencia_id) ?? null;
          }
        }
      }

      setMovimientos(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMovimientos();
  }, [fetchMovimientos]);

  const filteredMovimientos = useMemo(() => {
    return movimientos.filter((m) => {
      if (origenFilter !== 'todos') {
        const origen = origenLabel(m.referencia_tipo).key;
        if (origen !== origenFilter) return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (m.productos?.nombre ?? '').toLowerCase().includes(q) ||
        (m.notas ?? '').toLowerCase().includes(q) ||
        (m.oc_codigo ?? '').toLowerCase().includes(q)
      );
    });
  }, [movimientos, search, origenFilter]);

  return (
    <>
      <DesktopOnlyNotice module="Movimientos" />
      <div className="hidden sm:block">
        <ModuleFilters
          count={
            loading
              ? 'Cargando…'
              : `${filteredMovimientos.length} movimiento${filteredMovimientos.length !== 1 ? 's' : ''}`
          }
        >
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto, nota u OC…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Combobox
            value={origenFilter}
            onChange={(v) => setOrigenFilter((v as OrigenKey) ?? 'todos')}
            options={[
              { value: 'todos', label: 'Todos los orígenes' },
              { value: 'oc', label: 'Por compra (OC)' },
              { value: 'venta', label: 'Venta' },
              { value: 'manual', label: 'Manual' },
            ]}
            placeholder="Origen…"
            className="w-[180px]"
          />

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchMovimientos()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </ModuleFilters>

        {error && <ErrorBanner error={error} onRetry={() => void fetchMovimientos()} />}

        <ModuleContent>
          <DataTable<MovimientoRow>
            data={filteredMovimientos}
            columns={movimientoColumns}
            rowKey="id"
            loading={loading}
            initialSort={{ key: 'created_at', dir: 'desc' }}
            emptyTitle={search ? 'Ningún movimiento coincide' : 'Sin movimientos registrados'}
            emptyDescription={search ? 'Limpia la búsqueda para ver todo.' : undefined}
            showDensityToggle={false}
          />
        </ModuleContent>
      </div>
    </>
  );
}
