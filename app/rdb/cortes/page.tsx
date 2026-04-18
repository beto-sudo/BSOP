'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Cleanup PR (#30): pre-existing `any` on Supabase row mapping.
 * Proper typing requires schema refactor — out of scope for lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { abrirCaja, cerrarCaja, type Denominacion } from './actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
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
import {
  CalendarDays,
  RefreshCw,
  Scissors,
  TrendingUp,
  Wallet,
  PlusCircle,
  Loader2,
  Printer,
  XCircle,
} from 'lucide-react';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

// rdb.cortes columns
type Corte = {
  id: string;
  corte_nombre: string | null;
  caja_nombre: string | null;
  caja_id: string | null;
  fecha_operativa: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: string | null;
  efectivo_inicial: number | null;
  efectivo_contado: number | null;
  responsable_apertura: string | null;
  responsable_cierre: string | null;
  turno: string | null;
  tipo: string | null;
  observaciones: string | null;
  // From v_cortes_totales via v_cortes_completo
  ingresos_efectivo?: number | null;
  ingresos_tarjeta?: number | null;
  ingresos_stripe?: number | null;
  ingresos_transferencias?: number | null;
  total_ingresos?: number | null;
  depositos?: number | null;
  retiros?: number | null;
  efectivo_esperado?: number | null;
  pedidos_count?: number | null;
};

// rdb.v_cortes_totales columns (lazy-loaded per corte)
type CorteTotales = {
  corte_id: string;
  caja_id: string | null;
  caja_nombre: string | null;
  estado: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  efectivo_inicial: number | null;
  ingresos_efectivo: number | null;
  ingresos_tarjeta: number | null;
  ingresos_stripe: number | null;
  ingresos_transferencias: number | null;
  total_ingresos: number | null;
  depositos: number | null;
  retiros: number | null;
  efectivo_esperado: number | null;
};

// erp.movimientos_caja columns (filtered by empresa_id = RDB_EMPRESA_ID)
type Movimiento = {
  id: string;
  corte_id: string;
  fecha_hora: string | null;
  tipo: string | null;
  monto: number | null;
  nota: string | null;
  registrado_por: string | null;
  c_corte_desc: string | null;
};

// rdb.v_cortes_productos row shape — per-product aggregates per corte
type CorteProducto = {
  corte_id: string | null;
  product_id: string | null;
  producto_nombre: string | null;
  cantidad_vendida: number | null;
  importe_total: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Matamoros';

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [yyyy, mm, dd] = ts.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  const cleanTs = ts.replace(' ', 'T');
  const d = new Date(cleanTs);

  if (isNaN(d.getTime())) return ts;

  return d
    .toLocaleString('es-MX', {
      timeZone: 'America/Matamoros',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', ' -');
}

function formatDate(ts: string | null | undefined) {
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

function todayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

function estadoVariant(estado: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (estado?.toLowerCase()) {
    case 'cerrado':
    case 'closed':
      return 'default';
    case 'abierto':
    case 'open':
      return 'secondary';
    default:
      return 'outline';
  }
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ cortes }: { cortes: Corte[] }) {
  const totalInicial = cortes.reduce((s, c) => s + (c.efectivo_inicial ?? 0), 0);
  const totalContado = cortes.reduce((s, c) => s + (c.efectivo_contado ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Scissors className="h-3.5 w-3.5" />
          Cortes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{cortes.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Fondo Inicial
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalInicial)}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3 col-span-2 sm:col-span-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Efectivo Contado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalContado)}
        </div>
      </div>
    </div>
  );
}

