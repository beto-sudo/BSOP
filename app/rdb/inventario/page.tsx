'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Boxes, RefreshCw, Search, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = {
  id: string;
  waitry_item_id: number | null;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  stock_minimo: number | null;
  precio: number | null;
  stock_actual: number;
  bajo_minimo: boolean;
};

type Movimiento = {
  id: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  costo_unitario: number | null;
  referencia_tipo: string | null;
  notas: string | null;
  created_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    timeZone: 'America/Matamoros',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ items }: { items: StockItem[] }) {
  const bajosMinimo = items.filter((i) => i.bajo_minimo).length;
  const sinStock = items.filter((i) => i.stock_actual <= 0).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />
          Productos
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{items.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          Bajo mínimo
        </div>
        <div
          className={[
            'mt-1 text-2xl font-semibold tabular-nums',
            bajosMinimo > 0 ? 'text-amber-500' : '',
          ].join(' ')}
        >
          {bajosMinimo}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          Sin stock
        </div>
        <div
          className={[
            'mt-1 text-2xl font-semibold tabular-nums',
            sinStock > 0 ? 'text-destructive' : '',
          ].join(' ')}
        >
          {sinStock}
        </div>
      </div>
    </div>
  );
}

// ─── Movement History Drawer ──────────────────────────────────────────────────

function MovimientosSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function InventarioDetail({
  item,
  movimientos,
  loadingMovimientos,
  open,
  onClose,
}: {
  item: StockItem | null;
  movimientos: Movimiento[];
  loadingMovimientos: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{item.nombre}</SheetTitle>
          <SheetDescription>
            {item.categoria ?? 'Sin categoría'} · {item.unidad ?? 'pieza'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">
            {/* Stock summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Stock actual</div>
                <div
                  className={[
                    'mt-1 text-xl font-semibold tabular-nums',
                    item.bajo_minimo ? 'text-amber-500' : '',
                  ].join(' ')}
                >
                  {item.stock_actual} {item.unidad ?? 'pzs'}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Stock mínimo</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {item.stock_minimo ?? '—'} {item.unidad ?? 'pzs'}
                </div>
              </div>
            </div>

            {item.bajo_minimo && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Stock por debajo del mínimo
              </div>
            )}

            <Separator />

            {/* Movement history */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Movimientos recientes
              </div>
              {loadingMovimientos ? (
                <MovimientosSkeleton />
              ) : movimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos registrados</p>
              ) : (
                <div className="space-y-2">
                  {movimientos.map((mov) => (
                    <div
                      key={mov.id}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          {mov.tipo === 'entrada' ? (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          ) : mov.tipo === 'salida' ? (
                            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                          ) : (
                            <span className="h-3.5 w-3.5 text-muted-foreground">~</span>
                          )}
                          <span className="capitalize font-medium">{mov.tipo}</span>
                          {mov.referencia_tipo && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {mov.referencia_tipo.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                        {mov.notas && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{mov.notas}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDate(mov.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={[
                            'font-medium tabular-nums',
                            mov.tipo === 'entrada'
                              ? 'text-emerald-500'
                              : mov.tipo === 'salida'
                              ? 'text-destructive'
                              : '',
                          ].join(' ')}
                        >
                          {mov.tipo === 'salida' ? '-' : '+'}
                          {Math.abs(mov.cantidad)}
                        </span>
                        {mov.costo_unitario != null && (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(mov.costo_unitario)} / u
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventarioPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBajoMinimo, setShowBajoMinimo] = useState(false);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchInventario = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('rdb')
        .from('v_stock_actual')
        .select('*')
        .order('nombre');
      if (err) throw err;
      setItems(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInventario();
  }, [fetchInventario]);

  const openDetail = async (item: StockItem) => {
    setSelected(item);
    setDrawerOpen(true);
    setLoadingMovimientos(true);
    setMovimientos([]);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .schema('rdb')
        .from('inventario_movimientos')
        .select('*')
        .eq('producto_id', item.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setMovimientos(data ?? []);
    } catch {
      // non-fatal
    } finally {
      setLoadingMovimientos(false);
    }
  };

  const filtered = items.filter((i) => {
    if (showBajoMinimo && !i.bajo_minimo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.nombre.toLowerCase().includes(q) ||
      (i.categoria ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground">Stock actual por producto</p>
      </div>

      {/* Summary */}
      {!loading && !error && <SummaryBar items={filtered} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant={showBajoMinimo ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowBajoMinimo((v) => !v)}
          className="gap-2"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Solo bajo mínimo
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchInventario()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading ? 'Cargando…' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Stock Actual</TableHead>
              <TableHead className="text-right">Mínimo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No se encontraron productos.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openDetail(item)}
                >
                  <TableCell>
                    <span className="font-medium">{item.nombre}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.categoria ?? '—'}
                  </TableCell>
                  <TableCell
                    className={[
                      'text-right font-semibold tabular-nums',
                      item.bajo_minimo
                        ? item.stock_actual <= 0
                          ? 'text-destructive'
                          : 'text-amber-500'
                        : '',
                    ].join(' ')}
                  >
                    {item.stock_actual} {item.unidad ?? 'pzs'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {item.stock_minimo ?? '—'} {item.unidad ?? 'pzs'}
                  </TableCell>
                  <TableCell>
                    {item.stock_actual <= 0 ? (
                      <Badge variant="destructive">Sin stock</Badge>
                    ) : item.bajo_minimo ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-500">
                        Bajo mínimo
                      </Badge>
                    ) : (
                      <Badge variant="default">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail drawer */}
      <InventarioDetail
        item={selected}
        movimientos={movimientos}
        loadingMovimientos={loadingMovimientos}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
