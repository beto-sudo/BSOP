'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage, toSupabaseError } from '@/lib/supabase-error';
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
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { AlertTriangle, ExternalLink, RefreshCw, Search, Truck, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string;
  nombre: string | null;
  email?: string | null;
  telefono?: string | null;
  rfc?: string | null;
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

type MovimientoRecepcion = {
  id: string;
  cantidad: number | null;
  costo_unitario: number | null;
  created_at: string | null;
  producto_nombre: string | null;
  producto_unidad: string | null;
  almacen_nombre: string | null;
};

type OrdenCompra = {
  id: string;
  folio: string | null;
  proveedor_id: string | null;
  estatus: string | null;
  total_estimado: number | null;
  total_a_pagar: number | null;
  autorizada_at: string | null;
  fecha_emision: string | null;
  proveedor?: Proveedor | null;
  items?: OrdenCompraItem[];
};

const TZ = 'America/Matamoros';
const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(
    new Date(ts)
  );
}

function formatDateTimeShort(ts: string | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function getEstatusLabel(estatus: string | null) {
  const s = (estatus ?? '').toLowerCase();
  if (s === 'enviada') return 'Enviada';
  if (s === 'parcial') return 'Recepción parcial';
  return estatus ?? 'Sin estatus';
}

function getBadgeVariant(estatus: string | null): 'default' | 'secondary' | 'outline' {
  const s = (estatus ?? '').toLowerCase();
  if (s === 'enviada' || s === 'parcial') return 'secondary';
  return 'outline';
}

// ── RecepcionesHistorial ─────────────────────────────────────────────────────

function RecepcionesHistorial({
  ordenId,
  movs,
  loading,
  totalEstimado,
}: {
  ordenId: string;
  movs: MovimientoRecepcion[];
  loading: boolean;
  totalEstimado: number;
}) {
  const totalRecibido = movs.reduce(
    (acc, m) => acc + (m.cantidad ?? 0) * (m.costo_unitario ?? 0),
    0
  );
  const pct =
    totalEstimado > 0 ? Math.min(100, Math.round((totalRecibido / totalEstimado) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Historial de recepciones
        </div>
        {movs.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {movs.length} {movs.length === 1 ? 'recepción' : 'recepciones'}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : movs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no se han registrado recepciones para esta OC.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo u.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Almacén</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => {
                  const cantidad = m.cantidad ?? 0;
                  const costo = m.costo_unitario ?? 0;
                  const valor = cantidad * costo;
                  return (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => {
                        window.location.href = `/rdb/inventario/movimientos?focus=${m.id}`;
                      }}
                      title="Ver detalle del movimiento"
                    >
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatDateTimeShort(m.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.producto_nombre ?? '—'}
                        {m.producto_unidad && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({m.producto_unidad})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {costo > 0 ? formatCurrency(costo) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {valor > 0 ? formatCurrency(valor) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.almacen_nombre ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 text-sm">
            <div>
              <span className="font-medium">Recibido: </span>
              <span className="tabular-nums">{formatCurrency(totalRecibido)}</span>
              {totalEstimado > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  / {formatCurrency(totalEstimado)} <span className="text-xs">({pct}%)</span>
                </span>
              )}
            </div>
            <a
              href={`/rdb/inventario/movimientos?focus=${ordenId}`}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Ver en inventario →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// ── RecepcionDetail ──────────────────────────────────────────────────────────

function RecepcionDetail({
  orden,
  loadingItems,
  open,
  editedReceipts,
  recepcionMovs,
  loadingRecepcionMovs,
  onClose,
  onReceiveChange,
  onReceivePartial,
  onReceiveAll,
  onCancelarLinea,
}: {
  orden: OrdenCompra | null;
  loadingItems: boolean;
  open: boolean;
  editedReceipts: Record<string, string>;
  recepcionMovs: MovimientoRecepcion[];
  loadingRecepcionMovs: boolean;
  onClose: () => void;
  onReceiveChange: (itemId: string, value: string, max: number) => void;
  onReceivePartial: () => Promise<void>;
  onReceiveAll: () => Promise<void>;
  onCancelarLinea: (itemId: string, motivo: string) => Promise<void>;
}) {
  const [cancelLineState, setCancelLineState] = useState<{
    itemId: string;
    motivo: string;
  } | null>(null);

  const items = orden?.items ?? [];
  const proveedor = orden?.proveedor ?? null;

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

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(value) => !value && onClose()}
      size="lg"
      title={orden?.folio ?? 'Recepción'}
      description={`${proveedor?.nombre ?? 'Sin proveedor'} · ${formatDate(orden?.fecha_emision)}`}
      actions={
        orden?.id ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `/rdb/ordenes-compra?focus=${orden.id}`;
            }}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Ver OC
          </Button>
        ) : null
      }
    >
      <DetailDrawerContent>
        <div className="space-y-6">
          {/* ── Status + meta ── */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={getBadgeVariant(orden?.estatus ?? null)}>
                {getEstatusLabel(orden?.estatus ?? null)}
              </Badge>
              {orden?.autorizada_at && (
                <span className="text-xs text-muted-foreground">
                  Enviada al proveedor: {formatDate(orden.autorizada_at)}
                </span>
              )}
            </div>
            {proveedor && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {proveedor.telefono && <div>Tel: {proveedor.telefono}</div>}
                {proveedor.email && <div>{proveedor.email}</div>}
              </div>
            )}
          </div>

          {/* ── Items table ── */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Partidas
            </div>
            {loadingItems ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin artículos registrados.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artículo</TableHead>
                      <TableHead className="text-right">Pedida</TableHead>
                      <TableHead className="text-right">Recibir</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
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
                      const recvMax = max - cancelada;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">
                              {item.descripcion ?? 'Sin descripción'}
                            </div>
                            {cancelada > 0 && (
                              <div className="mt-0.5 text-xs text-destructive">
                                {cancelada} cancelada
                                {item.motivo_cancelacion ? ` · ${item.motivo_cancelacion}` : ''}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{max}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min="0"
                                max={String(recvMax)}
                                step="1"
                                value={recValue}
                                onChange={(e) => onReceiveChange(item.id, e.target.value, recvMax)}
                                className="w-20 text-right tabular-nums"
                              />
                              {pendiente > 0 && (
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
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pendiente > 0 ? (
                              <span className="text-amber-600">{pendiente}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ── Historial de recepciones ── */}
          {orden?.id && (
            <RecepcionesHistorial
              ordenId={orden.id}
              movs={recepcionMovs}
              loading={loadingRecepcionMovs}
              totalEstimado={orden.total_estimado ?? 0}
            />
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="space-y-3 border-t pt-4">
          {items.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

/**
 * @module Recepciones (RDB)
 * @responsive desktop-only
 */
export default function RecepcionesPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.recepciones">
      <DesktopOnlyNotice module="Recepciones" />
      <div className="hidden sm:block">
        <Suspense fallback={null}>
          <RecepcionesContent />
        </Suspense>
      </div>
    </RequireAccess>
  );
}

function RecepcionesContent() {
  const feedback = useActionFeedback();
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => monthRange().from);
  const [dateTo, setDateTo] = useState(() => monthRange().to);
  const [presetKey, setPresetKey] = useState<string>('mes');
  const [filtroEstado, setFiltroEstado] = useState<'pendientes' | 'completadas' | 'todas'>(
    'pendientes'
  );

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
    if (preset === 'hoy') {
      const t = formatter.format(today);
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
  const [recepcionMovs, setRecepcionMovs] = useState<MovimientoRecepcion[]>([]);
  const [loadingRecepcionMovs, setLoadingRecepcionMovs] = useState(false);

  const loadRecepcionMovs = useCallback(async (ordenId: string) => {
    setLoadingRecepcionMovs(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: e } = await supabase
        .schema('erp')
        .from('movimientos_inventario')
        .select(
          'id, cantidad, costo_unitario, created_at, producto:productos!producto_id(nombre, unidad), almacen:almacenes!almacen_id(nombre)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('referencia_tipo', 'oc_recepcion')
        .eq('referencia_id', ordenId)
        .order('created_at', { ascending: false });
      if (e) throw e;

      type RawMov = {
        id: string;
        cantidad: number | null;
        costo_unitario: number | null;
        created_at: string | null;
        producto: { nombre: string | null; unidad: string | null } | null;
        almacen: { nombre: string | null } | null;
      };
      const mapped: MovimientoRecepcion[] = ((data ?? []) as unknown as RawMov[]).map((m) => ({
        id: m.id,
        cantidad: m.cantidad,
        costo_unitario: m.costo_unitario,
        created_at: m.created_at,
        producto_nombre: m.producto?.nombre ?? null,
        producto_unidad: m.producto?.unidad ?? null,
        almacen_nombre: m.almacen?.nombre ?? null,
      }));
      setRecepcionMovs(mapped);
    } catch {
      setRecepcionMovs([]);
    } finally {
      setLoadingRecepcionMovs(false);
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
          'id, codigo, proveedor_id, total, total_a_pagar, estado, autorizada_at, created_at, proveedor:proveedores!proveedor_id(id, persona:personas!persona_id(nombre, apellido_paterno, apellido_materno, email, telefono, rfc))'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('autorizada_at', { ascending: false, nullsFirst: false });

      if (filtroEstado === 'pendientes') {
        query = query.in('estado', ['enviada', 'parcial']);
      } else if (filtroEstado === 'completadas') {
        query = query.in('estado', ['cerrada', 'cancelada', 'recibida']);
      } else {
        // 'todas' — solo OCs ya enviadas (NO borradores, esos viven en /rdb/ordenes-compra)
        query = query.in('estado', ['enviada', 'parcial', 'cerrada', 'cancelada', 'recibida']);
      }

      if (dateFrom) query = query.gte('created_at', getLocalDayBoundsUtc(dateFrom, TZ).start);
      if (dateTo) query = query.lte('created_at', getLocalDayBoundsUtc(dateTo, TZ).end);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      type RawOrden = {
        id: string;
        codigo: string | null;
        proveedor_id: string | null;
        total: number | null;
        total_a_pagar: number | null;
        estado: string | null;
        autorizada_at: string | null;
        created_at: string | null;
        proveedor: unknown;
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
        return {
          id: o.id,
          folio: o.codigo ?? null,
          proveedor_id: o.proveedor_id ?? null,
          estatus: o.estado ?? 'enviada',
          total_estimado: o.total ?? null,
          total_a_pagar: o.total_a_pagar ?? null,
          autorizada_at: o.autorizada_at ?? null,
          fecha_emision: o.created_at ?? null,
          proveedor,
        };
      });
      setOrdenes(ordenesMapped);
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'No pude cargar las recepciones.'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filtroEstado]);

  useEffect(() => {
    void fetchOrdenes();
  }, [fetchOrdenes]);

  const searchParams = useSearchParams();
  const focusOcId = searchParams.get('focus');
  const [autoOpenedFocusId, setAutoOpenedFocusId] = useState<string | null>(null);

  const openDetail = useCallback(
    async (orden: OrdenCompra) => {
      setSelected(orden);
      setDrawerOpen(true);
      setLoadingItems(true);
      setEditedReceipts({});
      setRecepcionMovs([]);
      void loadRecepcionMovs(orden.id);
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

        setEditedReceipts(initialReceipts);
        setSelected((prev) => (prev?.id === orden.id ? { ...prev, items } : prev));
      } catch (err) {
        setError(getSupabaseErrorMessage(err, 'No pude cargar el detalle.'));
      } finally {
        setLoadingItems(false);
      }
    },
    [loadRecepcionMovs]
  );

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

  const refreshOrdenAfterMutation = useCallback(
    async (ordenId: string) => {
      const supabase = createSupabaseBrowserClient();
      const { data: oRaw } = await supabase
        .schema('erp')
        .from('ordenes_compra')
        .select('estado, total, total_a_pagar, autorizada_at')
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
      const nextTotalEstimado = oRaw?.total ?? null;
      const nextTotalAPagar = oRaw?.total_a_pagar ?? null;
      const nextAutorizadaAt = oRaw?.autorizada_at ?? null;

      // Si la OC pasó a estado terminal (cerrada/cancelada/recibida), solo
      // sale de la lista cuando el filtro activo es 'pendientes' — en
      // 'completadas' o 'todas' debe quedarse visible con el estado nuevo.
      const terminal =
        nextEstado === 'cerrada' || nextEstado === 'cancelada' || nextEstado === 'recibida';
      const dropFromList = terminal && filtroEstado === 'pendientes';

      setSelected((prev) =>
        prev?.id === ordenId
          ? {
              ...prev,
              estatus: nextEstado ?? prev.estatus,
              total_estimado: nextTotalEstimado ?? prev.total_estimado,
              total_a_pagar: nextTotalAPagar,
              autorizada_at: nextAutorizadaAt,
              items,
            }
          : prev
      );

      if (dropFromList) {
        setOrdenes((prev) => prev.filter((o) => o.id !== ordenId));
      } else {
        setOrdenes((prev) =>
          prev.map((o) =>
            o.id === ordenId
              ? {
                  ...o,
                  estatus: nextEstado ?? o.estatus,
                  total_estimado: nextTotalEstimado ?? o.total_estimado,
                  total_a_pagar: nextTotalAPagar,
                  autorizada_at: nextAutorizadaAt,
                }
              : o
          )
        );
      }

      setEditedReceipts(
        items.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = String(item.cantidad_recibida ?? 0);
          return acc;
        }, {})
      );
      void loadRecepcionMovs(ordenId);
    },
    [loadRecepcionMovs, filtroEstado]
  );

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
        const msg = getSupabaseErrorMessage(err, 'No pude guardar la recepción.');
        setError(msg);
        feedback.error(toSupabaseError(err, msg));
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
        const msg = getSupabaseErrorMessage(err, 'No pude cancelar el pendiente.');
        setError(msg);
        feedback.error(toSupabaseError(err, msg));
      } finally {
        setSaving(false);
      }
    },
    [selected, refreshOrdenAfterMutation, feedback]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ordenes;
    return ordenes.filter((o) => {
      const folio = (o.folio ?? '').toLowerCase();
      const provNombre = (o.proveedor?.nombre ?? '').toLowerCase();
      return folio.includes(q) || provNombre.includes(q);
    });
  }, [ordenes, search]);

  const ordenColumns: Column<OrdenCompra>[] = [
    {
      key: 'folio',
      label: 'OC / Folio',
      cellClassName: 'font-mono text-xs font-medium',
      render: (o) => o.folio ?? '—',
    },
    {
      key: 'proveedor_nombre',
      label: 'Proveedor',
      accessor: (o) => o.proveedor?.nombre ?? '',
      render: (o) => {
        const nombre = o.proveedor?.nombre;
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
        <Badge variant={getBadgeVariant(o.estatus)}>{getEstatusLabel(o.estatus)}</Badge>
      ),
    },
    {
      key: 'autorizada_at',
      label: 'Enviada',
      cellClassName: 'text-sm text-muted-foreground',
      render: (o) => formatDate(o.autorizada_at),
    },
    {
      key: 'total',
      label: 'Total',
      type: 'currency',
      accessor: (o) => o.total_estimado ?? 0,
      render: (o) =>
        o.total_estimado != null && o.total_estimado > 0 ? (
          formatCurrency(o.total_estimado)
        ) : (
          <span className="text-xs text-muted-foreground/50">Sin precios</span>
        ),
      cellClassName: 'font-medium',
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Recepciones</h1>
        <p className="text-sm text-muted-foreground">
          Captura recepciones contra OCs enviadas al proveedor y consulta el historial de OCs
          completadas. Filtra por <strong>Pendientes</strong> (default) para capturar lo que va
          llegando, o cambia a <strong>Completadas</strong> / <strong>Todas</strong> para ver OCs ya
          cerradas o canceladas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPresetKey('custom');
            }}
            className="w-36"
          />
          <span className="text-xs text-muted-foreground">a</span>
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
            { value: 'semana', label: 'Esta semana' },
            { value: '7dias', label: 'Últimos 7 días' },
            { value: 'mes', label: 'Este mes' },
            { value: '30dias', label: 'Últimos 30 días' },
            { value: 'ano', label: 'Este año' },
          ]}
          placeholder="Rango..."
          className="w-[140px]"
        />

        <Combobox
          value={filtroEstado}
          onChange={(v) => v && setFiltroEstado(v as 'pendientes' | 'completadas' | 'todas')}
          options={[
            { value: 'pendientes', label: 'Pendientes' },
            { value: 'completadas', label: 'Completadas' },
            { value: 'todas', label: 'Todas' },
          ]}
          placeholder="Estado..."
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
          {loading
            ? 'Cargando…'
            : `${filtered.length} ${
                filtroEstado === 'pendientes'
                  ? filtered.length === 1
                    ? 'OC pendiente'
                    : 'OCs pendientes'
                  : filtroEstado === 'completadas'
                    ? filtered.length === 1
                      ? 'OC completada'
                      : 'OCs completadas'
                    : filtered.length === 1
                      ? 'OC'
                      : 'OCs'
              }`}
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
        initialSort={{ key: 'autorizada_at', dir: 'desc' }}
        emptyTitle={
          filtroEstado === 'pendientes'
            ? 'No hay OCs pendientes de recepción'
            : filtroEstado === 'completadas'
              ? 'No hay OCs completadas en este rango'
              : 'No hay OCs en este rango'
        }
        emptyDescription={
          filtroEstado === 'pendientes'
            ? 'Cuando alguien envíe una OC al proveedor, aparecerá aquí para que captures la recepción cuando llegue la mercancía.'
            : filtroEstado === 'completadas'
              ? 'Aquí aparecen las OCs que ya cerraron, recibieron completas o se cancelaron.'
              : 'Cambia el rango de fechas o el filtro de estado para ver más OCs.'
        }
        showDensityToggle={false}
      />

      <RecepcionDetail
        orden={selected}
        loadingItems={loadingItems}
        open={drawerOpen}
        editedReceipts={editedReceipts}
        recepcionMovs={recepcionMovs}
        loadingRecepcionMovs={loadingRecepcionMovs}
        onClose={() => setDrawerOpen(false)}
        onReceiveChange={handleReceiveChange}
        onReceivePartial={async () => {
          await persistReception(false);
        }}
        onReceiveAll={async () => {
          await persistReception(true);
        }}
        onCancelarLinea={handleCancelarLinea}
      />
    </div>
  );
}
