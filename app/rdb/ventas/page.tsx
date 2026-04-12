'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
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
import { Separator } from '@/components/ui/separator';
import { Search, RefreshCw, CalendarDays, ShoppingBag, Receipt } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Pedido = {
  id: number | string;
  order_id: string | null;
  timestamp: string | null;
  total_amount: number | null;
  status: string | null;
  place_name?: string | null;
  layout_name?: string | null;
  table_name?: string | null;
  external_delivery_id?: string | null;
  total_discount?: number | null;
  service_charge?: number | null;
  tax?: number | null;
  notes?: string | null;
  // lazy-loaded
  pagos?: Pago[];
  items?: PedidoItem[];
};

type Pago = {
  id: number | string;
  metodo?: string | null;
  monto?: number | null;
  payment_method?: string | null;
  amount?: number | null;
};

type PedidoItem = {
  id: number | string;
  nombre?: string | null;
  name?: string | null;
  product_name?: string | null;
  cantidad?: number | null;
  quantity?: number | null;
  precio?: number | null;
  price?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  subtotal?: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Matamoros';

function formatDate(ts: string | null) {
  if (!ts) return '—';
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [yyyy, mm, dd] = ts.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  
  const cleanTs = ts.replace(' ', 'T');
  const d = new Date(cleanTs);
  
  if (isNaN(d.getTime())) return ts;
  
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

function statusVariant(
  status: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'completado':
    case 'paid':
    case 'pagado':
      return 'default';
    case 'cancelled':
    case 'cancelado':
      return 'destructive';
    case 'pending':
    case 'pendiente':
      return 'secondary';
    default:
      return 'outline';
  }
}

// ─── Summary Stats ─────────────────────────────────────────────────────────────

function SummaryBar({ pedidos }: { pedidos: Pedido[] }) {
  const total = pedidos.reduce((acc, p) => acc + (p.total_amount ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" />
          Pedidos
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{pedidos.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total)}</div>
      </div>
    </div>
  );
}

// ─── Order Detail Drawer ────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function OrderDetail({
  pedido,
  loadingDetail,
  open,
  onClose,
}: {
  pedido: Pedido | null;
  loadingDetail: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!pedido) return null;

  const items = pedido.items ?? [];
  const pagos = pedido.pagos ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img src="/membrete-rdb.jpg" alt="Membrete Rincón del Bosque" className="hidden print:block w-full object-contain mb-6" />
        <SheetHeader>
          <SheetTitle>Pedido #{pedido.order_id ?? pedido.id}</SheetTitle>
          <SheetDescription>{formatDate(pedido.timestamp)}</SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            {/* Status + total */}
            <div className="flex items-center justify-between">
              <Badge variant={statusVariant(pedido.status)}>
                {pedido.status ?? 'Sin estado'}
              </Badge>
              <span className="text-lg font-semibold">{formatCurrency(pedido.total_amount)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mt-4">
              {pedido.place_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Ubicación</span>
                  <span className="font-medium">{pedido.place_name}</span>
                </div>
              )}
              {pedido.layout_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Área</span>
                  <span className="font-medium">{pedido.layout_name}</span>
                </div>
              )}
              {pedido.table_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Mesa</span>
                  <span className="font-medium">{pedido.table_name}</span>
                </div>
              )}
              {pedido.external_delivery_id && (
                <div>
                  <span className="text-muted-foreground block text-xs">Delivery ID</span>
                  <span className="font-medium">{pedido.external_delivery_id}</span>
                </div>
              )}
            </div>
            {(() => {
              const realDiscount = (pedido.total_amount ?? 0) - (pedido.total_discount ?? (pedido.total_amount ?? 0));
              const hasDiscount = realDiscount > 0.01;
              const hasService = (pedido.service_charge ?? 0) > 0;
              const hasTax = (pedido.tax ?? 0) > 0;
              
              if (!hasDiscount && !hasService && !hasTax) return null;
              
              return (
                <div className="bg-muted/30 rounded-lg p-3 mt-4 space-y-1 text-sm">
                  {hasDiscount && <div className="flex justify-between text-destructive"><span>Descuento</span><span>-{formatCurrency(realDiscount)}</span></div>}
                  {hasService && <div className="flex justify-between"><span>Servicio</span><span>{formatCurrency(pedido.service_charge)}</span></div>}
                  {hasTax && <div className="flex justify-between text-muted-foreground"><span>Impuestos</span><span>{pedido.tax}%</span></div>}
                </div>
              );
            })()}
            {pedido.notes && (
              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 p-3 rounded-lg text-sm">
                <span className="font-semibold block mb-1">Notas del Pedido</span>
                {pedido.notes}
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Productos
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin detalle de productos</p>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => {
                    const nombre = item.product_name ?? item.nombre ?? item.name ?? 'Producto';
                    const qty = item.cantidad ?? item.quantity ?? 1;
                    const price = item.unit_price ?? item.precio ?? item.price;
                    const sub = item.total_price ?? item.subtotal ?? (price != null ? price * qty : null);
                    return (
                      <div
                        key={String(item.id)}
                        className="flex items-start justify-between gap-4 text-sm"
                      >
                        <span className="text-foreground">{nombre}</span>
                        <span className="shrink-0 text-right text-muted-foreground">
                          {qty} × {price != null ? formatCurrency(price) : '—'}
                          <br />
                          <span className="font-medium text-foreground">
                            {sub != null ? formatCurrency(sub) : '—'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Payments */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagos
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin registros de pago</p>
              ) : (
                <div className="space-y-1.5">
                  {pagos.map((pago) => {
                    const metodo = pago.metodo ?? pago.payment_method ?? 'Desconocido';
                    const monto = pago.monto ?? pago.amount;
                    return (
                      <div
                        key={String(pago.id)}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="capitalize text-foreground">{metodo}</span>
                        <span className="font-medium">{formatCurrency(monto)}</span>
                      </div>
                    );
                  })}
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

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'completed', label: 'Completado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function VentasPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_ventas', preset);
    if (!preset) return;
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
    if (preset === 'hoy') {
      const t = formatter.format(today);
      setDateFrom(t); setDateTo(t);
    } else if (preset === 'ayer') {
      const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      ayer.setDate(ayer.getDate() - 1);
      const t = formatter.format(ayer);
      setDateFrom(t); setDateTo(t);
    } else if (preset === 'semana') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setDateFrom(formatter.format(monday)); setDateTo(formatter.format(today));
    } else if (preset === '7dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 7);
      setDateFrom(formatter.format(d)); setDateTo(formatter.format(today));
    } else if (preset === 'mes') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      setDateFrom(formatter.format(first)); setDateTo(formatter.format(today));
    } else if (preset === '30dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 30);
      setDateFrom(formatter.format(d)); setDateTo(formatter.format(today));
    } else if (preset === 'ano') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), 0, 1);
      setDateFrom(formatter.format(first)); setDateTo(formatter.format(today));
    }
  };
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_ventas');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

  const fetchPedidos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      let query = supabase
        .schema('rdb')
        .from('waitry_pedidos')
        .select('*')
        .order('timestamp', { ascending: false }).limit(10000)
        ;

      if (dateFrom) query = query.gte('timestamp', getLocalDayBoundsUtc(dateFrom, TZ).start);
      if (dateTo) query = query.lte('timestamp', getLocalDayBoundsUtc(dateTo, TZ).end);

      const { data, error: err } = await query;
      if (err) throw err;
      setPedidos(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchPedidos();
  }, [fetchPedidos]);

  const openDetail = async (pedido: Pedido) => {
    setSelected(pedido);
    setDrawerOpen(true);
    setLoadingDetail(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const [itemsRes, pagosRes] = await Promise.all([
        supabase
          .schema('rdb')
          .from('waitry_productos')
          .select('*')
          .eq('order_id', pedido.order_id)
          .limit(50),
        supabase
          .schema('rdb')
          .from('waitry_pagos')
          .select('*')
          .eq('order_id', pedido.order_id)
          .limit(20),
      ]);

      setSelected((prev) =>
        prev?.id === pedido.id
          ? { ...prev, items: itemsRes.data ?? [], pagos: pagosRes.data ?? [] }
          : prev,
      );
    } catch {
      // non-fatal
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = pedidos.filter((p) => {
    if (statusFilter !== 'all' && p.status?.toLowerCase() !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(p.order_id ?? '').toLowerCase().includes(q) ||
      String(p.id).toLowerCase().includes(q) ||
      (p.status ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <RequireAccess empresa="rdb" modulo="rdb.ventas">
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">Pedidos registrados en Waitry</p>
      </div>

      {/* Summary stats */}
      {!loading && !error && <SummaryBar pedidos={filtered} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio o estado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPresetKey('custom'); }}
            className="w-36"
            aria-label="Fecha desde"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPresetKey('custom'); }}
            className="w-36"
            aria-label="Fecha hasta"
          />
        </div>
        <Select value={presetKey} onValueChange={handlePreset}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Rango..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="ayer">Ayer</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="7dias">Últimos 7 días</SelectItem>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="30dias">Últimos 30 días</SelectItem>
            <SelectItem value="ano">Este año</SelectItem>
            <SelectItem value="custom" className="hidden">Personalizado</SelectItem>
          </SelectContent>
        </Select>


        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchPedidos()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} pedido${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha/Hora</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Mesa</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-muted-foreground"
                >
                  No se encontraron pedidos para el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((pedido) => (
                <TableRow
                  key={String(pedido.id)}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openDetail(pedido)}
                >
                  <TableCell className="font-mono text-xs font-medium">
                    #{pedido.order_id ?? pedido.id}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(pedido.timestamp)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pedido.layout_name || "-"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {pedido.table_name || "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(pedido.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(pedido.status)}>
                      {pedido.status ?? '—'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Order detail drawer */}
      <OrderDetail
        pedido={selected}
        loadingDetail={loadingDetail}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
    </RequireAccess>
  );
}
