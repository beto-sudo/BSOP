'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Search, RefreshCw, CalendarDays } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Pedido = {
  id: number | string;
  order_id: string | null;
  timestamp: string | null;
  total_amount: number | null;
  status: string | null;
  // joined
  pagos?: Pago[];
  items?: PedidoItem[];
};

type Pago = {
  id: number | string;
  metodo?: string | null;
  monto?: number | null;
  // fallback field names
  payment_method?: string | null;
  amount?: number | null;
};

type PedidoItem = {
  id: number | string;
  nombre?: string | null;
  name?: string | null;
  cantidad?: number | null;
  quantity?: number | null;
  precio?: number | null;
  price?: number | null;
  subtotal?: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Matamoros';

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatCurrency(amount: number | null) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  // midnight in Matamoros timezone ≈ UTC-6 / UTC-5 DST
  // Use ISO date string as lower bound, tomorrow as upper
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: `${today}T00:00:00`, to: `${today}T23:59:59` };
}

function statusVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
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

// ─── Order Detail Drawer ───────────────────────────────────────────────────────

function OrderDetail({ pedido, open, onClose }: { pedido: Pedido | null; open: boolean; onClose: () => void }) {
  if (!pedido) return null;

  const items = pedido.items ?? [];
  const pagos = pedido.pagos ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Pedido #{pedido.order_id ?? pedido.id}</SheetTitle>
          <SheetDescription>{formatDate(pedido.timestamp)}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status + total */}
          <div className="flex items-center justify-between">
            <Badge variant={statusVariant(pedido.status)}>
              {pedido.status ?? 'Sin estado'}
            </Badge>
            <span className="text-lg font-semibold">{formatCurrency(pedido.total_amount)}</span>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Productos
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin detalle de productos</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const nombre = item.nombre ?? item.name ?? 'Producto';
                  const qty = item.cantidad ?? item.quantity ?? 1;
                  const price = item.precio ?? item.price;
                  const sub = item.subtotal ?? (price != null ? price * qty : null);
                  return (
                    <div key={String(item.id)} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-foreground">{nombre}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {qty} × {price != null ? formatCurrency(price) : '—'} = {sub != null ? formatCurrency(sub) : '—'}
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pagos
            </div>
            {pagos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin registros de pago</p>
            ) : (
              <div className="space-y-1">
                {pagos.map((pago) => {
                  const metodo = pago.metodo ?? pago.payment_method ?? 'Desconocido';
                  const monto = pago.monto ?? pago.amount;
                  return (
                    <div key={String(pago.id)} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-foreground">{metodo}</span>
                      <span className="font-medium">{formatCurrency(monto ?? null)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VentasPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from.slice(0, 10));
  const [dateTo, setDateTo] = useState(() => todayRange().to.slice(0, 10));
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPedidos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      let query = supabase
        .schema('waitry')
        .from('pedidos')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (dateFrom) query = query.gte('timestamp', `${dateFrom}T00:00:00+00:00`);
      if (dateTo) query = query.lte('timestamp', `${dateTo}T23:59:59+00:00`);

      const { data, error: err } = await query;

      if (err) throw err;
      setPedidos(data ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar pedidos';
      setError(msg);
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

    // Lazy-load items + pagos when drawer opens
    try {
      const supabase = createSupabaseBrowserClient();

      const [itemsRes, pagosRes] = await Promise.all([
        supabase.schema('waitry').from('productos_pedido').select('*').eq('pedido_id', pedido.id).limit(50),
        supabase.schema('waitry').from('pagos').select('*').eq('pedido_id', pedido.id).limit(20),
      ]);

      setSelected((prev) =>
        prev?.id === pedido.id
          ? { ...prev, items: itemsRes.data ?? [], pagos: pagosRes.data ?? [] }
          : prev
      );
    } catch {
      // detail load failure is non-fatal
    }
  };

  const filtered = pedidos.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(p.order_id ?? '').toLowerCase().includes(q) ||
      String(p.id).toLowerCase().includes(q) ||
      (p.status ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">Pedidos registrados en Waitry</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio o estado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
            aria-label="Fecha desde"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
            aria-label="Fecha hasta"
          />
        </div>

        <Button variant="outline" size="icon" onClick={() => void fetchPedidos()} aria-label="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading ? 'Cargando…' : `${filtered.length} pedido${filtered.length !== 1 ? 's' : ''}`}
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
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden sm:table-cell">Método de Pago</TableHead>
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
                  <TableCell className="text-sm">{formatDate(pedido.timestamp)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(pedido.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(pedido.status)}>
                      {pedido.status ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {pedido.pagos?.map((p) => p.metodo ?? p.payment_method).filter(Boolean).join(', ') ?? '—'}
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
