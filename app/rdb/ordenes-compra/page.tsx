'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, PackagePlus, RefreshCw, Search, Truck } from 'lucide-react';

type EstatusOc = 'Enviada' | 'Parcial' | 'Recibida' | 'Cancelada' | string;

type Proveedor = {
  nombre: string | null;
};

type OrdenCompraItem = {
  id: string;
  descripcion: string | null;
  cantidad: number | null;
  cantidad_recibida: number | null;
  precio_unitario: number | null;
  subtotal: number | null;
};

type OrdenCompra = {
  id: string;
  folio: string | null;
  proveedor_id: string | null;
  estatus: EstatusOc | null;
  total_estimado: number | null;
  total_real: number | null;
  fecha_emision: string | null;
  proveedor?: Proveedor | Proveedor[] | null;
  items?: OrdenCompraItem[];
};

const TZ = 'America/Matamoros';

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    dateStyle: 'short',
  }).format(new Date(ts));
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

function getProveedorNombre(proveedor: OrdenCompra['proveedor']) {
  if (Array.isArray(proveedor)) return proveedor[0]?.nombre ?? 'Proveedor no asignado';
  return proveedor?.nombre ?? 'Proveedor no asignado';
}

function getBadgeVariant(estatus: EstatusOc | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch ((estatus ?? '').toLowerCase()) {
    case 'recibida':
      return 'default';
    case 'enviada':
      return 'secondary';
    case 'cancelada':
      return 'destructive';
    case 'parcial':
    default:
      return 'outline';
  }
}

function SummaryBar({ ordenes }: { ordenes: OrdenCompra[] }) {
  const activas = ordenes.filter((orden) => {
    const status = (orden.estatus ?? '').toLowerCase();
    return status === 'enviada' || status === 'parcial';
  }).length;

  const total = ordenes.reduce((acc, orden) => acc + (orden.total_real ?? orden.total_estimado ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Órdenes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{ordenes.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Abiertas / parciales
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{activas}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total)}</div>
      </div>
    </div>
  );
}

