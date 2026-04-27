'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
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
import { RDB_EMPRESA_ID, type MovimientoRow } from '@/components/inventario/types';
import { tipoColorClass, tipoLabel } from '@/components/inventario/utils';
import { formatCurrency, formatDateTime } from '@/lib/format';

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
    key: 'detalle',
    label: 'Detalle / Referencia',
    sortable: false,
    cellClassName: 'max-w-[200px] truncate text-sm text-muted-foreground',
    render: (m) => (
      <>
        <div className="font-medium text-foreground">
          {m.referencia_tipo === 'orden_compra' ? 'OC' : 'Manual'}
        </div>
        <div className="truncate">{m.notas ?? '—'}</div>
      </>
    ),
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
 */
export default function InventarioMovimientosPage() {
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .schema('erp')
        .from('movimientos_inventario')
        .select(
          'id, producto_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, notas, created_at, productos(nombre)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false })
        .limit(300);
      if (queryError) throw queryError;
      setMovimientos((data ?? []) as unknown as MovimientoRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMovimientos();
  }, [fetchMovimientos]);

  const filteredMovimientos = movimientos.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.productos?.nombre ?? '').toLowerCase().includes(q) ||
      (m.notas ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <>
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
            placeholder="Buscar producto o nota…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

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
    </>
  );
}