// ─── Corte Detail Drawer ──────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function CorteDetail({
  corte,
  totales,
  movimientos,
  loadingDetail,
  open,
  onClose,
  onCerrar,
}: {
  corte: Corte | null;
  totales: CorteTotales | null;
  movimientos: Movimiento[];
  loadingDetail: boolean;
  open: boolean;
  onClose: () => void;
  onCerrar: (corte: Corte) => void;
}) {
  if (!corte) return null;
  const estaAbierto = corte.estado?.toLowerCase() === 'abierto';
  const efectivoEsperado = totales?.efectivo_esperado ?? corte.efectivo_esperado ?? 0;
  const efectivoContado = corte.efectivo_contado ?? 0;
  const diferencia = efectivoContado - efectivoEsperado;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[600px]">
        {/* ── MARBETE DE IMPRESIÓN ──────────────────────────── */}
        <div className="hidden print:block mb-6 text-sm">
          <div className="flex items-start justify-between border-b pb-3 mb-4">
            <div>
              <div className="text-lg font-bold">Rincón del Bosque</div>
              <div className="text-xs text-gray-500">Corte de Caja</div>
            </div>
            <div className="text-right">
              <div className="text-base font-semibold">{corte.corte_nombre ?? corte.id}</div>
              <div className="text-xs text-gray-500">{formatDateTime(corte.hora_inicio)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
            <div>
              <span className="text-gray-500">Caja:</span> <strong>{corte.caja_nombre}</strong>
            </div>
            <div>
              <span className="text-gray-500">Estado:</span> <strong>{corte.estado}</strong>
            </div>
            <div>
              <span className="text-gray-500">Apertura:</span> {formatDateTime(corte.hora_inicio)}
            </div>
            <div>
              <span className="text-gray-500">Cierre:</span> {formatDateTime(corte.hora_fin)}
            </div>
            <div>
              <span className="text-gray-500">Responsable:</span>{' '}
              {corte.responsable_apertura ?? '—'}
            </div>
            <div>
              <span className="text-gray-500">Pedidos:</span> {corte.pedidos_count ?? '—'}
            </div>
          </div>
          {/* INGRESOS */}
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-2">
            Ingresos
          </div>
          <table className="w-full border-collapse text-xs mb-1">
            <tbody>
              <tr className="border-t">
                <td className="py-0.5 text-gray-500">Efectivo inicial</td>
                <td className="text-right font-medium">{formatCurrency(corte.efectivo_inicial)}</td>
              </tr>
              <tr className="border-t">
                <td className="py-0.5 text-gray-500">Ingresos efectivo</td>
                <td className="text-right font-medium">
                  {formatCurrency(totales?.ingresos_efectivo)}
                </td>
              </tr>
              {(totales?.ingresos_tarjeta ?? 0) !== 0 && (
                <tr className="border-t">
                  <td className="py-0.5 text-gray-500">Ingresos tarjeta</td>
                  <td className="text-right font-medium">
                    {formatCurrency(totales?.ingresos_tarjeta)}
                  </td>
                </tr>
              )}
              {(totales?.ingresos_stripe ?? 0) !== 0 && (
                <tr className="border-t">
                  <td className="py-0.5 text-gray-500">Ingresos Stripe</td>
                  <td className="text-right font-medium">
                    {formatCurrency(totales?.ingresos_stripe)}
                  </td>
                </tr>
              )}
              {(totales?.ingresos_transferencias ?? 0) !== 0 && (
                <tr className="border-t">
                  <td className="py-0.5 text-gray-500">Transferencias</td>
                  <td className="text-right font-medium">
                    {formatCurrency(totales?.ingresos_transferencias)}
                  </td>
                </tr>
              )}
              {(totales?.depositos ?? 0) !== 0 && (
                <tr className="border-t">
                  <td className="py-0.5 text-gray-500">Depósitos</td>
                  <td className="text-right font-medium">{formatCurrency(totales?.depositos)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-400 font-semibold">
                <td className="py-1">Total ingresos</td>
                <td className="text-right">{formatCurrency(totales?.total_ingresos)}</td>
              </tr>
            </tbody>
          </table>

          {/* EGRESOS / MOVIMIENTOS DE CAJA */}
          {movimientos.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
                Egresos / Movimientos de caja
              </div>
              <table className="w-full border-collapse text-xs mb-1">
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="py-0.5">
                        <span className="text-gray-700 capitalize">{m.nota || m.tipo}</span>
                        <span className="block text-gray-400 text-[10px]">
                          {formatDate(m.fecha_hora)}
                        </span>
                      </td>
                      <td className="text-right font-medium text-red-700">
                        {formatCurrency(m.monto)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-400 font-semibold">
                    <td className="py-1">Total egresos</td>
                    <td className="text-right text-red-700">
                      {formatCurrency(movimientos.reduce((s, m) => s + (m.monto ?? 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* CIERRE */}
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
            Cierre
          </div>
          <table className="w-full border-collapse text-xs mb-4">
            <tbody>
              <tr className="border-t">
                <td className="py-0.5 text-gray-500">Efectivo esperado</td>
                <td className="text-right font-medium">{formatCurrency(efectivoEsperado)}</td>
              </tr>
              <tr className="border-t">
                <td className="py-0.5 text-gray-500">Efectivo contado</td>
                <td className="text-right font-medium">{formatCurrency(corte.efectivo_contado)}</td>
              </tr>
              <tr className="border-t border-gray-400 font-semibold">
                <td className="py-1">Diferencia</td>
                <td
                  className={`text-right ${diferencia > 0 ? 'text-green-700' : diferencia < 0 ? 'text-red-700' : ''}`}
                >
                  {diferencia !== 0 ? formatCurrency(diferencia) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-8 text-xs">
            <div>
              <div className="border-t border-gray-400 mt-8 pt-1 text-center text-gray-500">
                Responsable de apertura
              </div>
            </div>
            <div>
              <div className="border-t border-gray-400 mt-8 pt-1 text-center text-gray-500">
                Responsable de cierre
              </div>
            </div>
          </div>
        </div>

        {/* ── HEADER (pantalla) ──────────────────────────────── */}
        <SheetHeader className="print:hidden">
          <SheetTitle>{corte.corte_nombre ?? `Corte ${corte.id}`}</SheetTitle>
          <SheetDescription>
            {corte.caja_nombre ?? '—'} · {formatDateTime(corte.hora_inicio)} a{' '}
            {formatDateTime(corte.hora_fin)}
          </SheetDescription>
          <div className="absolute right-12 top-4 flex gap-2 print:hidden">
            {estaAbierto && (
              <Button variant="destructive" size="sm" onClick={() => onCerrar(corte)}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Cerrar Corte
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Marbete
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            {/* Estado + responsable */}
            <div className="flex items-center justify-between">
              <Badge variant={estadoVariant(corte.estado)}>{corte.estado ?? 'Sin estado'}</Badge>
              <span className="text-sm text-muted-foreground">
                {corte.responsable_apertura ?? corte.responsable_cierre ?? ''}
              </span>
            </div>

            {/* Horario */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs text-muted-foreground">Apertura</span>
                <span className="font-medium">{formatDate(corte.hora_inicio)}</span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Cierre</span>
                <span className="font-medium">{formatDate(corte.hora_fin)}</span>
              </div>
              {corte.turno && (
                <div>
                  <span className="block text-xs text-muted-foreground">Turno</span>
                  <span className="font-medium">{corte.turno}</span>
                </div>
              )}
              {corte.tipo && (
                <div>
                  <span className="block text-xs text-muted-foreground">Tipo</span>
                  <span className="font-medium">{corte.tipo}</span>
                </div>
              )}
            </div>

            {corte.observaciones && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
                <span className="mb-1 block font-semibold">Observaciones</span>
                {corte.observaciones}
              </div>
            )}

            <Separator />

            {/* Resumen Financiero */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resumen Financiero
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : totales ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo inicial</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.efectivo_inicial)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos efectivo</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_efectivo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos tarjeta</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_tarjeta)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos Stripe</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_stripe)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencias</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_transferencias)}
                    </span>
                  </div>
                  {(totales.depositos ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Depósitos</span>
                      <span className="font-medium tabular-nums text-emerald-500">
                        {formatCurrency(totales.depositos)}
                      </span>
                    </div>
                  )}
                  {(totales.retiros ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retiros</span>
                      <span className="font-medium tabular-nums text-destructive">
                        {formatCurrency(totales.retiros)}
                      </span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>Total ingresos</span>
                    <span className="tabular-nums">{formatCurrency(totales.total_ingresos)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Efectivo esperado</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(totales.efectivo_esperado)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos de totales.</p>
              )}
            </div>

            <Separator />

            {/* Movimientos — placeholder */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Movimientos
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : movimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {movimientos.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-4">
                      <div>
                        <span className="font-medium capitalize">{m.tipo ?? 'Movimiento'}</span>
                        {m.nota && (
                          <span className="block text-xs text-muted-foreground">{m.nota}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(m.fecha_hora)}
                          {m.registrado_por ? ` · ${m.registrado_por}` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(m.monto)}
                      </span>
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

// ─── Filters ──────────────────────────────────────────────────────────────────

const ESTADO_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'abierto', label: 'Abierto' },
  { value: 'cerrado', label: 'Cerrado' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

type Caja = { id: string; nombre: string };

export default function CortesPage() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_cortes', preset);
    if (!preset) return;
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
  const [selected, setSelected] = useState<Corte | null>(null);
  const [selectedTotales, setSelectedTotales] = useState<CorteTotales | null>(null);
  const [selectedMovimientos, setSelectedMovimientos] = useState<Movimiento[]>([]);
  const [selectedProductos, setSelectedProductos] = useState<CorteProducto[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Abrir Caja dialog state ──────────────────────────────────────────────
  const [abrirOpen, setAbrirOpen] = useState(false);
  const DENOMINACIONES_DEFAULT: Denominacion[] = [
    { denominacion: 1000, tipo: 'billete', cantidad: 0 },
    { denominacion: 500, tipo: 'billete', cantidad: 0 },
    { denominacion: 200, tipo: 'billete', cantidad: 0 },
    { denominacion: 100, tipo: 'billete', cantidad: 0 },
    { denominacion: 50, tipo: 'billete', cantidad: 0 },
    { denominacion: 20, tipo: 'billete', cantidad: 0 },
    { denominacion: 10, tipo: 'moneda', cantidad: 0 },
    { denominacion: 5, tipo: 'moneda', cantidad: 0 },
    { denominacion: 2, tipo: 'moneda', cantidad: 0 },
    { denominacion: 1, tipo: 'moneda', cantidad: 0 },
    { denominacion: 0.5, tipo: 'moneda', cantidad: 0 },
  ];

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarCorte, setCerrarCorte] = useState<Corte | null>(null);
  const [cerrarDenom, setCerrarDenom] = useState<Denominacion[]>(DENOMINACIONES_DEFAULT);
  const [cerrarObs, setCerrarObs] = useState('');
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loadingCajas, setLoadingCajas] = useState(false);
  const [abrirForm, setAbrirForm] = useState({
    caja_id: '',
    responsable_apertura: '',
    efectivo_inicial: '',
    fecha_operativa: todayRange().from,
    auto_matched: false,
  });
  const [abrirError, setAbrirError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_cortes');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

  const fetchCortes = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      let query = supabase
        .schema('rdb')
        .from('v_cortes_lista')
        .select('*')
        .order('fecha_operativa', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(300);

      if (dateFrom) query = query.gte('fecha_operativa', dateFrom);
      if (dateTo) query = query.lte('fecha_operativa', dateTo);

      const { data, error: err } = await query;
      if (err) throw err;
      setCortes((data ?? []) as Corte[]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Error al cargar cortes');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchCortes();
  }, [fetchCortes]);

  const openDetail = async (corte: Corte) => {
    setSelected(corte);
    setSelectedTotales(null);
    setSelectedMovimientos([]);
    setDrawerOpen(true);
    setLoadingDetail(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const [totalesRes, movimientosRes, productosRes] = await Promise.all([
        supabase
          .schema('rdb')
          .from('v_cortes_totales')
          .select('*')
          .eq('corte_id', corte.id)
          .maybeSingle(),
        supabase
          .schema('erp')
          .from('movimientos_caja')
          .select(
            'id,corte_id,fecha_hora:created_at,tipo,monto,nota:concepto,registrado_por:referencia'
          )
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('corte_id', corte.id)
          .order('created_at', { ascending: true })
          .limit(100),
        // B.1.extra.b: `rdb.v_cortes_productos` — per-product aggregates per corte
        // (RDB / Waitry POS). Joins rdb.waitry_productos ↔ rdb.waitry_pedidos via
        // the corte_id FK (partial index `rdb_waitry_pedidos_corte_id_idx`).
        // Created 2026-04-17, security_invoker = true.
        supabase
          .schema('rdb')
          .from('v_cortes_productos')
          .select('*')
          .eq('corte_id', corte.id)
          .order('importe_total', { ascending: false })
          .limit(100),
      ]);

      setSelectedTotales((totalesRes.data as CorteTotales | null) ?? null);
      setSelectedMovimientos((movimientosRes.data ?? []) as Movimiento[]);
      setSelectedProductos((productosRes?.data ?? []) as CorteProducto[]);
    } catch {
      // non-fatal — drawer still shows corte base info
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = cortes.filter((c) => {
    if (estadoFilter !== 'all' && c.estado?.toLowerCase() !== estadoFilter) return false;
    return true;
  });

  async function openAbrirDialog() {
    setAbrirOpen(true);
    setAbrirError(null);
    setLoadingCajas(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.email || '';
      const firstName = userName.split(' ')[0] || '';

      const { data, error: err } = await supabase
        .schema('erp')
        .from('cajas')
        .select('id, nombre')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('nombre');
      if (err) throw err;

      const cajasList = (data ?? []) as Caja[];
      setCajas(cajasList);

      const matchedCaja = cajasList.find((c) =>
        c.nombre.toLowerCase().includes(firstName.toLowerCase())
      );

      setAbrirForm((f) => ({
        ...f,
        responsable_apertura: userName,
        caja_id: matchedCaja?.id ?? '',
        fecha_operativa: todayRange().from,
        auto_matched: !!matchedCaja,
      }));
    } catch {
      // non-fatal
    } finally {
      setLoadingCajas(false);
    }
  }

  function handleAbrirSubmit() {
    setAbrirError(null);
    const selectedCaja = cajas.find((c) => c.id === abrirForm.caja_id);
    if (!abrirForm.caja_id) {
      setAbrirError('Selecciona una caja.');
      return;
    }
    if (!abrirForm.responsable_apertura.trim()) {
      setAbrirError('Ingresa el nombre del responsable de apertura.');
      return;
    }

    startTransition(async () => {
      try {
        await abrirCaja({
          caja_id: abrirForm.caja_id,
          caja_nombre: selectedCaja?.nombre ?? abrirForm.caja_id,
          responsable_apertura: abrirForm.responsable_apertura.trim(),
          efectivo_inicial: parseFloat(abrirForm.efectivo_inicial) || 0,
          fecha_operativa: abrirForm.fecha_operativa || todayRange().from,
        });
        setAbrirOpen(false);
        setAbrirForm({
          caja_id: '',
          responsable_apertura: '',
          efectivo_inicial: '',
          fecha_operativa: todayRange().from,
          auto_matched: false,
        });
        void fetchCortes();
      } catch (err) {
        setAbrirError(err instanceof Error ? err.message : 'Error al abrir la caja');
      }
    });
  }

  function openCerrarDialog(corte: Corte) {
    setCerrarCorte(corte);
    setCerrarDenom(DENOMINACIONES_DEFAULT.map((d) => ({ ...d, cantidad: 0 })));
    setCerrarObs('');
    setCerrarError(null);
    setCerrarOpen(true);
    setDrawerOpen(false);
  }

  function updateCantidad(idx: number, val: string) {
    const n = parseInt(val) || 0;
    setCerrarDenom((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, cantidad: Math.max(0, n) } : d))
    );
  }

  function handleCerrarSubmit() {
    if (!cerrarCorte) return;
    setCerrarError(null);
    startTransition(async () => {
      try {
        await cerrarCaja({
          corte_id: cerrarCorte.id,
          denominaciones: cerrarDenom,
          observaciones: cerrarObs.trim() || undefined,
        });
        setCerrarOpen(false);
        setCerrarCorte(null);
        void fetchCortes();
      } catch (err) {
        setCerrarError(err instanceof Error ? err.message : 'Error al cerrar el corte');
      }
    });
  }

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('created_at', 'desc');
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cortes">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cortes de Caja</h1>
            <p className="text-sm text-muted-foreground">Turnos registrados en RDB</p>
          </div>
          <Button onClick={() => void openAbrirDialog()} className="shrink-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            Abrir Caja
          </Button>
        </div>

        {/* Summary */}
        {!loading && !error && <SummaryBar cortes={filtered} />}

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <Select value={estadoFilter} onValueChange={(v) => setEstadoFilter(v ?? 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_OPTIONS.map((opt) => (
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
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPresetKey('custom');
              }}
              className="w-36"
              aria-label="Fecha desde"
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
              <SelectItem value="custom" className="hidden">
                Personalizado
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchCortes()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <span className="text-sm text-muted-foreground">
            {loading ? 'Cargando…' : `${filtered.length} corte${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="caja_nombre"
                  label="Caja"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <SortableHead
                  sortKey="corte_nombre"
                  label="Corte"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <SortableHead
                  sortKey="hora_inicio"
                  label="Inicio"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <SortableHead
                  sortKey="hora_fin"
                  label="Fin"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <SortableHead
                  sortKey="pedidos_count"
                  label="Pedidos"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <SortableHead
                  sortKey="estado"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="whitespace-nowrap"
                />
                <TableHead className="text-right whitespace-nowrap">Efectivo</TableHead>
                <TableHead className="text-right whitespace-nowrap">Tarjeta</TableHead>
                <TableHead className="text-right whitespace-nowrap">Stripe</TableHead>
                <TableHead className="text-right whitespace-nowrap">Transf.</TableHead>
                <SortableHead
                  sortKey="total_ingresos"
                  label="Total"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right whitespace-nowrap"
                />
                <TableHead className="text-right whitespace-nowrap">Ef. Esperado</TableHead>
                <TableHead className="text-right whitespace-nowrap">Movimientos</TableHead>
                <TableHead className="text-right whitespace-nowrap">Ef. Contado</TableHead>
                <TableHead className="text-right whitespace-nowrap">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 13 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="py-12 text-center text-muted-foreground">
                    No se encontraron cortes para el rango seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                sortData(filtered).map((corte) => {
                  const movimientosNeto = (corte.depositos ?? 0) - (corte.retiros ?? 0);
                  const diferencia =
                    corte.efectivo_contado != null
                      ? corte.efectivo_contado - (corte.efectivo_esperado ?? 0)
                      : null;
                  return (
                    <TableRow
                      key={corte.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => void openDetail(corte)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {corte.caja_nombre ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {corte.corte_nombre || `Corte-${corte.id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(corte.hora_inicio)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(corte.hora_fin)}
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        {corte.pedidos_count ?? 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant={estadoVariant(corte.estado)}>{corte.estado ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency(corte.ingresos_efectivo)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency(corte.ingresos_tarjeta)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency(corte.ingresos_stripe)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency(corte.ingresos_transferencias)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatCurrency(corte.total_ingresos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {(corte.efectivo_esperado ?? 0) !== 0
                          ? formatCurrency(corte.efectivo_esperado)
                          : '—'}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums whitespace-nowrap ${
                          movimientosNeto > 0
                            ? 'text-emerald-600'
                            : movimientosNeto < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {movimientosNeto !== 0 ? formatCurrency(movimientosNeto) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {corte.efectivo_contado != null
                          ? formatCurrency(corte.efectivo_contado)
                          : '—'}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums whitespace-nowrap ${
                          diferencia == null
                            ? ''
                            : diferencia > 0
                              ? 'text-emerald-600'
                              : diferencia < 0
                                ? 'text-destructive'
                                : ''
                        }`}
                      >
                        {diferencia == null || diferencia === 0 ? '—' : formatCurrency(diferencia)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Detail drawer */}
        <CorteDetail
          corte={selected}
          totales={selectedTotales}
          movimientos={selectedMovimientos}
          loadingDetail={loadingDetail}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCerrar={openCerrarDialog}
        />

        {/* Cerrar Corte dialog */}
        <Dialog
          open={cerrarOpen}
          onOpenChange={(v) => {
            if (!v) setCerrarOpen(false);
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Cerrar Corte — Conteo de Efectivo</DialogTitle>
              <DialogDescription>
                {cerrarCorte?.corte_nombre} · {cerrarCorte?.caja_nombre}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4 py-2">
                {/* Referencia */}
                <div className="grid grid-cols-2 gap-3 text-sm border bg-muted/30 p-3 rounded-lg">
                  <div>
                    <div className="text-xs text-muted-foreground">Efectivo esperado</div>
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(cerrarCorte?.efectivo_esperado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total sistema</div>
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(cerrarCorte?.total_ingresos)}
                    </div>
                  </div>
                </div>

                {/* Billetes */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Billetes
                  </div>
                  <div className="space-y-1.5">
                    {cerrarDenom
                      .filter((d) => d.tipo === 'billete')
                      .map((d, i) => {
                        const idx = cerrarDenom.findIndex((x) => x.denominacion === d.denominacion);
                        return (
                          <div key={d.denominacion} className="flex items-center gap-3">
                            <div className="w-20 text-sm font-medium tabular-nums text-right">
                              {formatCurrency(d.denominacion)}
                            </div>
                            <span className="text-muted-foreground text-sm">×</span>
                            <Input
                              type="number"
                              min="0"
                              value={d.cantidad || ''}
                              onChange={(e) => updateCantidad(idx, e.target.value)}
                              placeholder="0"
                              className="w-20 text-center tabular-nums"
                            />
                            <span className="text-muted-foreground text-sm">=</span>
                            <div className="w-24 text-sm tabular-nums text-right font-medium">
                              {d.cantidad > 0 ? formatCurrency(d.denominacion * d.cantidad) : '—'}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <Separator />

                {/* Monedas */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Monedas
                  </div>
                  <div className="space-y-1.5">
                    {cerrarDenom
                      .filter((d) => d.tipo === 'moneda')
                      .map((d) => {
                        const idx = cerrarDenom.findIndex((x) => x.denominacion === d.denominacion);
                        return (
                          <div key={d.denominacion} className="flex items-center gap-3">
                            <div className="w-20 text-sm font-medium tabular-nums text-right">
                              {formatCurrency(d.denominacion)}
                            </div>
                            <span className="text-muted-foreground text-sm">×</span>
                            <Input
                              type="number"
                              min="0"
                              value={d.cantidad || ''}
                              onChange={(e) => updateCantidad(idx, e.target.value)}
                              placeholder="0"
                              className="w-20 text-center tabular-nums"
                            />
                            <span className="text-muted-foreground text-sm">=</span>
                            <div className="w-24 text-sm tabular-nums text-right font-medium">
                              {d.cantidad > 0 ? formatCurrency(d.denominacion * d.cantidad) : '—'}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <Separator />

                {/* Total contado */}
                {(() => {
                  const total = cerrarDenom.reduce((s, d) => s + d.denominacion * d.cantidad, 0);
                  const esperado = cerrarCorte?.efectivo_esperado ?? 0;
                  const diff = total - esperado;
                  return (
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Total contado</span>
                        <span className="font-bold tabular-nums text-base">
                          {formatCurrency(total)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Diferencia vs. esperado</span>
                        <span
                          className={`font-semibold tabular-nums ${
                            diff === 0
                              ? 'text-muted-foreground'
                              : diff > 0
                                ? 'text-emerald-600'
                                : 'text-destructive'
                          }`}
                        >
                          {diff === 0 ? '—' : formatCurrency(diff)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Observaciones */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Observaciones (opcional)
                  </label>
                  <Input
                    value={cerrarObs}
                    onChange={(e) => setCerrarObs(e.target.value)}
                    placeholder="Ej: Faltante por rollo de monedas..."
                  />
                </div>

                {cerrarError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {cerrarError}
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setCerrarOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleCerrarSubmit} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cerrando…
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Confirmar cierre
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Abrir Caja dialog */}
        <Dialog
          open={abrirOpen}
          onOpenChange={(v) => {
            if (!v) setAbrirOpen(false);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Abrir Caja</DialogTitle>
              <DialogDescription>
                Registra la apertura de un nuevo turno de caja. Se verificará que no haya un turno
                abierto para la caja seleccionada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm border bg-muted/30 p-3 rounded-lg">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Responsable
                  </div>
                  <div className="font-medium text-foreground">
                    {abrirForm.responsable_apertura || '—'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Fecha Operativa
                  </div>
                  <div className="font-medium text-foreground">{abrirForm.fecha_operativa}</div>
                </div>
                <div className="space-y-1 col-span-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Caja Asignada
                  </div>
                  {abrirForm.auto_matched ? (
                    <div className="font-medium text-foreground">
                      {cajas.find((c) => c.id === abrirForm.caja_id)?.nombre || '—'}
                    </div>
                  ) : (
                    <Select
                      value={abrirForm.caja_id}
                      onValueChange={(v) => setAbrirForm((f) => ({ ...f, caja_id: v ?? '' }))}
                    >
                      <SelectTrigger className="h-8 mt-1 border-muted-foreground/30 bg-background">
                        <SelectValue placeholder="Selecciona tu caja…" />
                      </SelectTrigger>
                      <SelectContent>
                        {cajas.map((caja) => (
                          <SelectItem key={caja.id} value={caja.id}>
                            {caja.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Efectivo inicial
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={abrirForm.efectivo_inicial}
                    onChange={(e) =>
                      setAbrirForm((f) => ({ ...f, efectivo_inicial: e.target.value }))
                    }
                    placeholder="0.00"
                    className="pl-7 text-lg font-medium"
                    autoFocus
                  />
                </div>
              </div>

              {abrirError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {abrirError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAbrirOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleAbrirSubmit} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Abriendo…
                  </>
                ) : (
                  <>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Abrir turno
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAccess>
  );
}
