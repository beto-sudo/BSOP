'use client';

import { RequireAccess } from '@/components/require-access';
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
import { AlertTriangle, CalendarDays, RefreshCw, Search, Send, Truck } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string;
  nombre: string | null;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  direccion?: string | null;
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
  requisicion_id: string | null;
  proveedor_id: string | null;
  estatus: string | null;
  total_estimado: number | null;
  total_real: number | null;
  fecha_emision: string | null;
  notas: string | null;
  proveedor?: Proveedor | Proveedor[] | null;
  requisicion?: { folio: string | null } | { folio: string | null }[] | null;
  items?: OrdenCompraItem[];
};

const TZ = 'America/Matamoros';
const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(new Date(ts));
}

function formatDateLong(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'long' }).format(new Date(ts));
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function monthRange() {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return { from: formatter.format(first), to: formatter.format(today) };
}

function getProveedorObj(proveedor: OrdenCompra['proveedor']): Proveedor | null {
  if (Array.isArray(proveedor)) return proveedor[0] ?? null;
  return proveedor ?? null;
}

function getProveedorNombre(proveedor: OrdenCompra['proveedor']) {
  return getProveedorObj(proveedor)?.nombre ?? null;
}

function getRequisicionFolio(req: OrdenCompra['requisicion']) {
  if (Array.isArray(req)) return req[0]?.folio ?? null;
  return (req as { folio: string | null } | null)?.folio ?? null;
}

function getEstatusLabel(estatus: string | null, proveedorId: string | null) {
  const s = (estatus ?? '').toLowerCase();
  if (s === 'abierta') return proveedorId ? 'Lista' : 'Sin proveedor';
  if (s === 'enviada') return 'Enviada';
  if (s === 'parcial') return 'Recepción parcial';
  if (s === 'recibida') return 'Recibida';
  if (s === 'cancelada') return 'Cancelada';
  return estatus ?? 'Sin estatus';
}

function getBadgeVariant(
  estatus: string | null,
  proveedorId: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = (estatus ?? '').toLowerCase();
  if (s === 'recibida') return 'default';
  if (s === 'enviada') return 'secondary';
  if (s === 'cancelada') return 'destructive';
  if (s === 'abierta') return proveedorId ? 'secondary' : 'outline';
  return 'outline';
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ ordenes }: { ordenes: OrdenCompra[] }) {
  const sinProveedor = ordenes.filter(
    (o) => (o.estatus ?? '').toLowerCase() === 'abierta' && !o.proveedor_id,
  ).length;

  const activas = ordenes.filter((o) => {
    const s = (o.estatus ?? '').toLowerCase();
    return ['enviada', 'parcial', 'abierta'].includes(s);
  }).length;

  const total = ordenes.reduce(
    (acc, o) => acc + (o.total_real ?? o.total_estimado ?? 0),
    0,
  );

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
          Pendientes / activas
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{activas}</div>
        {sinProveedor > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" />
            {sinProveedor} sin proveedor asignado
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total valorizado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {total > 0 ? formatCurrency(total) : '—'}
        </div>
        {total === 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Captura precios en las OC abiertas
          </div>
        )}
      </div>
    </div>
  );
}

// ── OrdenDetail ───────────────────────────────────────────────────────────────

