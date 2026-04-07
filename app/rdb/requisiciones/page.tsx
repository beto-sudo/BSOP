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
import { CalendarDays, ClipboardList, RefreshCw, Search } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Requisicion = {
  id: string;
  folio: string;
  estatus: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'convertida';
  solicitado_por: string | null;
  aprobado_por: string | null;
  fecha_solicitud: string | null;
  fecha_necesidad: string | null;
  notas: string | null;
  created_at: string | null;
  // lazy-loaded
  items?: RequisicionItem[];
};

type RequisicionItem = {
  id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  notas: string | null;
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

function formatDateShort(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-MX', {
    timeZone: TZ,
    dateStyle: 'short',
  });
}

type EstatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const ESTATUS_VARIANT: Record<Requisicion['estatus'], EstatusVariant> = {
  borrador: 'outline',
  enviada: 'secondary',
  aprobada: 'default',
  rechazada: 'destructive',
  convertida: 'default',
};

const ESTATUS_LABELS: Record<Requisicion['estatus'], string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  convertida: 'Convertida a OC',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'convertida', label: 'Convertida a OC' },
];

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ requisiciones }: { requisiciones: Requisicion[] }) {
  const pendientes = requisiciones.filter((r) =>
    ['borrador', 'enviada'].includes(r.estatus),
  ).length;
  const aprobadas = requisiciones.filter((r) => r.estatus === 'aprobada').length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{requisiciones.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pendientes
        </div>
        <div
          className={[
            'mt-1 text-2xl font-semibold tabular-nums',
            pendientes > 0 ? 'text-amber-500' : '',
          ].join(' ')}
        >
          {pendientes}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Aprobadas
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{aprobadas}</div>
      </div>
    </div>
  );
}

// ─── Requisicion Detail Drawer ────────────────────────────────────────────────

function RequisionDetail({
  requisicion,
  loadingItems,
  open,
  onClose,
}: {
  requisicion: Requisicion | null;
  loadingItems: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!requisicion) return null;
  const items = requisicion.items ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{requisicion.folio}</SheetTitle>
          <SheetDescription>{formatDate(requisicion.fecha_solicitud)}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1">
          <div className="mt-6 space-y-6 pb-6">
            <div className="flex items-center gap-3">
              <Badge variant={ESTATUS_VARIANT[requisicion.estatus]}>
                {ESTATUS_LABELS[requisicion.estatus]}
              </Badge>
              {requisicion.fecha_necesidad && (
                <span className="text-sm text-muted-foreground">
                  Necesario: {formatDateShort(requisicion.fecha_necesidad)}
                </span>
              )}
            </div>

            {requisicion.notas && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                {requisicion.notas}
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artículos solicitados
              </div>
              {loadingItems ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin artículos registrados</p>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <span className="text-foreground">{item.descripcion}</span>
                      <span className="shrink-0 tabular-nums font-medium text-muted-foreground">
                        {item.cantidad} {item.unidad ?? 'pzs'}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RequisicionesPage() {
  const [requisiciones, setRequisiciones] = useState<Requisicion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Requisicion | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchRequisiciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .schema('rdb')
        .from('requisiciones')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (dateFrom) query = query.gte('fecha_solicitud', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('fecha_solicitud', `${dateTo}T23:59:59`);

      const { data, error: err } = await query;
      if (err) throw err;
      setRequisiciones(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar requisiciones');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchRequisiciones();
  }, [fetchRequisiciones]);

  const openDetail = async (req: Requisicion) => {
    setSelected(req);
    setDrawerOpen(true);
    setLoadingItems(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .schema('rdb')
        .from('requisiciones_items')
        .select('*')
        .eq('requisicion_id', req.id);
      setSelected((prev) =>
        prev?.id === req.id ? { ...prev, items: data ?? [] } : prev,
      );
    } catch {
      // non-fatal
    } finally {
      setLoadingItems(false);
    }
  };

  const filtered = requisiciones.filter((r) => {
    if (statusFilter !== 'all' && r.estatus !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.folio.toLowerCase().includes(q) || (r.notas ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requisiciones</h1>
        <p className="text-sm text-muted-foreground">Solicitudes de compra internas</p>
      </div>

      {/* Summary */}
      {!loading && !error && <SummaryBar requisiciones={filtered} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-44">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio…"
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
          onClick={() => void fetchRequisiciones()}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {loading
            ? 'Cargando…'
            : `${filtered.length} requisición${filtered.length !== 1 ? 'es' : ''}`}
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
              <TableHead>Fecha Solicitud</TableHead>
              <TableHead>Fecha Necesidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Notas</TableHead>
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
                  No se encontraron requisiciones.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => (
                <TableRow
                  key={req.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openDetail(req)}
                >
                  <TableCell className="font-mono text-xs font-medium">{req.folio}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(req.fecha_solicitud)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateShort(req.fecha_necesidad)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ESTATUS_VARIANT[req.estatus]}>
                      {ESTATUS_LABELS[req.estatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {req.notas ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail drawer */}
      <RequisionDetail
        requisicion={selected}
        loadingItems={loadingItems}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
