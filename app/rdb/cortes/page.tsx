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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, RefreshCw, Scissors, TrendingUp, DollarSign } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Corte = {
  id: number | string;
  // flexible column names — Waitry schema may differ
  fecha?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  created_at?: string | null;
  turno?: string | number | null;
  cajero?: string | null;
  cajero_nombre?: string | null;
  nombre_cajero?: string | null;
  total_ventas?: number | null;
  ventas_total?: number | null;
  total?: number | null;
  efectivo_esperado?: number | null;
  efectivo_contado?: number | null;
  diferencia?: number | null;
  estado?: string | null;
  status?: string | null;
  // raw for unknown columns
  [key: string]: unknown;
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

function getCorteDate(c: Corte): string | null {
  return c.fecha ?? c.fecha_inicio ?? c.created_at ?? null;
}

function getTotal(c: Corte): number | null {
  return c.total_ventas ?? c.ventas_total ?? c.total ?? null;
}

function getCajero(c: Corte): string {
  return String(c.cajero ?? c.cajero_nombre ?? c.nombre_cajero ?? '—');
}

function getEstado(c: Corte): string | null {
  return c.estado ?? c.status ?? null;
}

function statusVariant(
  status: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'cerrado':
    case 'closed':
    case 'completado':
      return 'default';
    case 'abierto':
    case 'open':
      return 'secondary';
    case 'cancelado':
      return 'destructive';
    default:
      return 'outline';
  }
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ cortes }: { cortes: Corte[] }) {
  const totalVentas = cortes.reduce((acc, c) => acc + (getTotal(c) ?? 0), 0);
  const diferenciaNeta = cortes.reduce((acc, c) => acc + (c.diferencia ?? 0), 0);

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
          <TrendingUp className="h-3.5 w-3.5" />
          Total Ventas
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(totalVentas)}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3 sm:col-span-1 col-span-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          Diferencia Neta
        </div>
        <div
          className={[
            'mt-1 text-2xl font-semibold tabular-nums',
            diferenciaNeta < 0 ? 'text-destructive' : diferenciaNeta > 0 ? 'text-emerald-500' : '',
          ].join(' ')}
        >
          {formatCurrency(diferenciaNeta)}
        </div>
      </div>
    </div>
  );
}

// ─── Corte Detail Drawer ──────────────────────────────────────────────────────

function CorteDetail({
  corte,
  open,
  onClose,
}: {
  corte: Corte | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!corte) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Cajero', value: getCajero(corte) },
    { label: 'Turno', value: corte.turno != null ? String(corte.turno) : '—' },
    { label: 'Apertura', value: formatDate(corte.fecha_inicio ?? corte.fecha ?? corte.created_at) },
    { label: 'Cierre', value: formatDate(corte.fecha_fin) },
    { label: 'Total ventas', value: formatCurrency(getTotal(corte)) },
    { label: 'Efectivo esperado', value: formatCurrency(corte.efectivo_esperado) },
    { label: 'Efectivo contado', value: formatCurrency(corte.efectivo_contado) },
    { label: 'Diferencia', value: formatCurrency(corte.diferencia) },
  ].filter((r) => r.value !== '—' || ['Total ventas', 'Cajero'].includes(r.label));

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Corte #{String(corte.id)}</SheetTitle>
          <SheetDescription>{formatDate(getCorteDate(corte))}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">
            <div className="flex items-center justify-between">
              <Badge variant={statusVariant(getEstado(corte))}>
                {getEstado(corte) ?? 'Sin estado'}
              </Badge>
              <span className="text-lg font-semibold">{formatCurrency(getTotal(corte))}</span>
            </div>

            <Separator />

            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span
                    className={[
                      'font-medium',
                      row.label === 'Diferencia' && corte.diferencia != null
                        ? corte.diferencia < 0
                          ? 'text-destructive'
                          : corte.diferencia > 0
                          ? 'text-emerald-500'
                          : ''
                        : '',
                    ].join(' ')}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CortesPage() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [selected, setSelected] = useState<Corte | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCortes = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      // Try waitry.cortes first; fall back to waitry.cortes_caja if needed.
      let query = supabase
        .schema('waitry')
        .from('cortes')
        .select('*')
        .order('id', { ascending: false })
        .limit(200);

      // Date filter — try multiple column names via OR
      if (dateFrom) {
        query = query.gte('fecha', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('fecha', `${dateTo}T23:59:59`);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setCortes(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar cortes');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchCortes();
  }, [fetchCortes]);

  const openDetail = (corte: Corte) => {
    setSelected(corte);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cortes de Caja</h1>
        <p className="text-sm text-muted-foreground">Resumen de turnos registrados en Waitry</p>
      </div>

      {/* Summary */}
      {!loading && !error && <SummaryBar cortes={cortes} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
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
          {loading ? 'Cargando…' : `${cortes.length} corte${cortes.length !== 1 ? 's' : ''}`}
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
              <TableHead>#</TableHead>
              <TableHead>Fecha / Apertura</TableHead>
              <TableHead>Cajero</TableHead>
              <TableHead className="text-right">Total Ventas</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
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
            ) : cortes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No se encontraron cortes para el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              cortes.map((corte) => {
                const diff = corte.diferencia ?? null;
                return (
                  <TableRow
                    key={String(corte.id)}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(corte)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      #{String(corte.id)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(getCorteDate(corte))}
                    </TableCell>
                    <TableCell className="text-sm">{getCajero(corte)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(getTotal(corte))}
                    </TableCell>
                    <TableCell
                      className={[
                        'text-right font-medium tabular-nums',
                        diff != null
                          ? diff < 0
                            ? 'text-destructive'
                            : diff > 0
                            ? 'text-emerald-500'
                            : ''
                          : '',
                      ].join(' ')}
                    >
                      {formatCurrency(diff)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(getEstado(corte))}>
                        {getEstado(corte) ?? '—'}
                      </Badge>
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
