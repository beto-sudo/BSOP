'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing data-sync pattern flagged by the new React
 * hook rule. Rewriting changes render semantics — out of scope for lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { DataTable, type Column } from '@/components/module-page';
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
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { usePermissions } from '@/components/providers';
import {
  AlertTriangle,
  CalendarDays,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Truck,
  X,
} from 'lucide-react';

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
  cantidad_cancelada: number | null;
  precio_unitario: number | null;
  precio_real: number | null;
  subtotal: number | null;
  motivo_cancelacion: string | null;
};

type OrdenCompra = {
  id: string;
  folio: string | null;
  requisicion_id: string | null;
  proveedor_id: string | null;
  estatus: string | null;
  total_estimado: number | null;
  total_real: number | null;
  total_a_pagar: number | null;
  cerrada_at: string | null;
  fecha_emision: string | null;
  notas: string | null;
  proveedor?: Proveedor | Proveedor[] | null;
  requisicion?: { folio: string | null } | { folio: string | null }[] | null;
  items?: OrdenCompraItem[];
};

const TZ = 'America/Matamoros';
const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

const ordenColumns: Column<OrdenCompra>[] = [
  {
    key: 'folio',
    label: 'OC / Folio',
    cellClassName: 'font-mono text-xs font-medium',
    render: (o) => o.folio ?? '—',
  },
  {
    key: 'requisicion_folio',
    label: 'Requisición',
    accessor: (o) => getRequisicionFolio(o.requisicion) ?? '',
    render: (o) => {
      const f = getRequisicionFolio(o.requisicion);
      return f ? (
        <span className="font-mono text-xs text-muted-foreground">{f}</span>
      ) : (
        <span className="text-xs text-muted-foreground/40">—</span>
      );
    },
  },
  {
    key: 'proveedor_nombre',
    label: 'Proveedor',
    accessor: (o) => getProveedorNombre(o.proveedor) ?? '',
    render: (o) => {
      const nombre = getProveedorNombre(o.proveedor);
      return nombre ? (
        <div className="flex items-center gap-2 text-sm">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          {nombre}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          Sin proveedor
        </div>
      );
    },
  },
  {
    key: 'estatus',
    label: 'Estatus',
    render: (o) => (
      <Badge variant={getBadgeVariant(o.estatus, o.proveedor_id)}>
        {getEstatusLabel(o.estatus, o.proveedor_id)}
      </Badge>
    ),
  },
  {
    key: 'fecha_emision',
    label: 'Fecha',
    cellClassName: 'text-sm text-muted-foreground',
    render: (o) => formatDate(o.fecha_emision),
  },
  {
    key: 'total',
    label: 'Total',
    type: 'currency',
    accessor: (o) => o.total_real ?? o.total_estimado ?? 0,
    render: (o) => {
      const total = o.total_real ?? o.total_estimado;
      return total != null && total > 0 ? (
        formatCurrency(total)
      ) : (
        <span className="text-xs text-muted-foreground/50">Sin precios</span>
      );
    },
    cellClassName: 'font-medium',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(
    new Date(ts)
  );
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
  if (s === 'borrador') return proveedorId ? 'Lista' : 'Sin proveedor';
  if (s === 'enviada') return 'Enviada';
  if (s === 'parcial') return 'Recepción parcial';
  if (s === 'cerrada') return 'Cerrada';
  if (s === 'cancelada') return 'Cancelada';
  // Legacy values (pre-Sprint-1 backfill): tratar como borrador
  if (s === 'abierta') return proveedorId ? 'Lista' : 'Sin proveedor';
  if (s === 'recibida') return 'Cerrada';
  return estatus ?? 'Sin estatus';
}

function getBadgeVariant(
  estatus: string | null,
  proveedorId: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = (estatus ?? '').toLowerCase();
  if (s === 'cerrada' || s === 'recibida') return 'default';
  if (s === 'enviada' || s === 'parcial') return 'secondary';
  if (s === 'cancelada') return 'destructive';
  if (s === 'borrador' || s === 'abierta') return proveedorId ? 'secondary' : 'outline';
  return 'outline';
}

function isOcTerminal(estatus: string | null) {
  const s = (estatus ?? '').toLowerCase();
  return s === 'cerrada' || s === 'cancelada' || s === 'recibida';
}

function isOcEditable(estatus: string | null) {
  const s = (estatus ?? '').toLowerCase();
  return s === 'borrador' || s === 'abierta';
}

function isOcReceiving(estatus: string | null) {
  const s = (estatus ?? '').toLowerCase();
  return s === 'enviada' || s === 'parcial';
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ ordenes }: { ordenes: OrdenCompra[] }) {
  const sinProveedor = ordenes.filter((o) => isOcEditable(o.estatus) && !o.proveedor_id).length;

  const activas = ordenes.filter((o) => {
    const s = (o.estatus ?? '').toLowerCase();
    return ['enviada', 'parcial', 'borrador', 'abierta'].includes(s);
  }).length;

  const total = ordenes.reduce((acc, o) => acc + (o.total_real ?? o.total_estimado ?? 0), 0);

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
  isAdmin,
  onClose,
  onReceiveChange,
  onPriceChange,
  onReceivePartial,
  onReceiveAll,
  onAsignarProveedor,
  onMarcarEnviada,
  onCancelarLinea,
  onCerrarOrden,
  onPriceOverride,
}: {
  orden: OrdenCompra | null;
  proveedores: Proveedor[];
  loadingItems: boolean;
  open: boolean;
  editedReceipts: Record<string, string>;
  editedPrices: Record<string, string>;
  isAdmin: boolean;
  onClose: () => void;
  onReceiveChange: (itemId: string, value: string, max: number) => void;
  onPriceChange: (itemId: string, value: string) => void;
  onReceivePartial: () => Promise<void>;
  onReceiveAll: () => Promise<void>;
  onAsignarProveedor: (proveedorId: string) => Promise<void>;
  onMarcarEnviada: () => Promise<void>;
  onCancelarLinea: (itemId: string, motivo: string) => Promise<void>;
  onCerrarOrden: (motivo: string) => Promise<void>;
  onPriceOverride: (itemId: string, precio: number) => Promise<void>;
}) {
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>('');
  const [cancelLineState, setCancelLineState] = useState<{
    itemId: string;
    motivo: string;
  } | null>(null);
  const [cerrarState, setCerrarState] = useState<{ motivo: string } | null>(null);
  const [overrideState, setOverrideState] = useState<{ itemId: string; value: string } | null>(
    null
  );

  useEffect(() => {
    setSelectedProveedorId(orden?.proveedor_id ?? '');
  }, [orden?.id, orden?.proveedor_id]);

  const items = orden?.items ?? [];
  const editable = isOcEditable(orden?.estatus ?? null);
  const terminal = isOcTerminal(orden?.estatus ?? null);
  const receiving = isOcReceiving(orden?.estatus ?? null);

  const proveedorObj = getProveedorObj(orden?.proveedor ?? null);
  const reqFolio = getRequisicionFolio(orden?.requisicion ?? null);

  const linesPending = items.filter((item) => {
    const pedida = item.cantidad ?? 0;
    const cancelada = item.cantidad_cancelada ?? 0;
    const recibidaEdit = Number(editedReceipts[item.id] ?? item.cantidad_recibida ?? 0);
    return recibidaEdit + cancelada < pedida;
  });
  const hasUnsavedReceipts = items.some((item) => {
    const stored = item.cantidad_recibida ?? 0;
    const edit = Number(editedReceipts[item.id] ?? stored);
    return edit !== stored;
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
            src="/brand/rdb/header-email.png"
            alt="Membrete Rincón del Bosque"
            className="mb-4 max-h-28 w-full object-contain"
          />
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-widest">Orden de Compra</h2>
              <p className="mt-1 text-base font-semibold">{orden?.folio ?? 'OC-BORRADOR'}</p>
              <p className="mt-0.5 text-sm text-gray-600">
                Fecha: {formatDateLong(orden?.fecha_emision)}
              </p>
              {reqFolio && (
                <p className="mt-0.5 text-sm text-gray-600">Ref. Requisición: {reqFolio}</p>
              )}
            </div>
            <div className="max-w-52 text-right text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider">Proveedor</div>
              <div className="font-semibold">{proveedorObj?.nombre ?? '—'}</div>
              {proveedorObj?.rfc && <div className="text-gray-600">RFC: {proveedorObj.rfc}</div>}
              {proveedorObj?.contacto && (
                <div className="text-gray-600">{proveedorObj.contacto}</div>
              )}
              {proveedorObj?.telefono && (
                <div className="text-gray-600">Tel: {proveedorObj.telefono}</div>
              )}
              {proveedorObj?.email && <div className="text-gray-600">{proveedorObj.email}</div>}
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
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!canPrint}>
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
                <Badge
                  variant={getBadgeVariant(orden?.estatus ?? null, orden?.proveedor_id ?? null)}
                >
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

            {/* ── Provider assignment (editable only) ── */}
            {editable && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 print:hidden">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Truck className="h-4 w-4 text-amber-600" />
                  Asignación de proveedor
                </div>
                <div className="flex gap-2">
                  <Combobox
                    value={selectedProveedorId}
                    onChange={setSelectedProveedorId}
                    options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
                    placeholder="Seleccionar proveedor…"
                    allowClear
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!selectedProveedorId || selectedProveedorId === orden?.proveedor_id}
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

            {terminal && (
              <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-4 text-sm print:hidden">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    OC {orden?.estatus === 'cancelada' ? 'cancelada' : 'cerrada'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    No se pueden registrar más recepciones ni cancelaciones. Total a pagar:{' '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(orden?.total_a_pagar ?? 0)}
                    </span>
                  </div>
                </div>
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
                          Pedida
                        </TableHead>
                        {editable ? (
                          <TableHead className="text-right print:font-bold print:text-black">
                            P. Unitario
                          </TableHead>
                        ) : (
                          <>
                            <TableHead className="text-right print:font-bold print:text-black">
                              Recibida
                            </TableHead>
                            <TableHead className="text-right print:font-bold print:text-black print:hidden">
                              Pendiente
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
                        const cancelada = item.cantidad_cancelada ?? 0;
                        const recibidaStored = item.cantidad_recibida ?? 0;
                        const recValue = editedReceipts[item.id] ?? String(recibidaStored);
                        const recibidaNum = Number(recValue) || 0;
                        const pendiente = Math.max(max - recibidaNum - cancelada, 0);
                        const priceValue =
                          editedPrices[item.id] ?? String(item.precio_unitario ?? '');
                        const priceNum = parseFloat(priceValue) || 0;
                        const displaySubtotal = editable ? max * priceNum : (item.subtotal ?? 0);
                        const recvMax = max - cancelada;
                        return (
                          <TableRow key={item.id} className="print:border-b-gray-300">
                            <TableCell className="print:py-1">
                              <div className="font-medium print:text-black">
                                {item.descripcion ?? 'Sin descripción'}
                              </div>
                              {cancelada > 0 && (
                                <div className="mt-0.5 text-xs text-destructive print:hidden">
                                  {cancelada} cancelada
                                  {item.motivo_cancelacion ? ` · ${item.motivo_cancelacion}` : ''}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums print:py-1 print:text-black">
                              {max}
                            </TableCell>

                            {editable ? (
                              <TableCell className="text-right print:py-1">
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
                                <span className="hidden print:inline print:text-black">
                                  {priceNum > 0 ? formatCurrency(priceNum) : '—'}
                                </span>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell className="text-right print:py-1">
                                  <div className="flex items-center justify-end gap-1 print:hidden">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={String(recvMax)}
                                      step="1"
                                      value={recValue}
                                      disabled={terminal}
                                      onChange={(e) =>
                                        onReceiveChange(item.id, e.target.value, recvMax)
                                      }
                                      className="w-20 text-right tabular-nums"
                                    />
                                    {!terminal && pendiente > 0 && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                        onClick={() =>
                                          setCancelLineState({ itemId: item.id, motivo: '' })
                                        }
                                        aria-label="Cancelar pendiente de esta línea"
                                        title="Cancelar pendiente"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                  <span className="hidden print:inline print:text-black">
                                    {recValue}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums print:py-1 print:hidden">
                                  {pendiente > 0 ? (
                                    <span className="text-amber-600">{pendiente}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/50">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground print:py-1 print:text-black">
                                  <div className="flex items-center justify-end gap-1">
                                    <span
                                      className={
                                        item.precio_real != null &&
                                        item.precio_real !== item.precio_unitario
                                          ? 'font-medium text-foreground'
                                          : ''
                                      }
                                      title={
                                        item.precio_real != null &&
                                        item.precio_real !== item.precio_unitario
                                          ? `Override del precio original ${formatCurrency(item.precio_unitario)}`
                                          : undefined
                                      }
                                    >
                                      {formatCurrency(item.precio_real ?? item.precio_unitario)}
                                    </span>
                                    {isAdmin && !terminal && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground print:hidden"
                                        onClick={() =>
                                          setOverrideState({
                                            itemId: item.id,
                                            value: String(
                                              item.precio_real ?? item.precio_unitario ?? ''
                                            ),
                                          })
                                        }
                                        aria-label="Modificar precio (admin)"
                                        title="Modificar precio (admin)"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
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
                      {formatCurrency(printTotal > 0 ? printTotal : (orden?.total_estimado ?? 0))}
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
          {editable && orden?.proveedor_id && items.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void onMarcarEnviada()} className="gap-2">
                <Send className="h-4 w-4" />
                Guardar precios y marcar Enviada
              </Button>
            </div>
          )}
          {receiving && items.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {linesPending.length > 0 && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCerrarState({ motivo: '' })}
                >
                  Cerrar OC
                </Button>
              )}
              {hasUnsavedReceipts && (
                <Button variant="outline" onClick={() => void onReceivePartial()}>
                  Guardar recepciones
                </Button>
              )}
              {linesPending.length > 0 && (
                <Button onClick={() => void onReceiveAll()}>Recibir Todo</Button>
              )}
            </div>
          )}
        </div>

        {/* ── ConfirmDialog: Cancelar pendiente de línea ── */}
        <ConfirmDialog
          open={cancelLineState !== null}
          onOpenChange={(o) => !o && setCancelLineState(null)}
          onConfirm={async () => {
            if (!cancelLineState) return;
            await onCancelarLinea(cancelLineState.itemId, cancelLineState.motivo);
            setCancelLineState(null);
          }}
          title="¿Cancelar pendiente de esta línea?"
          description={
            <div className="space-y-2">
              <p>
                El pendiente de esta partida se marcará como cancelado. La cantidad ya recibida no
                se toca; solo el faltante deja de esperarse.
              </p>
              <Textarea
                placeholder="Motivo (opcional)"
                value={cancelLineState?.motivo ?? ''}
                onChange={(e) =>
                  setCancelLineState((prev) => (prev ? { ...prev, motivo: e.target.value } : prev))
                }
                rows={2}
              />
            </div>
          }
          confirmLabel="Cancelar pendiente"
          confirmVariant="destructive"
        />

        {/* ── ConfirmDialog: Cerrar OC ── */}
        <ConfirmDialog
          open={cerrarState !== null}
          onOpenChange={(o) => !o && setCerrarState(null)}
          onConfirm={async () => {
            if (!cerrarState) return;
            await onCerrarOrden(cerrarState.motivo);
            setCerrarState(null);
          }}
          title="¿Cerrar orden de compra?"
          description={
            <div className="space-y-2">
              <p>
                Se cancelará el pendiente de{' '}
                <span className="font-medium">{linesPending.length}</span>{' '}
                {linesPending.length === 1 ? 'partida' : 'partidas'} y la OC pasará a estado{' '}
                <span className="font-medium">cerrada</span>. No se podrán registrar más
                recepciones.
              </p>
              <Textarea
                placeholder="Motivo del cierre (opcional)"
                value={cerrarState?.motivo ?? ''}
                onChange={(e) =>
                  setCerrarState((prev) => (prev ? { ...prev, motivo: e.target.value } : prev))
                }
                rows={2}
              />
            </div>
          }
          confirmLabel="Cerrar OC"
          confirmVariant="destructive"
        />

        {/* ── ConfirmDialog: Override de precio (admin) ── */}
        <ConfirmDialog
          open={overrideState !== null}
          onOpenChange={(o) => !o && setOverrideState(null)}
          onConfirm={async () => {
            if (!overrideState) return;
            const num = parseFloat(overrideState.value);
            if (!isFinite(num) || num < 0) {
              throw new Error('Precio inválido');
            }
            await onPriceOverride(overrideState.itemId, num);
            setOverrideState(null);
          }}
          title="Modificar precio de la línea"
          description={
            <div className="space-y-2">
              <p>
                Override del precio. Este cambio queda registrado en audit log con tu usuario y la
                hora.
              </p>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={overrideState?.value ?? ''}
                onChange={(e) =>
                  setOverrideState((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                placeholder="0.00"
                className="text-right tabular-nums"
              />
            </div>
          }
          confirmLabel="Aplicar override"
          confirmVariant="default"
        />
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdenesCompraPage() {
  const feedback = useActionFeedback();
  const { permissions } = usePermissions();
  const isAdmin = permissions.isAdmin;
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
          'id, codigo, requisicion_id, proveedor_id, total, total_a_pagar, estado, autorizada_at, cerrada_at, created_at, proveedor:proveedores!proveedor_id(id, persona:personas!persona_id(nombre, apellido_paterno, apellido_materno, email, telefono, rfc)), requisicion:requisiciones!requisicion_id(codigo)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('created_at', { ascending: false });

      if (dateFrom) query = query.gte('created_at', getLocalDayBoundsUtc(dateFrom, TZ).start);
      if (dateTo) query = query.lte('created_at', getLocalDayBoundsUtc(dateTo, TZ).end);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      type RawOrden = {
        id: string;
        codigo: string | null;
        requisicion_id: string | null;
        proveedor_id: string | null;
        total: number | null;
        total_a_pagar: number | null;
        estado: string | null;
        autorizada_at: string | null;
        cerrada_at: string | null;
        created_at: string | null;
        proveedor: unknown;
        requisicion: unknown;
      };
      const buildNombre = (
        p: {
          nombre: string;
          apellido_paterno: string | null;
          apellido_materno: string | null;
        } | null
      ) => {
        if (!p) return null;
        const full = [p.nombre, p.apellido_paterno, p.apellido_materno]
          .filter((s) => s && s.trim())
          .join(' ')
          .trim();
        return full || null;
      };
      const ordenesMapped: OrdenCompra[] = ((data ?? []) as unknown as RawOrden[]).map((o) => {
        const prov = o.proveedor as {
          id: string;
          persona: {
            nombre: string;
            apellido_paterno: string | null;
            apellido_materno: string | null;
            email: string | null;
            telefono: string | null;
            rfc: string | null;
          } | null;
        } | null;
        const persona = prov?.persona ?? null;
        const proveedor: Proveedor | null = prov
          ? {
              id: prov.id,
              nombre: buildNombre(persona),
              email: persona?.email ?? null,
              telefono: persona?.telefono ?? null,
              rfc: persona?.rfc ?? null,
            }
          : null;
        const req = o.requisicion as { codigo: string | null } | null;
        return {
          id: o.id,
          folio: o.codigo ?? null,
          requisicion_id: o.requisicion_id ?? null,
          proveedor_id: o.proveedor_id ?? null,
          estatus: o.estado ?? (o.autorizada_at ? 'enviada' : 'borrador'),
          total_estimado: o.total ?? null,
          total_real: o.total ?? null,
          total_a_pagar: o.total_a_pagar ?? null,
          cerrada_at: o.cerrada_at ?? null,
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
        .select(
          'id, activo, persona:personas!persona_id(nombre, apellido_paterno, apellido_materno, email, telefono, rfc)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('activo', true);
      type RawProv = {
        id: string;
        persona: {
          nombre: string;
          apellido_paterno: string | null;
          apellido_materno: string | null;
          email: string | null;
          telefono: string | null;
          rfc: string | null;
        } | null;
      };
      const provMapped: Proveedor[] = ((provRaw ?? []) as unknown as RawProv[])
        .map((p) => {
          const persona = p.persona ?? null;
          return {
            id: p.id,
            nombre: buildNombre(persona),
            email: persona?.email ?? null,
            telefono: persona?.telefono ?? null,
            rfc: persona?.rfc ?? null,
          };
        })
        .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
      setProveedores(provMapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude cargar las órdenes de compra.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchOrdenes();
  }, [fetchOrdenes]);

  // Auto-abrir drawer si llega ?focus={oc_id} (deep-link desde /inventario/movimientos)
  const searchParams = useSearchParams();
  const focusOcId = searchParams.get('focus');
  const [autoOpenedFocusId, setAutoOpenedFocusId] = useState<string | null>(null);

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
        .select(
          'id, descripcion, cantidad, cantidad_recibida, cantidad_cancelada, precio_unitario, precio_real, subtotal, motivo_cancelacion'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('orden_compra_id', orden.id)
        .order('descripcion');

      if (itemsError) throw itemsError;

      const items = (data ?? []) as OrdenCompraItem[];
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

  useEffect(() => {
    if (!focusOcId || autoOpenedFocusId === focusOcId || ordenes.length === 0) return;
    const target = ordenes.find((o) => o.id === focusOcId);
    if (target) {
      setAutoOpenedFocusId(focusOcId);
      void openDetail(target);
    }
  }, [focusOcId, ordenes, autoOpenedFocusId, openDetail]);

  const handleReceiveChange = useCallback((itemId: string, value: string, max: number) => {
    const normalized = value === '' ? '' : String(Math.min(Math.max(Number(value) || 0, 0), max));
    setEditedReceipts((prev) => ({ ...prev, [itemId]: normalized }));
  }, []);

  const handlePriceChange = useCallback((itemId: string, value: string) => {
    setEditedPrices((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const refreshOrdenAfterMutation = useCallback(async (ordenId: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data: oRaw } = await supabase
      .schema('erp')
      .from('ordenes_compra')
      .select('estado, total_a_pagar, cerrada_at')
      .eq('empresa_id', RDB_EMPRESA_ID)
      .eq('id', ordenId)
      .single();
    const { data: itemsRaw } = await supabase
      .schema('erp')
      .from('ordenes_compra_detalle')
      .select(
        'id, descripcion, cantidad, cantidad_recibida, cantidad_cancelada, precio_unitario, precio_real, subtotal, motivo_cancelacion'
      )
      .eq('empresa_id', RDB_EMPRESA_ID)
      .eq('orden_compra_id', ordenId)
      .order('descripcion');

    const items = (itemsRaw ?? []) as OrdenCompraItem[];
    const nextEstado = oRaw?.estado ?? null;
    const nextTotalAPagar = oRaw?.total_a_pagar ?? null;
    const nextCerradaAt = oRaw?.cerrada_at ?? null;

    setSelected((prev) =>
      prev?.id === ordenId
        ? {
            ...prev,
            estatus: nextEstado ?? prev.estatus,
            total_a_pagar: nextTotalAPagar,
            cerrada_at: nextCerradaAt,
            items,
          }
        : prev
    );
    setOrdenes((prev) =>
      prev.map((o) =>
        o.id === ordenId
          ? {
              ...o,
              estatus: nextEstado ?? o.estatus,
              total_a_pagar: nextTotalAPagar,
              cerrada_at: nextCerradaAt,
            }
          : o
      )
    );
    setEditedReceipts(
      items.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = String(item.cantidad_recibida ?? 0);
        return acc;
      }, {})
    );
  }, []);

  const persistReception = useCallback(
    async (markAll: boolean) => {
      if (!selected?.items?.length || !selected.id) return;
      setSaving(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        for (const item of selected.items) {
          const max = item.cantidad ?? 0;
          const cancelada = item.cantidad_cancelada ?? 0;
          const stored = item.cantidad_recibida ?? 0;
          const target = markAll
            ? max - cancelada
            : Math.min(Math.max(Number(editedReceipts[item.id] ?? stored), 0), max - cancelada);
          if (target === stored) continue;
          const { error: rpcError } = await supabase.schema('erp').rpc('oc_recibir_linea', {
            p_detalle_id: item.id,
            p_cantidad_recibida_total: target,
          });
          if (rpcError) throw rpcError;
        }
        await refreshOrdenAfterMutation(selected.id);
        feedback.success(markAll ? 'Recepción completa registrada' : 'Recepciones guardadas');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No pude guardar la recepción.';
        setError(msg);
        feedback.error(err instanceof Error ? err : new Error(msg));
      } finally {
        setSaving(false);
      }
    },
    [editedReceipts, selected, refreshOrdenAfterMutation, feedback]
  );

  const handleCancelarLinea = useCallback(
    async (itemId: string, motivo: string) => {
      if (!selected?.id) return;
      setSaving(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: rpcError } = await supabase
          .schema('erp')
          .rpc('oc_cancelar_pendiente_linea', {
            p_detalle_id: itemId,
            p_motivo: motivo || undefined,
          });
        if (rpcError) throw rpcError;
        await refreshOrdenAfterMutation(selected.id);
        feedback.success('Pendiente cancelado');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No pude cancelar el pendiente.';
        setError(msg);
        feedback.error(err instanceof Error ? err : new Error(msg));
      } finally {
        setSaving(false);
      }
    },
    [selected, refreshOrdenAfterMutation, feedback]
  );

  const handlePriceOverride = useCallback(
    async (itemId: string, precio: number) => {
      if (!selected?.id) return;
      setSaving(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: updError } = await supabase
          .schema('erp')
          .from('ordenes_compra_detalle')
          .update({ precio_real: precio })
          .eq('id', itemId);
        if (updError) throw updError;
        await refreshOrdenAfterMutation(selected.id);
        feedback.success('Precio actualizado');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No pude actualizar el precio.';
        setError(msg);
        feedback.error(err instanceof Error ? err : new Error(msg));
      } finally {
        setSaving(false);
      }
    },
    [selected, refreshOrdenAfterMutation, feedback]
  );

  const handleCerrarOrden = useCallback(
    async (motivo: string) => {
      if (!selected?.id) return;
      setSaving(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: rpcError } = await supabase.schema('erp').rpc('oc_cerrar_orden', {
          p_orden_id: selected.id,
          p_motivo: motivo || undefined,
        });
        if (rpcError) throw rpcError;
        await refreshOrdenAfterMutation(selected.id);
        feedback.success('Orden de compra cerrada');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No pude cerrar la OC.';
        setError(msg);
        feedback.error(err instanceof Error ? err : new Error(msg));
      } finally {
        setSaving(false);
      }
    },
    [selected, refreshOrdenAfterMutation, feedback]
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
            o.id === selected.id ? { ...o, proveedor_id: proveedorId, proveedor } : o
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pude asignar el proveedor.');
      } finally {
        setSaving(false);
      }
    },
    [selected, proveedores]
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

      const nowIso = new Date().toISOString();
      const { error: e2 } = await supabase
        .schema('erp')
        .from('ordenes_compra')
        .update({ total: totalEstimado, estado: 'enviada', autorizada_at: nowIso })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', selected.id);
      if (e2) throw e2;

      const updatedItems = (selected.items ?? []).map((item) => ({
        ...item,
        precio_unitario: parseFloat(editedPrices[item.id] ?? '') || item.precio_unitario,
        subtotal: (item.cantidad ?? 0) * (parseFloat(editedPrices[item.id] ?? '') || 0),
      }));
      const updatedOrden: OrdenCompra = {
        ...selected,
        estatus: 'enviada',
        total_estimado: totalEstimado,
        items: updatedItems,
      };
      setSelected(updatedOrden);
      setOrdenes((prev) =>
        prev.map((o) =>
          o.id === selected.id ? { ...o, estatus: 'enviada', total_estimado: totalEstimado } : o
        )
      );
      feedback.success('OC marcada como Enviada');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No pude guardar los precios.';
      setError(msg);
      feedback.error(err instanceof Error ? err : new Error(msg));
    } finally {
      setSaving(false);
    }
  }, [selected, editedPrices, feedback]);

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

          <Combobox
            value={presetKey}
            onChange={handlePreset}
            options={[
              { value: 'hoy', label: 'Hoy' },
              { value: 'ayer', label: 'Ayer' },
              { value: 'semana', label: 'Esta semana' },
              { value: '7dias', label: 'Últimos 7 días' },
              { value: 'mes', label: 'Este mes' },
              { value: '30dias', label: 'Últimos 30 días' },
              { value: 'ano', label: 'Este año' },
            ]}
            placeholder="Rango..."
            className="w-[140px]"
          />

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchOrdenes()}
            aria-label="Actualizar"
          >
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

        <DataTable<(typeof filtered)[number]>
          data={filtered}
          columns={ordenColumns}
          rowKey="id"
          loading={loading}
          onRowClick={(o) => void openDetail(o)}
          initialSort={{ key: 'fecha_emision', dir: 'desc' }}
          emptyTitle="No se encontraron órdenes de compra"
          showDensityToggle={false}
        />

        <OrdenDetail
          orden={selected}
          proveedores={proveedores}
          loadingItems={loadingItems}
          open={drawerOpen}
          editedReceipts={editedReceipts}
          editedPrices={editedPrices}
          isAdmin={isAdmin}
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
          onCancelarLinea={handleCancelarLinea}
          onCerrarOrden={handleCerrarOrden}
          onPriceOverride={handlePriceOverride}
        />
      </div>
    </RequireAccess>
  );
}
