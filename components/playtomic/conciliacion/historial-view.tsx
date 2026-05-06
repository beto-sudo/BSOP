'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unassignPaymentAction } from '@/app/rdb/playtomic/conciliacion/actions';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/components/playtomic/utils';
import { useHistorialData, type HistorialSource } from './use-historial-data';

const FECHA_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const FECHA_CORTA_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
});

/**
 * 'effective' = Online + Waitry (lo verdaderamente trazable, default).
 * 'all'       = todos los canales (auditoría completa, incluye Manager).
 * Resto       = un solo canal.
 *
 * Por default NO mostramos Manager: esos pagos son los que requieren
 * conciliación contra Waitry y aparecen como pendientes en el tab
 * Conciliación con flag ⚠. Si el operador quiere auditar el bulto, puede
 * cambiar el filtro a 'manager' o 'all'.
 */
type SourceFilter = 'effective' | 'all' | HistorialSource;

const SOURCE_LABELS: Record<HistorialSource, string> = {
  online: '🟢 Online',
  manager: '⚠ Manager',
  waitry: '🟦 Waitry',
  other: 'Otro',
};

const SOURCE_BADGE_CLS: Record<HistorialSource, string> = {
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  manager: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  waitry: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  other: 'bg-[var(--panel)]/60 text-[var(--text-muted)] border-[var(--border)]',
};

function isoDateLocal(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { fromIso: string; toIso: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 60);
  return { fromIso: isoDateLocal(from), toIso: isoDateLocal(today) };
}

function formatEventDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return FECHA_FMT.format(d);
}

function formatBookingDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return FECHA_FMT.format(d);
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function HistorialView() {
  const router = useRouter();
  const [fromIso, setFromIso] = useState(() => defaultRange().fromIso);
  const [toIso, setToIso] = useState(() => defaultRange().toIso);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('effective');
  const [resourceFilter, setResourceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUnassigning, startUnassignTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null
  );

  const { events, loading, refreshing, error, refetch } = useHistorialData({ fromIso, toIso });

  const resourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const ev of events) {
      if (ev.resource_name) seen.add(ev.resource_name);
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((name) => ({ value: name, label: name }));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (sourceFilter === 'effective') {
        // Solo lo trazable: Online (CSV App/Web) + Waitry (manual).
        // Manager onsite y Other quedan fuera — esos requieren conciliación.
        if (ev.source !== 'online' && ev.source !== 'waitry') return false;
      } else if (sourceFilter !== 'all' && ev.source !== sourceFilter) {
        return false;
      }
      if (resourceFilter && ev.resource_name !== resourceFilter) return false;
      if (q) {
        const haystack = [
          ev.owner_name ?? '',
          ev.subject ?? '',
          ev.reference_id,
          ev.payment_method ?? '',
          ev.payment_origin ?? '',
          ev.assigned_by_email ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, sourceFilter, resourceFilter, searchQuery]);

  // KPIs por canal: respetan filtros de fecha/cancha/búsqueda, pero NO el de
  // Origen — así el operador ve el bulto Manager incluso cuando la tabla
  // solo muestra Online+Waitry. El KPI "Total filtrado" sí refleja el filtro
  // completo (lo que está visible en la tabla).
  const channelTotals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sums = { online: 0, manager: 0, waitry: 0, other: 0 };
    for (const ev of events) {
      if (resourceFilter && ev.resource_name !== resourceFilter) continue;
      if (q) {
        const haystack = [
          ev.owner_name ?? '',
          ev.subject ?? '',
          ev.reference_id,
          ev.payment_method ?? '',
          ev.payment_origin ?? '',
          ev.assigned_by_email ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      sums[ev.source] += ev.amount;
    }
    return sums;
  }, [events, resourceFilter, searchQuery]);

  const totalFiltered = useMemo(
    () => filteredEvents.reduce((sum, ev) => sum + ev.amount, 0),
    [filteredEvents]
  );

  function handleQuitar(rowId: string) {
    setFeedback(null);
    startUnassignTransition(async () => {
      const res = await unassignPaymentAction(rowId);
      if (res.ok) {
        setFeedback({ kind: 'success', message: 'Asignación quitada.' });
        refetch();
      } else {
        setFeedback({ kind: 'error', message: res.error });
      }
    });
  }

  function handleNavigateToBooking() {
    router.push('/rdb/playtomic/conciliacion');
  }

  function handleExportCsv() {
    const headers = [
      'Fecha reserva',
      'Cancha',
      'Owner',
      'Total reserva',
      'Origen',
      'Monto',
      'Referencia',
      'Método de pago',
      'Origin (CSV)',
      'Sujeto',
      'Asignado por',
      'Fecha del evento',
    ];
    const lines = [
      headers.join(','),
      ...filteredEvents.map((ev) =>
        [
          ev.booking_start ? formatBookingDate(ev.booking_start) : '',
          ev.resource_name ?? '',
          ev.owner_name ?? '',
          ev.booking_total,
          SOURCE_LABELS[ev.source].replace(/[🟢🟦⚠]\s*/g, ''),
          ev.amount,
          ev.reference_id,
          ev.payment_method ?? '',
          ev.payment_origin ?? '',
          ev.subject ?? '',
          ev.assigned_by_email ?? '',
          ev.event_at ? formatEventDate(ev.event_at) : '',
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historial-conciliacion-${fromIso}-a-${toIso}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-red-500">Error al cargar historial: {error}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">
            Historial de cobertura por reserva
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Eventos de cobertura efectiva por defecto: pagos online del CSV (App/Web) + asignaciones
            manuales en Waitry. Los pagos &quot;Manager onsite&quot; (Cash/Tarjeta marcados desde el
            panel) NO se consideran cubiertos hasta conciliarse contra Waitry — esos viven en el tab
            Conciliación con flag ⚠. Cambia el filtro de Origen para auditarlos aquí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={refetch} disabled={refreshing}>
            {refreshing ? 'Refrescando…' : 'Refrescar'}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="from"
            className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            Desde
          </label>
          <input
            id="from"
            type="date"
            value={fromIso}
            max={toIso}
            onChange={(e) => setFromIso(e.target.value)}
            className="rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="to"
            className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            Hasta
          </label>
          <input
            id="to"
            type="date"
            value={toIso}
            min={fromIso}
            onChange={(e) => setToIso(e.target.value)}
            className="rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Origen
          </label>
          <Combobox
            value={sourceFilter}
            onChange={(value) => setSourceFilter((value as SourceFilter) ?? 'effective')}
            options={[
              { value: 'effective', label: 'Cobertura efectiva (Online + Waitry)' },
              { value: 'all', label: 'Todos (incluye Manager)' },
              { value: 'online', label: 'Solo Online (App/Web)' },
              { value: 'manager', label: 'Solo Manager onsite' },
              { value: 'waitry', label: 'Solo Waitry (manual)' },
              { value: 'other', label: 'Solo Otro' },
            ]}
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Cancha
          </label>
          <Combobox
            value={resourceFilter}
            onChange={(value) => setResourceFilter(value ?? '')}
            options={[{ value: '', label: 'Todas' }, ...resourceOptions]}
            allowClear
            className="w-44"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1 sm:min-w-[16rem]">
          <label
            htmlFor="search"
            className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            Buscar
          </label>
          <Input
            id="search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="owner, jugador, payment_id, método…"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Total filtrado
          </div>
          <div className="mt-1 font-semibold text-[var(--text)]">{formatMoney(totalFiltered)}</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">en la tabla</div>
        </div>
        {(['online', 'manager', 'waitry', 'other'] as const).map((key) => (
          <div
            key={key}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {SOURCE_LABELS[key]}
            </div>
            <div className="mt-1 font-semibold text-[var(--text)]">
              {formatMoney(channelTotals[key])}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">total del canal</div>
          </div>
        ))}
      </div>

      {feedback ? (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] bg-[var(--panel)]/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {filteredEvents.length} eventos en el periodo
        </div>
        <div className="max-h-[40rem] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reserva</TableHead>
                <TableHead>Cancha</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Total res.</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Detalles</TableHead>
                <TableHead>Asignado por</TableHead>
                <TableHead>Fecha evento</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-[var(--text)]/50">
                    No hay eventos en el periodo y filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((ev) => {
                  const bookingDate = ev.booking_start ? new Date(ev.booking_start) : null;
                  const bookingValid = bookingDate && !Number.isNaN(bookingDate.getTime());
                  return (
                    <TableRow
                      key={`${ev.source}-${ev.row_id}`}
                      className="cursor-pointer transition-colors hover:bg-[var(--panel)]/40"
                      onClick={handleNavigateToBooking}
                    >
                      <TableCell className="font-medium text-[var(--text)]">
                        {bookingValid ? FECHA_CORTA_FMT.format(bookingDate as Date) : '—'}
                      </TableCell>
                      <TableCell>{ev.resource_name ?? '—'}</TableCell>
                      <TableCell className="text-[var(--text)]/80">
                        {ev.owner_name ?? 'Sin registro'}
                      </TableCell>
                      <TableCell className="text-right text-[var(--text)]/70">
                        {formatMoney(ev.booking_total)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            SOURCE_BADGE_CLS[ev.source]
                          }`}
                        >
                          {SOURCE_LABELS[ev.source]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-[var(--text)]">
                        {formatMoney(ev.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--text)]/80">
                        <div className="flex flex-col gap-0.5">
                          {ev.payment_method ? (
                            <span>
                              {ev.payment_method}
                              {ev.payment_origin ? ` · ${ev.payment_origin}` : ''}
                            </span>
                          ) : null}
                          {ev.source === 'waitry' && ev.waitry_paid_at ? (
                            <span className="text-[var(--text-muted)]">
                              ⏱ {formatEventDate(ev.waitry_paid_at)} (cobro)
                              {ev.waitry_order_total != null && ev.waitry_order_total !== ev.amount
                                ? ` · pedido ${formatMoney(ev.waitry_order_total)}`
                                : ''}
                            </span>
                          ) : null}
                          {ev.source === 'waitry' && ev.waitry_notes ? (
                            <span className="text-[var(--text)]/80 italic" title={ev.waitry_notes}>
                              📝 &ldquo;{ev.waitry_notes}&rdquo;
                            </span>
                          ) : null}
                          {ev.subject ? (
                            <span className="text-[var(--text-muted)]">{ev.subject}</span>
                          ) : null}
                          <span
                            className="font-mono text-[10px] text-[var(--text-muted)]"
                            title={ev.reference_id}
                          >
                            #{ev.reference_id.slice(0, 16)}
                            {ev.reference_id.length > 16 ? '…' : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--text)]/80">
                        {ev.assigned_by_email ?? (
                          <span className="text-[var(--text-muted)]">auto</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--text-muted)]">
                        {formatEventDate(ev.event_at)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {ev.source === 'waitry' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isUnassigning}
                            onClick={() => handleQuitar(ev.row_id)}
                          >
                            Quitar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
