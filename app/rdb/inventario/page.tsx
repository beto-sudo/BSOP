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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = {
  id: string;
  waitry_item_id: number | null;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  stock_minimo: number | null;
  precio: number | null;
  ultimo_costo: number | null;
  inventariable: boolean;
  entradas: number;
  salidas: number;
  stock_actual: number;
  valor_inventario: number | null;
  bajo_minimo: boolean;
};

type MovimientoRow = {
  id: string;
  producto_id: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  costo_unitario: number | null;
  referencia_tipo: string | null;
  notas: string | null;
  created_at: string | null;
  productos: { nombre: string } | null;
};

type TipoUI = 'ajuste_positivo' | 'ajuste_negativo' | 'merma' | 'consumo_interno';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_OPTIONS: { value: TipoUI; label: string; desc: string }[] = [
  { value: 'ajuste_positivo', label: 'Ajuste Positivo', desc: 'Encontré algo perdido' },
  { value: 'ajuste_negativo', label: 'Ajuste Negativo', desc: 'Me faltan' },
  { value: 'merma', label: 'Merma', desc: 'Se rompió / echó a perder' },
  { value: 'consumo_interno', label: 'Consumo Interno', desc: 'Regalía, cortesía, evento interno' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapTipoToDb(
  tipo: TipoUI,
  cantidad: number,
): { tipoDB: string; cantidadSigned: number } {
  const abs = Math.abs(cantidad);
  switch (tipo) {
    case 'ajuste_positivo':
      return { tipoDB: 'ajuste', cantidadSigned: abs };
    case 'ajuste_negativo':
      return { tipoDB: 'ajuste', cantidadSigned: -abs };
    case 'merma':
      return { tipoDB: 'salida', cantidadSigned: -abs };
    case 'consumo_interno':
      return { tipoDB: 'salida', cantidadSigned: -abs };
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    timeZone: 'America/Matamoros',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function tipoLabel(tipo: string, cantidad: number): string {
  if (tipo === 'entrada') return 'Entrada';
  if (tipo === 'salida') return 'Salida';
  if (tipo === 'ajuste') return cantidad >= 0 ? 'Ajuste +' : 'Ajuste −';
  return tipo;
}

function tipoColorClass(tipo: string, cantidad: number): string {
  const isPositive = tipo === 'entrada' || (tipo === 'ajuste' && cantidad >= 0);
  return isPositive
    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
    : 'border-red-500/40 text-red-600 dark:text-red-400';
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ items }: { items: StockItem[] }) {
  const bajosMinimo = items.filter((i) => i.bajo_minimo).length;
  const sinStock = items.filter((i) => i.stock_actual <= 0).length;
  const totalValue = items.reduce((acc, curr) => acc + (curr.valor_inventario || 0), 0);
  return (
    <div className="grid grid-cols-4 gap-3">
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
          className={`mt-1 text-2xl font-semibold tabular-nums${bajosMinimo > 0 ? ' text-amber-500' : ''}`}
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
          className={`mt-1 text-2xl font-semibold tabular-nums${sinStock > 0 ? ' text-destructive' : ''}`}
        >
          {sinStock}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Valor Inventario
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalValue)}
        </div>
      </div>
    </div>
  );
}

// ─── Stock Detail Drawer ──────────────────────────────────────────────────────

function StockDetailDrawer({
  item,
  open,
  onClose,
}: {
  item: StockItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [kardex, setKardex] = useState<MovimientoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item) {
      setLoading(true);
      const supabase = createSupabaseBrowserClient();
      supabase
        .schema('rdb')
        .from('inventario_movimientos')
        .select('*')
        .eq('producto_id', item.id)
        .order('created_at', { ascending: false })
        .limit(500)
        .then(({ data, error }) => {
          if (!error && data) {
            setKardex(data as MovimientoRow[]);
          }
          setLoading(false);
        });
    } else {
      setKardex([]);
    }
  }, [open, item]);

  if (!item) return null;
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img src="/membrete-rdb.jpg" alt="Membrete Rincón del Bosque" className="hidden print:block w-full object-contain mb-6" />
        <SheetHeader>
          <SheetTitle>{item.nombre}</SheetTitle>
          <SheetDescription>
            {item.categoria ?? 'Sin categoría'} · {item.unidad ?? 'pieza'}
          </SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] print:h-auto" pr-4>
          <div className="mt-6 space-y-4 pb-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Entradas</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-600">
                  {item.entradas}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Salidas</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                  {item.salidas}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Stock Actual</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums${item.bajo_minimo ? ' text-amber-500' : ''}`}>
                  {item.stock_actual}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Stock Mínimo</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {item.stock_minimo ?? '—'}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Último Costo</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
                  {formatCurrency(item.ultimo_costo)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Valor del Stock</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                  {formatCurrency(item.valor_inventario)}
                </div>
              </div>
            </div>
            {item.bajo_minimo && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Stock por debajo del mínimo
              </div>
            )}
            <div className="mt-8">
              <h3 className="mb-4 text-sm font-medium">Historial de movimientos</h3>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : kardex.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay movimientos registrados.
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Fecha</TableHead>
                        <TableHead>Movimiento</TableHead>
                        <TableHead className="text-right">Cant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kardex.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(mov.created_at).split(',')[0]}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{tipoLabel(mov.tipo, mov.cantidad)}</div>
                            {mov.notas && <div className="text-xs text-muted-foreground truncate max-w-[120px]">{mov.notas}</div>}
                          </TableCell>
                          <TableCell className={["text-right font-medium tabular-nums", mov.cantidad > 0 ? "text-emerald-600" : "text-destructive"].join(" ")}>
                            {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Registrar Movimiento Dialog ──────────────────────────────────────────────

function RegistrarMovimientoDialog({
  open,
  onClose,
  productos,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  productos: StockItem[];
  onSuccess: () => void;
}) {
  const [productoId, setProductoId] = useState('');
  const [tipo, setTipo] = useState<TipoUI>('ajuste_positivo');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProductoId('');
      setTipo('ajuste_positivo');
      setCantidad('');
      setNotas('');
      setFormError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId) {
      setFormError('Selecciona un producto.');
      return;
    }
    const cantNum = parseFloat(cantidad);
    if (!cantidad || isNaN(cantNum) || cantNum <= 0) {
      setFormError('Ingresa una cantidad positiva mayor a cero.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { tipoDB, cantidadSigned } = mapTipoToDb(tipo, cantNum);
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .schema('rdb')
        .from('inventario_movimientos')
        .insert({
          producto_id: productoId,
          tipo: tipoDB,
          cantidad: cantidadSigned,
          referencia_tipo: 'ajuste_manual',
          notas: notas.trim() || null,
        });
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setFormError(
        e instanceof Error ? e.message : 'Error al registrar movimiento',
      );
    } finally {
      setSaving(false);
    }
  };

  const tipoSeleccionado = TIPO_OPTIONS.find((t) => t.value === tipo);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Movimiento</DialogTitle>
          <DialogDescription>Ajusta el inventario manualmente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Producto */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Producto</label>
            <Select value={productoId} onValueChange={(v) => setProductoId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar producto…" />
              </SelectTrigger>
              <SelectContent>
                {productos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                    {p.bajo_minimo ? ' ⚠' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo de movimiento</label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoUI)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoSeleccionado && (
              <p className="text-xs text-muted-foreground">{tipoSeleccionado.desc}</p>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cantidad</label>
            <Input
              type="number"
              min="0.01"
              step="any"
              placeholder="Ej. 3"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Notas / Motivo{' '}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              className="w-full min-h-[80px] resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ej. Se rompió vaso en evento"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'stock' | 'movimientos';

export default function InventarioPage() {
  // Stock state
  const [items, setItems] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [errorStock, setErrorStock] = useState<string | null>(null);

  // Movimientos (kardex) state
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [errorMovimientos, setErrorMovimientos] = useState<string | null>(null);
  const [kardexLoaded, setKardexLoaded] = useState(false);

  // UI state
  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');
  const [showServicios, setShowServicios] = useState(false);
  const [showBajoMinimo, setShowBajoMinimo] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchStock = useCallback(async () => {
    setLoadingStock(true);
    setErrorStock(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .schema('rdb')
        .from('v_stock_actual')
        .select('*')
        .order('nombre');
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (e: unknown) {
      setErrorStock(e instanceof Error ? e.message : 'Error al cargar inventario');
    } finally {
      setLoadingStock(false);
    }
  }, []);

  const fetchMovimientos = useCallback(async () => {
    setLoadingMovimientos(true);
    setErrorMovimientos(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .schema('rdb')
        .from('inventario_movimientos')
        .select('*, productos(nombre)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setMovimientos((data ?? []) as MovimientoRow[]);
      setKardexLoaded(true);
    } catch (e: unknown) {
      setErrorMovimientos(
        e instanceof Error ? e.message : 'Error al cargar movimientos',
      );
    } finally {
      setLoadingMovimientos(false);
    }
  }, []);

  useEffect(() => {
    void fetchStock();
  }, [fetchStock]);

  // Lazy-load kardex on first switch to movimientos tab
  useEffect(() => {
    if (tab === 'movimientos' && !kardexLoaded) {
      void fetchMovimientos();
    }
  }, [tab, kardexLoaded, fetchMovimientos]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setSearch('');
  };

  const handleRefresh = () => {
    if (tab === 'stock') {
      void fetchStock();
    } else {
      void fetchMovimientos();
    }
  };

  const handleSuccess = () => {
    void fetchStock();
    if (kardexLoaded) void fetchMovimientos();
  };

  const filteredStock = items.filter((i) => {
    if (i.inventariable === showServicios) return false; // i.inventariable is true for real products. We hide them if showServicios is true? No wait.
    // If showServicios is false, we want inventariable === true.
    // If showServicios is true, we want inventariable === false.
    if (showServicios && i.inventariable) return false;
    if (!showServicios && !i.inventariable) return false;
    if (showBajoMinimo && !i.bajo_minimo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.nombre.toLowerCase().includes(q) ||
      (i.categoria ?? '').toLowerCase().includes(q)
    );
  });

  const filteredMovimientos = movimientos.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.productos?.nombre ?? '').toLowerCase().includes(q) ||
      (m.notas ?? '').toLowerCase().includes(q)
    );
  });

  const isLoading = tab === 'stock' ? loadingStock : loadingMovimientos;
  const currentError = tab === 'stock' ? errorStock : errorMovimientos;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">Control de stock y movimientos</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar Movimiento
        </Button>
      </div>

      {/* Summary (stock tab only) */}
      {tab === 'stock' && !loadingStock && !errorStock && (
        <SummaryBar items={filteredStock} />
      )}

      {/* Tab toggle */}
      <div className="flex w-fit gap-1 rounded-lg border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => handleTabChange('stock')}
          className={[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'stock'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Boxes className="h-4 w-4" />
          Stock Actual
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('movimientos')}
          className={[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'movimientos'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <ClipboardList className="h-4 w-4" />
          Movimientos
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              tab === 'stock' ? 'Buscar producto…' : 'Buscar producto o nota…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {tab === 'stock' && (
          <Button
            variant={showServicios ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowServicios((v) => !v)}
            className="gap-2"
          >
            <Boxes className="h-3.5 w-3.5" />
            Ver no inventariables
          </Button>
        )}
        
        {tab === 'stock' && (
          <Button
            variant={showBajoMinimo ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowBajoMinimo((v) => !v)}
            className="gap-2"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Solo bajo mínimo
          </Button>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {isLoading
            ? 'Cargando…'
            : tab === 'stock'
            ? `${filteredStock.length} producto${filteredStock.length !== 1 ? 's' : ''}`
            : `${filteredMovimientos.length} movimiento${filteredMovimientos.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Error */}
      {currentError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {currentError}
        </div>
      )}

      {/* ── Stock Table ────────────────────────────────────────────────────── */}
      {tab === 'stock' && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock Actual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Último Costo</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingStock ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredStock.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No se encontraron productos.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStock.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedItem(item);
                      setDrawerOpen(true);
                    }}
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
                        item.stock_actual <= 0
                          ? 'text-destructive'
                          : item.bajo_minimo
                          ? 'text-amber-500'
                          : '',
                      ].join(' ')}
                    >
                      {item.stock_actual} {item.unidad ?? 'pzs'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {item.stock_minimo ?? '—'} {item.unidad ?? 'pzs'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.ultimo_costo)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(item.valor_inventario)}
                    </TableCell>
                    <TableCell>
                      {item.stock_actual <= 0 ? (
                        <Badge variant="destructive">Sin stock</Badge>
                      ) : item.bajo_minimo ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 text-amber-500"
                        >
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
      )}

      {/* ── Movimientos Table (Kardex) ─────────────────────────────────────── */}
      {tab === 'movimientos' && (
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
              {loadingMovimientos ? (
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
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No se encontraron movimientos.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovimientos.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(mov.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {mov.productos?.nombre ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {mov.tipo === 'entrada' ||
                        (mov.tipo === 'ajuste' && mov.cantidad >= 0) ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <Badge
                          variant="outline"
                          className={tipoColorClass(mov.tipo, mov.cantidad)}
                        >
                          {tipoLabel(mov.tipo, mov.cantidad)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell
                      className={[
                        'text-right font-semibold tabular-nums',
                        mov.cantidad > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-destructive',
                      ].join(' ')}
                    >
                      {mov.cantidad > 0 ? '+' : ''}
                      {mov.cantidad}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatCurrency(mov.costo_unitario)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">{mov.referencia_tipo === 'orden_compra' ? 'OC' : 'Manual'}</div>
                      <div className="truncate">{mov.notas ?? '—'}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Stock detail drawer */}
      <StockDetailDrawer
        item={selectedItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Registrar movimiento dialog */}
      <RegistrarMovimientoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        productos={items}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