function OrdenDetail({
  orden,
  loadingItems,
  open,
  editedReceipts,
  onClose,
  onReceiveChange,
  onReceivePartial,
  onReceiveAll,
}: {
  orden: OrdenCompra | null;
  loadingItems: boolean;
  open: boolean;
  editedReceipts: Record<string, string>;
  onClose: () => void;
  onReceiveChange: (itemId: string, value: string, max: number) => void;
  onReceivePartial: () => Promise<void>;
  onReceiveAll: () => Promise<void>;
}) {
  const items = orden?.items ?? [];

  const hasPendingItems = items.some((item) => {
    const pedida = item.cantidad ?? 0;
    const recibida = Number(editedReceipts[item.id] ?? item.cantidad_recibida ?? 0);
    return recibida < pedida;
  });

  const canEdit = (orden?.estatus ?? '').toLowerCase() !== 'recibida';

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img src="/membrete-rdb.jpg" alt="Membrete Rincón del Bosque" className="hidden print:block w-full object-contain mb-6" />
        <SheetHeader>
          <SheetTitle>{orden?.folio ?? 'Orden de compra'}</SheetTitle>
          <SheetDescription>
            {getProveedorNombre(orden?.proveedor ?? null)} · {formatDate(orden?.fecha_emision)}
          </SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="space-y-6 pb-6 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Proveedor: </span>
                  <span className="font-medium">{getProveedorNombre(orden?.proveedor ?? null)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha: </span>
                  <span className="font-medium">{formatDate(orden?.fecha_emision)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={getBadgeVariant(orden?.estatus ?? null)}>{orden?.estatus ?? 'Sin estatus'}</Badge>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Estimado: <span className="font-medium text-foreground">{formatCurrency(orden?.total_estimado)}</span></div>
                  <div className="text-muted-foreground">Real: <span className="font-medium text-foreground">{formatCurrency(orden?.total_real)}</span></div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Partidas
              </div>

              {loadingItems ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin artículos registrados.</p>
              ) : (
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead className="text-right">Pedida</TableHead>
                        <TableHead className="text-right">Recibida</TableHead>
                        <TableHead className="text-right">P. Unitario</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const max = item.cantidad ?? 0;
                        const value = editedReceipts[item.id] ?? String(item.cantidad_recibida ?? 0);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">{item.descripcion ?? 'Sin descripción'}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{max}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end">
                                <Input
                                  type="number"
                                  min="0"
                                  max={String(max)}
                                  step="1"
                                  value={value}
                                  disabled={!canEdit}
                                  onChange={(event) => onReceiveChange(item.id, event.target.value, max)}
                                  className="w-24 text-right tabular-nums"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatCurrency(item.precio_unitario)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatCurrency(item.subtotal)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {canEdit && items.length > 0 ? (
          <div className="border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {hasPendingItems ? (
                <Button variant="outline" onClick={() => void onReceivePartial()}>
                  Recibir Parcialmente
                </Button>
              ) : null}
              <Button onClick={() => void onReceiveAll()}>Recibir Todo</Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_ordenes_compra', preset);
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
  const [selected, setSelected] = useState<OrdenCompra | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editedReceipts, setEditedReceipts] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_ordenes_compra');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .schema('rdb')
        .from('ordenes_compra')
        .select('id, folio, proveedor_id, estatus, total_estimado, total_real, fecha_emision, proveedor:proveedores(nombre)')
        .order('fecha_emision', { ascending: false });

      if (dateFrom) query = query.gte('fecha_emision', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('fecha_emision', `${dateTo}T23:59:59`);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      setOrdenes((data ?? []) as OrdenCompra[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude cargar las órdenes de compra.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchOrdenes();
  }, [fetchOrdenes]);

  const openDetail = useCallback(async (orden: OrdenCompra) => {
    setSelected(orden);
    setDrawerOpen(true);
    setLoadingItems(true);
    setEditedReceipts({});

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: itemsError } = await supabase
        .schema('rdb')
        .from('ordenes_compra_items')
        .select('id, descripcion, cantidad, cantidad_recibida, precio_unitario, subtotal')
        .eq('orden_id', orden.id)
        .order('descripcion');

      if (itemsError) throw itemsError;

      const items = (data ?? []) as OrdenCompraItem[];
      const initialReceipts = items.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = String(item.cantidad_recibida ?? 0);
        return acc;
      }, {});

      setEditedReceipts(initialReceipts);
      setSelected((prev) => (prev?.id === orden.id ? { ...prev, items } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude cargar el detalle de la orden.');
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const handleReceiveChange = useCallback((itemId: string, value: string, max: number) => {
    const normalized = value === '' ? '' : String(Math.min(Math.max(Number(value) || 0, 0), max));
    setEditedReceipts((prev) => ({ ...prev, [itemId]: normalized }));
  }, []);

  const persistReception = useCallback(async (markAll: boolean) => {
    if (!selected?.items?.length) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const nextItems = selected.items.map((item) => {
        const cantidadPedida = item.cantidad ?? 0;
        const cantidadRecibida = markAll
          ? cantidadPedida
          : Math.min(Math.max(Number(editedReceipts[item.id] ?? item.cantidad_recibida ?? 0), 0), cantidadPedida);

        return {
          ...item,
          cantidad_recibida: cantidadRecibida,
        };
      });

      for (const item of nextItems) {
        const { error: updateItemError } = await supabase
          .schema('rdb')
          .from('ordenes_compra_items')
          .update({ cantidad_recibida: item.cantidad_recibida })
          .eq('id', item.id);

        if (updateItemError) throw updateItemError;
      }

      const fullyReceived = nextItems.every((item) => (item.cantidad_recibida ?? 0) >= (item.cantidad ?? 0));
      const partiallyReceived = nextItems.some((item) => (item.cantidad_recibida ?? 0) > 0);
      const nextStatus = fullyReceived ? 'Recibida' : partiallyReceived ? 'Parcial' : 'Enviada';
      const totalReal = nextItems.reduce((acc, item) => {
        const qty = item.cantidad_recibida ?? 0;
        const price = item.precio_unitario ?? 0;
        return acc + qty * price;
      }, 0);

      const { error: updateOrderError } = await supabase
        .schema('rdb')
        .from('ordenes_compra')
        .update({
          estatus: nextStatus,
          total_real: totalReal,
        })
        .eq('id', selected.id);

      if (updateOrderError) throw updateOrderError;

      const updatedOrden: OrdenCompra = {
        ...selected,
        estatus: nextStatus,
        total_real: totalReal,
        items: nextItems,
      };

      setSelected(updatedOrden);
      setOrdenes((prev) => prev.map((orden) => (orden.id === updatedOrden.id ? { ...orden, estatus: nextStatus, total_real: totalReal } : orden)));
      setEditedReceipts(
        nextItems.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = String(item.cantidad_recibida ?? 0);
          return acc;
        }, {}),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude guardar la recepción.');
    } finally {
      setSaving(false);
    }
  }, [editedReceipts, selected]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ordenes.filter((orden) => {
      if (!query) return true;
      return (
        (orden.folio ?? '').toLowerCase().includes(query) ||
        getProveedorNombre(orden.proveedor).toLowerCase().includes(query) ||
        (orden.estatus ?? '').toLowerCase().includes(query)
      );
    });
  }, [ordenes, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes de Compra</h1>
          <p className="text-sm text-muted-foreground">Control y recepción parcial de compras a proveedores</p>
        </div>
        <Button className="gap-2 self-start">
          <PackagePlus className="h-4 w-4" />
          Nueva Orden de Compra
        </Button>
      </div>

      {!loading && !error ? <SummaryBar ordenes={filtered} /> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio o proveedor…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPresetKey('custom'); }} className="w-36" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPresetKey('custom'); }} className="w-36" />
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

        <Button variant="outline" size="icon" onClick={() => void fetchOrdenes()} aria-label="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading ? 'Cargando…' : `${filtered.length} orden${filtered.length === 1 ? '' : 'es'}`}
          {saving ? ' · guardando…' : ''}
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Fecha Emisión</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 5 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
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
                  <TableCell className="font-mono text-xs font-medium">{orden.folio ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                      {getProveedorNombre(orden.proveedor)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getBadgeVariant(orden.estatus)}>{orden.estatus ?? 'Sin estatus'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(orden.fecha_emision)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(orden.total_real ?? orden.total_estimado)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <OrdenDetail
        orden={selected}
        loadingItems={loadingItems}
        open={drawerOpen}
        editedReceipts={editedReceipts}
        onClose={() => setDrawerOpen(false)}
        onReceiveChange={handleReceiveChange}
        onReceivePartial={async () => {
          await persistReception(false);
        }}
        onReceiveAll={async () => {
          await persistReception(true);
        }}
      />
    </div>
  );
}
