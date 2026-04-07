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
import { CalendarDays, RefreshCw, Scissors, TrendingUp, Wallet, PlusCircle } from 'lucide-react';

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

// rdb.movimientos columns
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Matamoros';

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  // date-only (YYYY-MM-DD) — parse without time to avoid TZ shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [yyyy, mm, dd] = ts.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  // timestamp — strip offset suffix, parse as local wall-clock
  const clean = ts.replace(/\+\d{2}(:\d{2})?$/, '').replace('Z', '').replace('T', ' ');
  const parts = clean.split(' ');
  if (parts.length < 2) return clean;
  const [yyyy, mm, dd] = parts[0].split('-');
  const [hh, min] = parts[1].split(':');
  return `${dd}/${mm}/${yyyy.slice(2)}, ${hh}:${min}`;
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

function estadoVariant(
  estado: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
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
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(totalInicial)}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3 col-span-2 sm:col-span-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Efectivo Contado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(totalContado)}</div>
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
}: {
  corte: Corte | null;
  totales: CorteTotales | null;
  movimientos: Movimiento[];
  loadingDetail: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!corte) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col data-[side=right]:sm:max-w-xl data-[side=right]:md:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{corte.corte_nombre ?? `Corte ${corte.id}`}</SheetTitle>
          <SheetDescription>
            {corte.caja_nombre ?? '—'} · {formatDate(corte.fecha_operativa)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">

            {/* Estado + responsable */}
            <div className="flex items-center justify-between">
              <Badge variant={estadoVariant(corte.estado)}>
                {corte.estado ?? 'Sin estado'}
              </Badge>
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
                    <span className="font-medium tabular-nums">{formatCurrency(totales.efectivo_inicial)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos efectivo</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totales.ingresos_efectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos tarjeta</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totales.ingresos_tarjeta)}</span>
                  </div>
                  {(totales.ingresos_stripe ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ingresos Stripe</span>
                      <span className="font-medium tabular-nums">{formatCurrency(totales.ingresos_stripe)}</span>
                    </div>
                  )}
                  {(totales.ingresos_transferencias ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transferencias</span>
                      <span className="font-medium tabular-nums">{formatCurrency(totales.ingresos_transferencias)}</span>
                    </div>
                  )}
                  {(totales.depositos ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Depósitos</span>
                      <span className="font-medium tabular-nums text-emerald-500">{formatCurrency(totales.depositos)}</span>
                    </div>
                  )}
                  {(totales.retiros ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retiros</span>
                      <span className="font-medium tabular-nums text-destructive">{formatCurrency(totales.retiros)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>Total ingresos</span>
                    <span className="tabular-nums">{formatCurrency(totales.total_ingresos)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Efectivo esperado</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(totales.efectivo_esperado)}</span>
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
                      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(m.monto)}</span>
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

export default function CortesPage() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [selected, setSelected] = useState<Corte | null>(null);
  const [selectedTotales, setSelectedTotales] = useState<CorteTotales | null>(null);
  const [selectedMovimientos, setSelectedMovimientos] = useState<Movimiento[]>([]);
  const [selectedProductos, setSelectedProductos] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCortes = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      let query = supabase
        .schema('caja')
        .from('cortes')
        .select(
          'id, corte_nombre, caja_nombre, caja_id, fecha_operativa, hora_inicio, hora_fin, estado, efectivo_inicial, efectivo_contado, responsable_apertura, responsable_cierre, turno, tipo, observaciones',
        )
        .order('fecha_operativa', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(300);

      if (dateFrom) query = query.gte('fecha_operativa', dateFrom);
      if (dateTo) query = query.lte('fecha_operativa', dateTo);

      const { data, error: err } = await query;
      if (err) throw err;
      setCortes((data ?? []) as Corte[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar cortes');
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
          .schema('caja')
          .from('v_cortes_totales')
          .select('*')
          .eq('corte_id', corte.id)
          .maybeSingle(),
        supabase
          .schema('caja')
          .from('movimientos')
          .select('*')
          .eq('corte_id', corte.id)
          .order('fecha_hora', { ascending: true })
          .limit(100),
        supabase
          .schema('caja')
          .from('v_cortes_productos')
          .select('*')
          .eq('corte_id', corte.id)
          .order('importe_total', { ascending: false })
          .limit(100),
      ]);

      setSelectedTotales((totalesRes.data as CorteTotales | null) ?? null);
      setSelectedMovimientos((movimientosRes.data ?? []) as Movimiento[]);
      setSelectedProductos((productosRes?.data ?? []) as any[]);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cortes de Caja</h1>
          <p className="text-sm text-muted-foreground">Turnos registrados en RDB</p>
        </div>
        <Button
          onClick={() => alert('Función "Abrir Caja" próximamente disponible.')}
          className="shrink-0"
        >
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
          onClick={() => void fetchCortes()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} corte${filtered.length !== 1 ? 's' : ''}`}
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
              <TableHead>Caja</TableHead>
              <TableHead>Corte</TableHead>
              <TableHead>Fecha Operativa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Efectivo Contado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
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
                  No se encontraron cortes para el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((corte) => (
                <TableRow
                  key={corte.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openDetail(corte)}
                >
                  <TableCell className="font-medium">{corte.caja_nombre ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {corte.corte_nombre ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(corte.fecha_operativa)}</TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant(corte.estado)}>
                      {corte.estado ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(corte.efectivo_contado)}
                  </TableCell>
                </TableRow>
              ))
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
      />
    </div>
  );
}
