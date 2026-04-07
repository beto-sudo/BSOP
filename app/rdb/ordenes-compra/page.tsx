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
import { CalendarDays, FileText, RefreshCw, Search, Truck } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrdenCompra = {
  id: string;
  folio: string;
  requisicion_id: string | null;
  proveedor_id: string | null;
  estatus: 'abierta' | 'parcial' | 'recibida' | 'cancelada';
  total_estimado: number | null;
  total_real: number | null;
  fecha_emision: string | null;
  fecha_recepcion: string | null;
  notas: string | null;
  created_at: string | null;
  // lazy-loaded
  items?: OcItem[];
  proveedor?: { nombre: string } | null;
};

type OcItem = {
  id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  cantidad_recibida: number | null;
  precio_unitario: number | null;
  subtotal: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Matamoros';

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function todayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

type EstatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const ESTATUS_VARIANT: Record<OrdenCompra['estatus'], EstatusVariant> = {
  abierta: 'secondary',
  parcial: 'outline',
  recibida: 'default',
  cancelada: 'destructive',
};

const ESTATUS_LABELS: Record<OrdenCompra['estatus'], string> = {
  abierta: 'Abierta',
  parcial: 'Parcial',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'abierta', label: 'Abierta' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'recibida', label: 'Recibida' },
  { value: 'cancelada', label: 'Cancelada' },
];

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ ordenes }: { ordenes: OrdenCompra[] }) {
  const abiertas = ordenes.filter((o) => ['abierta', 'parcial'].includes(o.estatus)).length;
  const totalEstimado = ordenes.reduce((acc, o) => acc + (o.total_estimado ?? 0), 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Órdenes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{ordenes.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          En proceso
        </div>
        <div
          className={[
            'mt-1 text-2xl font-semibold tabular-nums',
            abiertas > 0 ? 'text-amber-500' : '',
          ].join(' ')}
        >
          {abiertas}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total estimado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalEstimado)}
        </div>
      </div>
    </div>
  );
}

// ─── OC Detail Drawer ─────────────────────────────────────────────────────────

function OcDetail({
  orden,
  loadingItems,
  open,
  onClose,
}: {
  orden: OrdenCompra | null;
  loadingItems: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!orden) return null;
  const items = orden.items ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{orden.folio}</SheetTitle>
          <SheetDescription>
            {orden.proveedor?.nombre ?? 'Proveedor no asignado'} · {formatDate(orden.fecha_emision)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">
            {/* Status + totals */}
            <div className="flex items-center justify-between">
              <Badge variant={ESTATUS_VARIANT[orden.estatus]}>
                {ESTATUS_LABELS[orden.estatus]}
              </Badge>
              <div className="text-right text-sm">
                <div className="text-muted-foreground">
                  Estimado:{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(orden.total_estimado)}
                  </span>
                </div>
                {orden.total_real != null && (
                  <div className="text-muted-foreground">
                    Real:{' '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(orden.total_real)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {orden.fecha_recepcion && (
              <div className="text-sm text-muted-foreground">
                Recibido: {formatDate(orden.fecha_recepcion)}
              </div>
            )}

            {orden.notas && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                {orden.notas}
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artículos
              </div>
              {loadingItems ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin artículos registrados</p>
              ) : (
                <div className="space-y-3">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Descripción</span>
                    <span className="text-right">Cant.</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm"
                    >
                      <div>
                        <div className="text-foreground">{item.descripcion}</div>
                        {item.precio_unitario != null && (
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(item.precio_unitario)} / u
                          </div>
                        )}
                      </div>
                      <div className="text-right tabular-nums text-muted-foreground">
                        {item.cantidad}
                        {item.cantidad_recibida != null &&
                          item.cantidad_recibida < item.cantidad && (
                            <div className="text-xs text-amber-500">
                              Rec: {item.cantidad_recibida}
                            </div>
                          )}
                      </div>
                      <div className="text-right font-medium tabular-nums">
                        {formatCurrency(item.subtotal)}
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

export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    // Default to current month
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
    const today = formatter.format(now);
    return today.substring(0, 8) + '01';
  });
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [selected, setSelected] = useState<OrdenCompra | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .schema('rdb')
        .from('ordenes_compra')
        .select('*, proveedor:proveedores(nombre)')
        .order('fecha_emision', { ascending: false })
        .limit(200);

      if (dateFrom) query = query.gte('fecha_emision', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('fecha_emision', `${dateTo}T23:59:59`);

      const { data, error: err } = await query;
      if (err) throw err;
      setOrdenes(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar órdenes de compra');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchOrdenes();
  }, [fetchOrdenes]);

  const openDetail = async (orden: OrdenCompra) => {
    setSelected(orden);
    setDrawerOpen(true);
    setLoadingItems(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .schema('rdb')
        .from('ordenes_compra_items')
        .select('*')
        .eq('orden_id', orden.id);
      setSelected((prev) =>
        prev?.id === orden.id ? { ...prev, items: data ?? [] } : prev,
      );
    } catch {
      // non-fatal
    } finally {
      setLoadingItems(false);
    }
  };

  const filtered = ordenes.filter((o) => {
    if (statusFilter !== 'all' && o.estatus !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.folio.toLowerCase().includes(q) ||
      (o.proveedor?.nombre ?? '').toLowerCase().includes(q) ||
      (o.notas ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Órdenes de Compra</h1>
        <p className="text-sm text-muted-foreground">Compras a proveedores</p>
      </div>

      {/* Summary */}
      {!loading && !error && <SummaryBar ordenes={filtered} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-44">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
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

        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchOrdenes()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading ? 'Cargando…' : `${filtered.length} orden${filtered.length !== 1 ? 'es' : ''}`}
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
              <TableHead>Folio</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead className="text-right">Estimado</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No se encontraron órdenes de compra.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((orden) => (
                <TableRow
                  key={orden.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openDetail(orden)}
                >
                  <TableCell className="font-mono text-xs font-medium">{orden.folio}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {orden.proveedor?.nombre ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(orden.fecha_emision)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {formatCurrency(orden.total_estimado)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(orden.total_real)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ESTATUS_VARIANT[orden.estatus]}>
                      {ESTATUS_LABELS[orden.estatus]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail drawer */}
      <OcDetail
        orden={selected}
        loadingItems={loadingItems}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