function OrdenDetail({
  orden,
  proveedores,
  loadingItems,
  open,
  editedReceipts,
  editedPrices,
  onClose,
  onReceiveChange,
  onPriceChange,
  onReceivePartial,
  onReceiveAll,
  onAsignarProveedor,
  onMarcarEnviada,
}: {
  orden: OrdenCompra | null;
  proveedores: Proveedor[];
  loadingItems: boolean;
  open: boolean;
  editedReceipts: Record<string, string>;
  editedPrices: Record<string, string>;
  onClose: () => void;
  onReceiveChange: (itemId: string, value: string, max: number) => void;
  onPriceChange: (itemId: string, value: string) => void;
  onReceivePartial: () => Promise<void>;
  onReceiveAll: () => Promise<void>;
  onAsignarProveedor: (proveedorId: string) => Promise<void>;
  onMarcarEnviada: () => Promise<void>;
}) {
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>('');

  useEffect(() => {
    setSelectedProveedorId(orden?.proveedor_id ?? '');
  }, [orden?.id, orden?.proveedor_id]);

  const items = orden?.items ?? [];
  const isAbierta = (orden?.estatus ?? '').toLowerCase() === 'abierta';
  const isRecibida = (orden?.estatus ?? '').toLowerCase() === 'recibida';
  const isCancelada = (orden?.estatus ?? '').toLowerCase() === 'cancelada';
  const canReceive = !isAbierta && !isRecibida && !isCancelada;

  const proveedorObj = getProveedorObj(orden?.proveedor ?? null);
  const reqFolio = getRequisicionFolio(orden?.requisicion ?? null);

  const hasPendingItems = items.some((item) => {
    const pedida = item.cantidad ?? 0;
    const recibida = Number(editedReceipts[item.id] ?? item.cantidad_recibida ?? 0);
    return recibida < pedida;
  });

  const printTotal = items.reduce((acc, item) => {
    const qty = item.cantidad ?? 0;
    const price = parseFloat(editedPrices[item.id] ?? String(item.precio_unitario ?? 0));
    return acc + qty * (isNaN(price) ? 0 : price);
  }, 0);

  const canPrint = Boolean(orden?.proveedor_id);

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="flex min-h-0 flex-col overflow-hidden p-6 print:p-0 sm:max-w-[700px]">

        {/* ═══ PRINT: Header block ═══ */}
        <div className="hidden print:block">
          <img
            src="/membrete-rdb.jpg"
            alt="Membrete Rincón del Bosque"
            className="mb-4 max-h-28 w-full object-contain"
          />
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-widest">Orden de Compra</h2>
              <p className="mt-1 text-base font-semibold">{orden?.folio ?? 'OC-BORRADOR'}</p>
              <p className="mt-0.5 text-sm text-gray-600">Fecha: {formatDateLong(orden?.fecha_emision)}</p>
              {reqFolio && (
                <p className="mt-0.5 text-sm text-gray-600">Ref. Requisición: {reqFolio}</p>
              )}
            </div>
            <div className="max-w-52 text-right text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider">Proveedor</div>
              <div className="font-semibold">{proveedorObj?.nombre ?? '—'}</div>
              {proveedorObj?.rfc && (
                <div className="text-gray-600">RFC: {proveedorObj.rfc}</div>
              )}
              {proveedorObj?.contacto && (
                <div className="text-gray-600">{proveedorObj.contacto}</div>
              )}
              {proveedorObj?.telefono && (
                <div className="text-gray-600">Tel: {proveedorObj.telefono}</div>
              )}
              {proveedorObj?.email && (
                <div className="text-gray-600">{proveedorObj.email}</div>
              )}
            </div>
          </div>
          <hr className="mb-4 border-black" />
        </div>

        {/* ═══ SCREEN: Header ═══ */}
        <SheetHeader className="print:hidden">
          <SheetTitle>{orden?.folio ?? 'Orden de compra'}</SheetTitle>
          <SheetDescription>
            {proveedorObj?.nombre ?? 'Sin proveedor'} · {formatDate(orden?.fecha_emision)}
            {reqFolio && ` · Req: ${reqFolio}`}
          </SheetDescription>
          <div className="absolute right-12 top-4 hidden items-center gap-2 sm:flex print:hidden">
            {!canPrint && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Asigna proveedor primero
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!canPrint}
            >
              Imprimir OC
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto print:overflow-visible">
          <div className="space-y-6 pb-6 pt-6 print:space-y-4 print:pt-0">

            {/* ── Screen: Status + meta ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
              <div className="space-y-1 text-sm">
                {reqFolio && (
                  <div>
                    <span className="text-muted-foreground">Requisición: </span>
                    <span className="font-mono font-medium">{reqFolio}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Fecha emisión: </span>
                  <span className="font-medium">{formatDate(orden?.fecha_emision)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={getBadgeVariant(orden?.estatus ?? null, orden?.proveedor_id ?? null)}>
                  {getEstatusLabel(orden?.estatus ?? null, orden?.proveedor_id ?? null)}
                </Badge>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">
                    Total:{' '}
                    <span className="font-medium text-foreground">
                      {(() => {
                        const t = orden?.total_real ?? orden?.total_estimado;
                        return t != null && t > 0 ? formatCurrency(t) : '—';
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Provider assignment (abierta only) ── */}
            {isAbierta && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 print:hidden">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Truck className="h-4 w-4 text-amber-600" />
                  Asignación de proveedor
                </div>
                <div className="flex gap-2">
                  <Select value={selectedProveedorId} onValueChange={(v) => setSelectedProveedorId(v ?? '')}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar proveedor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={
                      !selectedProveedorId || selectedProveedorId === orden?.proveedor_id
                    }
                    onClick={() => void onAsignarProveedor(selectedProveedorId)}
                  >
                    Asignar
                  </Button>
                </div>
                {!orden?.proveedor_id && (
                  <p className="text-xs text-amber-700">
                    Asigna un proveedor para poder imprimir o marcar esta OC como enviada.
                  </p>
                )}
              </div>
            )}

            <Separator className="print:hidden" />

            {/* ═══ Items (both screen and print) ═══ */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:hidden">
                Partidas
              </div>

              {loadingItems ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin artículos registrados.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border print:rounded-none print:border-black">
                  <Table className="print:text-xs">
                    <TableHeader>
                      <TableRow className="print:bg-gray-100">
                        <TableHead className="print:font-bold print:text-black">Artículo</TableHead>
                        <TableHead className="text-right print:font-bold print:text-black">
                          Cant.
                        </TableHead>
                        {isAbierta ? (
                          <TableHead className="text-right print:font-bold print:text-black">
                            P. Unitario
                          </TableHead>
                        ) : (
                          <>
                            <TableHead className="text-right print:font-bold print:text-black">
                              Recibida
                            </TableHead>
                            <TableHead className="text-right print:font-bold print:text-black">
                              P. Unitario
                            </TableHead>
                          </>
                        )}
                        <TableHead className="text-right print:font-bold print:text-black">
                          Subtotal
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const max = item.cantidad ?? 0;
                        const recValue =
                          editedReceipts[item.id] ?? String(item.cantidad_recibida ?? 0);
                        const priceValue =
                          editedPrices[item.id] ?? String(item.precio_unitario ?? '');
                        const priceNum = parseFloat(priceValue) || 0;
                        const displaySubtotal = isAbierta
                          ? max * priceNum
                          : (item.subtotal ?? 0);
                        return (
                          <TableRow key={item.id} className="print:border-b-gray-300">
                            <TableCell className="print:py-1">
                              <div className="font-medium print:text-black">
                                {item.descripcion ?? 'Sin descripción'}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums print:py-1 print:text-black">
                              {max}
                            </TableCell>

                            {isAbierta ? (
                              <TableCell className="text-right print:py-1">
                                {/* Screen: editable price input */}
                                <div className="flex justify-end print:hidden">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={priceValue}
                                    onChange={(e) => onPriceChange(item.id, e.target.value)}
                                    className="w-28 text-right tabular-nums"
                                    placeholder="0.00"
                                  />
                                </div>
                                {/* Print: price */}
                                <span className="hidden print:inline print:text-black">
                                  {priceNum > 0 ? formatCurrency(priceNum) : '—'}
                                </span>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell className="text-right print:py-1">
                                  <div className="flex justify-end print:hidden">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={String(max)}
                                      step="1"
                                      value={recValue}
                                      disabled={isRecibida}
                                      onChange={(e) =>
                                        onReceiveChange(item.id, e.target.value, max)
                                      }
                                      className="w-24 text-right tabular-nums"
                                    />
                                  </div>
                                  <span className="hidden print:inline print:text-black">
                                    {recValue}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground print:py-1 print:text-black">
                                  {formatCurrency(item.precio_unitario)}
                                </TableCell>
                              </>
                            )}

                            <TableCell className="text-right tabular-nums font-medium print:py-1 print:text-black">
                              {displaySubtotal > 0 ? formatCurrency(displaySubtotal) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Print: total row */}
              {items.length > 0 && (
                <div className="hidden justify-end pt-1 print:flex">
                  <div className="text-sm">
                    <span className="font-bold">Total estimado: </span>
                    <span className="tabular-nums">
                      {formatCurrency(
                        printTotal > 0 ? printTotal : (orden?.total_estimado ?? 0),
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ PRINT: Control / Authorization block ═══ */}
            <div className="hidden print:block">
              {orden?.notas && (
                <div className="mb-6 text-sm">
                  <div className="mb-1 font-bold">Notas:</div>
                  <div>{orden.notas}</div>
                </div>
              )}
              <div className="mt-12 grid grid-cols-3 gap-8 text-center text-xs">
                <div>
                  <div className="w-full border-t border-black pt-2 font-medium">Elaboró</div>
                </div>
                <div>
                  <div className="w-full border-t border-black pt-2 font-medium">Autorizó</div>
                </div>
                <div>
                  <div className="w-full border-t border-black pt-2 font-medium">
                    Proveedor / Recibido por
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* ── Footer actions (screen only) ── */}
        <div className="space-y-3 border-t pt-4 print:hidden">
          {isAbierta && orden?.proveedor_id && items.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => void onMarcarEnviada()}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Guardar precios y marcar Enviada
              </Button>
            </div>
          )}
          {canReceive && items.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {hasPendingItems && (
                <Button variant="outline" onClick={() => void onReceivePartial()}>
                  Recibir Parcialmente
                </Button>
              )}
              <Button onClick={() => void onReceiveAll()}>Recibir Todo</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => monthRange().from);
  const [dateTo, setDateTo] = useState(() => monthRange().to);
  const [presetKey, setPresetKey] = useState<string>('mes');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_ordenes_compra', preset);
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
    if (preset === 'hoy') {
      const t = formatter.format(today);
      setDateFrom(t);
      setDateTo(t);
    } else if (preset === 'ayer') {
      const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      ayer.setDate(ayer.getDate() - 1);
      const t = formatter.format(ayer);
      setDateFrom(t);
      setDateTo(t);
    } else if (preset === 'semana') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setDateFrom(formatter.format(monday));
      setDateTo(formatter.format(today));
    } else if (preset === '7dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 7);
      setDateFrom(formatter.format(d));
      setDateTo(formatter.format(today));
    } else if (preset === 'mes') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      setDateFrom(formatter.format(first));
      setDateTo(formatter.format(today));
    } else if (preset === '30dias') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      d.setDate(d.getDate() - 30);
      setDateFrom(formatter.format(d));
      setDateTo(formatter.format(today));
    } else if (preset === 'ano') {
      const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
      const first = new Date(d.getFullYear(), 0, 1);
      setDateFrom(formatter.format(first));
      setDateTo(formatter.format(today));
    }
  };

  const [selected, setSelected] = useState<OrdenCompra | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editedReceipts, setEditedReceipts] = useState<Record<string, string>>({});
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_ordenes_compra');
    if (saved && saved !== 'mes') {
      handlePreset(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .schema('erp')
        .from('ordenes_compra')
        .select(
          'id, codigo, requisicion_id, proveedor_id, total, autorizada_at, created_at, proveedor:proveedores!proveedor_id(id, persona:personas!persona_id(nombre, email, telefono, rfc)), requisicion:requisiciones!requisicion_id(codigo)',
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false });

      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      type RawOrden = { id: string; codigo: string | null; requisicion_id: string | null; proveedor_id: string | null; total: number | null; autorizada_at: string | null; created_at: string | null; proveedor: unknown; requisicion: unknown };
      const ordenesMapped: OrdenCompra[] = ((data ?? []) as unknown as RawOrden[]).map((o) => {
        const prov = o.proveedor as { id: string; persona: { nombre: string; email: string | null; telefono: string | null; rfc: string | null } | null } | null;
        const persona = prov?.persona ?? null;
        const proveedor: Proveedor | null = prov ? { id: prov.id, nombre: persona?.nombre ?? null, email: persona?.email ?? null, telefono: persona?.telefono ?? null, rfc: persona?.rfc ?? null } : null;
        const req = o.requisicion as { codigo: string | null } | null;
        return {
          id: o.id,
          folio: o.codigo ?? null,
          requisicion_id: o.requisicion_id ?? null,
          proveedor_id: o.proveedor_id ?? null,
          estatus: o.autorizada_at ? 'enviada' : 'abierta',
          total_estimado: o.total ?? null,
          total_real: o.total ?? null,
          fecha_emision: o.created_at ?? null,
          notas: null,
          proveedor,
          requisicion: req ? { folio: req.codigo } : null,
        };
      });
      setOrdenes(ordenesMapped);

      const { data: provRaw } = await supabase
        .schema('erp')
        .from('proveedores')
        .select('id, activo, persona:personas!persona_id(nombre, email, telefono, rfc)')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('activo', true);
      type RawProv = { id: string; persona: { nombre: string; email: string | null; telefono: string | null; rfc: string | null } | null };
      const provMapped: Proveedor[] = ((provRaw ?? []) as unknown as RawProv[]).map((p) => {
        const persona = p.persona ?? null;
        return { id: p.id, nombre: persona?.nombre ?? null, email: persona?.email ?? null, telefono: persona?.telefono ?? null, rfc: persona?.rfc ?? null };
      }).sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
      setProveedores(provMapped);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No pude cargar las órdenes de compra.',
      );
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
    setEditedPrices({});
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: itemsError } = await supabase
        .schema('erp')
        .from('ordenes_compra_detalle')
        .select('id, descripcion, cantidad, precio_unitario, subtotal')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('orden_compra_id', orden.id)
        .order('descripcion');

      if (itemsError) throw itemsError;

      const items = (data ?? []).map((item) => ({ ...item, cantidad_recibida: null })) as OrdenCompraItem[];
      const initialReceipts = items.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = String(item.cantidad_recibida ?? 0);
        return acc;
      }, {});
      const initialPrices = items.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] =
          item.precio_unitario != null && item.precio_unitario > 0
            ? String(item.precio_unitario)
            : '';
        return acc;
      }, {});

      setEditedReceipts(initialReceipts);
      setEditedPrices(initialPrices);
      setSelected((prev) => (prev?.id === orden.id ? { ...prev, items } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude cargar el detalle.');
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const handleReceiveChange = useCallback((itemId: string, value: string, max: number) => {
    const normalized =
      value === '' ? '' : String(Math.min(Math.max(Number(value) || 0, 0), max));
    setEditedReceipts((prev) => ({ ...prev, [itemId]: normalized }));
  }, []);

  const handlePriceChange = useCallback((itemId: string, value: string) => {
    setEditedPrices((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const persistReception = useCallback(
    async (markAll: boolean) => {
      if (!selected?.items?.length) return;
      setSaving(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const nextItems = selected.items.map((item) => {
          const cantidadPedida = item.cantidad ?? 0;
          const cantidadRecibida = markAll
            ? cantidadPedida
            : Math.min(
                Math.max(
                  Number(editedReceipts[item.id] ?? item.cantidad_recibida ?? 0),
                  0,
                ),
                cantidadPedida,
              );
          return { ...item, cantidad_recibida: cantidadRecibida };
        });

        const totalReal = nextItems.reduce(
          (acc, item) => acc + (item.cantidad ?? 0) * (item.precio_unitario ?? 0),
          0,
        );
        const nextStatus = 'Recibida';

        const { error: e2 } = await supabase
          .schema('erp')
          .from('ordenes_compra')
          .update({ total: totalReal })
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('id', selected.id);
        if (e2) throw e2;

        const updatedOrden: OrdenCompra = {
          ...selected,
          estatus: nextStatus,
          total_real: totalReal,
          items: nextItems,
        };
        setSelected(updatedOrden);
        setOrdenes((prev) =>
          prev.map((o) =>
            o.id === updatedOrden.id
              ? { ...o, estatus: nextStatus, total_real: totalReal }
              : o,
          ),
        );
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
    },
    [editedReceipts, selected],
  );

  const handleAsignarProveedor = useCallback(
    async (proveedorId: string) => {
      if (!selected?.id) return;
      setSaving(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: e } = await supabase
          .schema('erp')
          .from('ordenes_compra')
          .update({ proveedor_id: proveedorId })
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('id', selected.id);
        if (e) throw e;

        const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
        const updatedOrden = { ...selected, proveedor_id: proveedorId, proveedor };
        setSelected(updatedOrden);
        setOrdenes((prev) =>
          prev.map((o) =>
            o.id === selected.id ? { ...o, proveedor_id: proveedorId, proveedor } : o,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pude asignar el proveedor.');
      } finally {
        setSaving(false);
      }
    },
    [selected, proveedores],
  );

  const handleSavePricesAndMarkEnviada = useCallback(async () => {
    if (!selected?.items?.length) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      let totalEstimado = 0;

      for (const item of selected.items) {
        const price = parseFloat(editedPrices[item.id] ?? '') || 0;
        const subtotal = (item.cantidad ?? 0) * price;
        totalEstimado += subtotal;
        const { error: e } = await supabase
          .schema('erp')
          .from('ordenes_compra_detalle')
          .update({ precio_unitario: price, subtotal })
          .eq('id', item.id);
        if (e) throw e;
      }

      const { error: e2 } = await supabase
        .schema('erp')
        .from('ordenes_compra')
        .update({ total: totalEstimado })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', selected.id);
      if (e2) throw e2;

      const updatedItems = (selected.items ?? []).map((item) => ({
        ...item,
        precio_unitario: parseFloat(editedPrices[item.id] ?? '') || item.precio_unitario,
        subtotal: (item.cantidad ?? 0) * (parseFloat(editedPrices[item.id] ?? '') || 0),
      }));
      const updatedOrden = {
        ...selected,
        estatus: 'Enviada',
        total_estimado: totalEstimado,
        items: updatedItems,
      };
      setSelected(updatedOrden);
      setOrdenes((prev) =>
        prev.map((o) =>
          o.id === selected.id
            ? { ...o, estatus: 'Enviada', total_estimado: totalEstimado }
            : o,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude guardar los precios.');
    } finally {
      setSaving(false);
    }
  }, [selected, editedPrices]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ordenes.filter((orden) => {
      if (!query) return true;
      const reqFolio = getRequisicionFolio(orden.requisicion);
      return (
        (orden.folio ?? '').toLowerCase().includes(query) ||
        (getProveedorNombre(orden.proveedor) ?? '').toLowerCase().includes(query) ||
        (orden.estatus ?? '').toLowerCase().includes(query) ||
        (reqFolio ?? '').toLowerCase().includes(query)
      );
    });
  }, [ordenes, search]);

  return (
    <RequireAccess empresa="rdb" modulo="rdb.ordenes_compra">
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes de Compra</h1>
          <p className="text-sm text-muted-foreground">
            Gestión operativa de compras a proveedores
          </p>
        </div>
      </div>

      {!loading && !error ? <SummaryBar ordenes={filtered} /> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio, proveedor o requisición…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPresetKey('custom');
            }}
            className="w-36"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPresetKey('custom');
            }}
            className="w-36"
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
            <SelectItem value="custom" className="hidden">
              Personalizado
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchOrdenes()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} orden${filtered.length === 1 ? '' : 'es'}`}
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
              <TableHead>OC / Folio</TableHead>
              <TableHead>Requisición</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
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
              filtered.map((orden) => {
                const reqFolio = getRequisicionFolio(orden.requisicion);
                const nombre = getProveedorNombre(orden.proveedor);
                const total = orden.total_real ?? orden.total_estimado;
                return (
                  <TableRow
                    key={orden.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => void openDetail(orden)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {orden.folio ?? '—'}
                    </TableCell>
                    <TableCell>
                      {reqFolio ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {reqFolio}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {nombre ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          {nombre}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Sin proveedor
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getBadgeVariant(orden.estatus, orden.proveedor_id)}
                      >
                        {getEstatusLabel(orden.estatus, orden.proveedor_id)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(orden.fecha_emision)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {total != null && total > 0 ? (
                        formatCurrency(total)
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Sin precios</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <OrdenDetail
        orden={selected}
        proveedores={proveedores}
        loadingItems={loadingItems}
        open={drawerOpen}
        editedReceipts={editedReceipts}
        editedPrices={editedPrices}
        onClose={() => setDrawerOpen(false)}
        onReceiveChange={handleReceiveChange}
        onPriceChange={handlePriceChange}
        onReceivePartial={async () => {
          await persistReception(false);
        }}
        onReceiveAll={async () => {
          await persistReception(true);
        }}
        onAsignarProveedor={handleAsignarProveedor}
        onMarcarEnviada={handleSavePricesAndMarkEnviada}
      />
    </div>
    </RequireAccess>
  );
}
