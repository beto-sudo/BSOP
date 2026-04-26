'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleFilters, ModuleContent } from '@/components/module-page';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RDB_EMPRESA_ID, type MovimientoRow } from '@/components/inventario/types';
import {
  formatCurrency,
  formatDate,
  tipoColorClass,
  tipoLabel,
} from '@/components/inventario/utils';

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

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <ModuleContent>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
                <TableHead>Detalle / Referencia</TableHead>
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
              ) : filteredMovimientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No se encontraron movimientos.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovimientos.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(mov.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{mov.productos?.nombre ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {mov.tipo_movimiento === 'entrada' ||
                        (mov.tipo_movimiento === 'ajuste' && mov.cantidad >= 0) ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <Badge
                          variant="outline"
                          className={tipoColorClass(mov.tipo_movimiento, mov.cantidad)}
                        >
                          {tipoLabel(mov.tipo_movimiento, mov.cantidad)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell
                      className={[
                        'text-right font-semibold tabular-nums',
                        mov.tipo_movimiento === 'entrada' ||
                        (mov.tipo_movimiento === 'ajuste' && mov.cantidad >= 0)
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-destructive',
                      ].join(' ')}
                    >
                      {mov.tipo_movimiento === 'entrada' ||
                      (mov.tipo_movimiento === 'ajuste' && mov.cantidad >= 0)
                        ? '+'
                        : '−'}
                      {Math.abs(mov.cantidad)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatCurrency(mov.costo_unitario)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">
                        {mov.referencia_tipo === 'orden_compra' ? 'OC' : 'Manual'}
                      </div>
                      <div className="truncate">{mov.notas ?? '—'}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ModuleContent>
    </>
  );
}
