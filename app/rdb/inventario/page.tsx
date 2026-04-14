'use client';

import { RequireAccess } from '@/components/require-access';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Plus,
  Printer,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = {
  id: string;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  stock_minimo: number | null;
  costo_unitario: number | null;
  ultimo_costo: number | null;
  inventariable: boolean;
  factor_consumo: number;
  total_entradas: number;
  total_vendido: number;
  total_mermas: number;
  stock_actual: number;
  valor_inventario: number | null;
  bajo_minimo: boolean;
};

type MovimientoRow = {
  id: string;
  producto_id: string;
  tipo_movimiento: string;
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
        .schema('erp')
        .from('movimientos_inventario')
        .select('id, producto_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, notas, created_at')
        .eq('empresa_id', RDB_EMPRESA_ID)
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
                  {Number(item.total_entradas).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Vendido</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                  {Number(item.total_vendido).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">Mermas</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-amber-500">
                  {Number(item.total_mermas).toFixed(2)}
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
                <div className="text-xs text-muted-foreground">Costo Unitario</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
                  {formatCurrency(item.costo_unitario ?? item.ultimo_costo)}
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
                            <div className="font-medium">{tipoLabel(mov.tipo_movimiento, mov.cantidad)}</div>
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
  const [productoPopoverOpen, setProductoPopoverOpen] = useState(false);
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
      const { data: almacen } = await supabase
        .schema('erp')
        .from('almacenes')
        .select('id')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .limit(1)
        .single();
      if (!almacen) throw new Error('No se encontró almacén');
      const { error } = await supabase
        .schema('erp')
        .from('movimientos_inventario')
        .insert({
          empresa_id: RDB_EMPRESA_ID,
          almacen_id: almacen.id,
          producto_id: productoId,
          tipo_movimiento: tipoDB,
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
            <Popover open={productoPopoverOpen} onOpenChange={setProductoPopoverOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" role="combobox"
                    aria-expanded={productoPopoverOpen}
                    className="w-full justify-between font-normal" />
                }
              >
                <span className="truncate">
                  {productoId
                    ? productos.find(p => p.id === productoId)?.nombre ?? 'Seleccionar…'
                    : <span className="text-muted-foreground">Seleccionar producto…</span>}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar producto…" />
                  <CommandList className="max-h-60">
                    <CommandEmpty>No se encontraron productos.</CommandEmpty>
                    <CommandGroup>
                      {productos
                        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                        .map(p => (
                          <CommandItem key={p.id} value={p.nombre}
                            onSelect={() => { setProductoId(p.id); setProductoPopoverOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 shrink-0 ${productoId === p.id ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="truncate">{p.nombre}</span>
                            {p.bajo_minimo && <span className="ml-auto text-xs text-amber-500 shrink-0">⚠ bajo mínimo</span>}
                            {p.categoria && !p.bajo_minimo && <span className="ml-auto text-xs text-muted-foreground shrink-0">{p.categoria}</span>}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
  const [fechaCorte, setFechaCorte] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('');

  const fetchStock = useCallback(async () => {
    setLoadingStock(true);
    setErrorStock(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .schema('erp')
        .from('v_inventario_stock')
        .select('*')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('nombre');
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (e: unknown) {
      setErrorStock(e instanceof Error ? e.message : 'Error al cargar inventario');
    } finally {
      setLoadingStock(false);
    }
  }, []);

  const fetchStockHistorico = useCallback(async (dateStr: string) => {
    setLoadingStock(true);
    setErrorStock(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Fin del día en UTC para la fecha seleccionada (sin conversión timezone)
      const p_fecha = `${dateStr}T23:59:59.999Z`;
      const { data, error } = await supabase
        .schema('erp')
        .rpc('fn_inventario_al_corte', { p_fecha });
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (e: unknown) {
      setErrorStock(e instanceof Error ? e.message : 'Error al cargar inventario histórico');
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
        .schema('erp')
        .from('movimientos_inventario')
        .select('id, producto_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, notas, created_at, productos(nombre)')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setMovimientos((data ?? []) as unknown as MovimientoRow[]);
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
    setCategoriaFiltro('');
  };

  const handleRefresh = () => {
    if (tab === 'stock') {
      if (fechaCorte) void fetchStockHistorico(fechaCorte);
      else void fetchStock();
    } else {
      void fetchMovimientos();
    }
  };

  const fechaLabel = fechaCorte
    ? new Date(fechaCorte + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const handlePrintLista = (stock: StockItem[]) => {
    const totalValor = stock.reduce((s, i) => s + Math.max(0, Number(i.valor_inventario) || 0), 0);
    const fecha = fechaLabel ?? new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

    // Solo productos con stock > 0 (excluir ceros y negativos del impreso — para contabilidad)
    const stockPositivo = stock.filter(i => Number(i.stock_actual) > 0);

    // Agrupar por categoría para el resumen final
    const catOrder = ['Licores','Bebidas','Alimentos','Consumibles','Artículos','Deportes','Propinas'];
    const catMap: Record<string, { count: number; valor: number }> = {};
    for (const item of stockPositivo) {
      const cat = item.categoria ?? 'Sin categoría';
      if (!catMap[cat]) catMap[cat] = { count: 0, valor: 0 };
      catMap[cat].count++;
      catMap[cat].valor += Number(item.valor_inventario) || 0;
    }
    const catEntries = [
      ...catOrder.filter(c => catMap[c]).map(c => [c, catMap[c]] as [string, {count:number;valor:number}]),
      ...Object.entries(catMap).filter(([c]) => !catOrder.includes(c)),
    ];

    const catRows = catEntries.map(([cat, s]) => `
      <tr>
        <td>${cat}</td>
        <td class="num">${s.count}</td>
        <td class="num">$${s.valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const rows = stockPositivo.map((item) => {
      const sinStock = item.stock_actual <= 0;
      const bajoMin = item.bajo_minimo;
      const estadoText = sinStock ? 'Sin stock' : bajoMin ? 'Bajo mínimo' : '✓';
      const estadoClass = sinStock ? 'estado-sin-stock' : bajoMin ? 'estado-bajo' : 'estado-ok';
      return `
      <tr>
        <td>${item.nombre}</td>
        <td>${item.categoria ?? '—'}</td>
        <td class="num ${sinStock ? 'rojo' : bajoMin ? 'naranja' : ''}">${item.stock_actual} ${item.unidad ?? 'pzs'}</td>
        <td class="num gris">${item.stock_minimo ?? '—'}</td>
        <td class="num">${item.costo_unitario != null ? '$' + Number(item.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
        <td class="num">${item.valor_inventario != null ? '$' + Number(item.valor_inventario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
        <td class="nowrap ${estadoClass}">${estadoText}</td>
      </tr>
    `}).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Inventario RDB — ${fecha}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }

    /* ── Membrete ──────────────────────────────────────────────── */
    .membrete { margin-bottom: 0; }
    .membrete img { width: 100%; height: auto; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-meta { font-size: 10px; color: #555; margin: 6px 0 14px; display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding-bottom: 6px; }

    /* ── Tabla principal ───────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; }
    th { font-weight: 700; text-align: left; padding: 5px 6px; border-bottom: 2px solid #1a1a2e; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #1a1a2e; background: #f5f5f8; }
    td { padding: 3.5px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafafa; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    .gris { color: #999; }
    .rojo { color: #dc2626; font-weight: 600; }
    .naranja { color: #d97706; font-weight: 600; }
    .estado-sin-stock { color: #dc2626; font-weight: 600; }
    .estado-bajo { color: #d97706; font-weight: 600; }
    .estado-ok { color: #16a34a; }

    /* ── Resumen por categoría (solo al final) ─────────────────── */
    .resumen-section { margin-top: 28px; page-break-inside: avoid; }
    .resumen-section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; margin-bottom: 8px; }
    .resumen-table { width: 340px; border-collapse: collapse; }
    .resumen-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #444; padding: 3px 8px; border-bottom: 1px solid #ccc; background: #f5f5f8; }
    .resumen-table td { padding: 3px 8px; border-bottom: 1px solid #eee; font-size: 10.5px; }
    .resumen-table tr:last-child td { border-bottom: none; }
    .resumen-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .resumen-total { margin-top: 6px; width: 340px; border-collapse: collapse; }
    .resumen-total td { padding: 5px 8px; font-size: 12px; font-weight: 800; color: #1a1a2e; border-top: 2px solid #1a1a2e; }
    .resumen-total .num { text-align: right; font-variant-numeric: tabular-nums; }

    @media print {
      body { padding: 12px 16px; }
      .membrete { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Membrete empresa -->
  <div class="membrete">
    <img src="/membrete-rdb.jpg" alt="Rincón del Bosque" />
  </div>
  <div class="doc-meta">
    <span>${fechaCorte ? `Inventario al Corte: <strong>${fecha}</strong>` : `Inventario de Stock &mdash; <strong>${fecha}</strong>`}</span>
    <span>${stockPositivo.length} productos registrados</span>
  </div>

  <!-- Tabla de inventario -->
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>Categoría</th>
        <th class="num">Stock</th>
        <th class="num">Mínimo</th>
        <th class="num">Costo Unit.</th>
        <th class="num">Valor Total</th>
        <th class="nowrap">Estado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Resumen por categoría — solo al final del documento -->
  <div class="resumen-section">
    <h2>Resumen por Categoría</h2>
    <table class="resumen-table">
      <thead>
        <tr>
          <th>Categoría</th>
          <th class="num">Productos</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>${catRows}</tbody>
    </table>
    <table class="resumen-total">
      <tr>
        <td>TOTAL INVENTARIO</td>
        <td class="num">$${totalValor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const handleSuccess = () => {
    void fetchStock();
    if (kardexLoaded) void fetchMovimientos();
  };

  const filteredStock = items.filter((i) => {
    if (showServicios && i.inventariable) return false;
    if (!showServicios && !i.inventariable) return false;
    if (showBajoMinimo && !i.bajo_minimo) return false;
    if (categoriaFiltro && i.categoria !== categoriaFiltro) return false;
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
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
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

      {/* KPI cards por categoría */}
      {tab === 'stock' && !loadingStock && !errorStock && (() => {
        const cats = ['Alimentos','Bebidas','Licores','Artículos','Deportes','Consumibles','Propinas'];
        type CatStat = { count: number; valor: number };
        const stats = cats.reduce<Record<string,CatStat>>((acc, c) => {
          acc[c] = { count: 0, valor: 0 };
          return acc;
        }, {});
        for (const item of filteredStock) {
          const c = item.categoria ?? 'Otros';
          if (!stats[c]) stats[c] = { count: 0, valor: 0 };
          stats[c].count++;
          stats[c].valor += Number(item.valor_inventario) || 0;
        }
        const sorted = Object.entries(stats)
          .filter(([, s]) => s.count > 0)
          .sort((a, b) => b[1].valor - a[1].valor);
        if (sorted.length === 0) return null;
        return (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {sorted.map(([cat, s]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaFiltro(categoriaFiltro === cat ? '' : cat)}
                className={[
                  'rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60',
                  categoriaFiltro === cat ? 'border-primary bg-primary/10' : 'bg-card',
                ].join(' ')}
              >
                <div className="text-xs font-medium text-muted-foreground truncate">{cat}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">
                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(s.valor)}
                </div>
                <div className="text-xs text-muted-foreground">{s.count} prod.</div>
              </button>
            ))}
          </div>
        );
      })()}

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

        {tab === 'stock' && (
          <Select value={categoriaFiltro} onValueChange={(v) => setCategoriaFiltro(v ?? '')}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              {['Alimentos','Bebidas','Licores','Artículos','Deportes','Consumibles','Propinas'].map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {tab === 'stock' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Al corte:</span>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={fechaCorte ?? ''}
              onChange={(e) => {
                if (!e.target.value) {
                  setFechaCorte(null);
                  void fetchStock();
                } else {
                  setFechaCorte(e.target.value);
                  void fetchStockHistorico(e.target.value);
                }
              }}
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {fechaCorte && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFechaCorte(null); void fetchStock(); }}
                className="text-xs h-7 px-2"
              >
                × Hoy
              </Button>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>

        {tab === 'stock' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrintLista(filteredStock)}
            className="gap-2"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir lista
          </Button>
        )}

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

      {/* Historical date banner */}
      {fechaCorte && tab === 'stock' && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-400">
          <span>📅</span>
          <span>Inventario al cierre del {fechaLabel} — solo movimientos hasta esa fecha</span>
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
                      {formatCurrency(item.costo_unitario ?? item.ultimo_costo)}
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
    </RequireAccess>
  );
}
