'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/components/playtomic/utils';
import type { PendingBookingWithCoverage } from '@/lib/playtomic/conciliacion';

const FECHA_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
});
const HORA_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function coverageLabel(status: PendingBookingWithCoverage['coverage_status']): string {
  switch (status) {
    case 'full':
      return 'Cubierta';
    case 'partial':
      return 'Parcial';
    case 'none':
    default:
      return 'Sin cobertura';
  }
}

function coverageBadgeClass(status: PendingBookingWithCoverage['coverage_status']): string {
  switch (status) {
    case 'full':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'partial':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'none':
    default:
      return 'bg-[var(--panel)]/60 text-[var(--text-muted)] border-[var(--border)]';
  }
}

function apiStatusBadge(status: string | null): { label: string; cls: string } | null {
  switch (status) {
    case 'PARTIAL_PAID':
      return {
        label: 'API parcial',
        cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
      };
    case 'PAID':
      return {
        label: 'API paid',
        cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
      };
    default:
      return null;
  }
}

export function PendingList({
  bookings,
  selectedBookingId,
  onSelect,
}: {
  bookings: PendingBookingWithCoverage[];
  selectedBookingId: string | null;
  onSelect: (bookingId: string) => void;
}) {
  if (bookings.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--text-muted)]">
        No hay reservas pendientes que conciliar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] bg-[var(--panel)]/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Reservas con pendiente de cobrar en cancha ({bookings.length})
      </div>
      <div className="max-h-[36rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Cancha</TableHead>
              <TableHead>Jugador</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Cobertura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => {
              const date = booking.booking_start ? new Date(booking.booking_start) : null;
              const isValid = date && !Number.isNaN(date.getTime());
              const isSelected = booking.booking_id === selectedBookingId;
              return (
                <TableRow
                  key={booking.booking_id}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[var(--accent)]/15' : 'hover:bg-[var(--panel)]/40'
                  }`}
                  onClick={() => onSelect(booking.booking_id)}
                >
                  <TableCell className="font-medium text-[var(--text)]">
                    {isValid ? FECHA_FMT.format(date as Date) : '—'}
                  </TableCell>
                  <TableCell>{isValid ? HORA_FMT.format(date as Date) : '—'}</TableCell>
                  <TableCell>{booking.resource_name ?? '—'}</TableCell>
                  <TableCell className="text-[var(--text)]/80">
                    {booking.owner_name ?? 'Sin registro'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(booking.price_amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${coverageBadgeClass(
                          booking.coverage_status
                        )}`}
                      >
                        {coverageLabel(booking.coverage_status)}
                        {booking.coverage_status === 'partial' ? ` ${booking.coverage_pct}%` : ''}
                      </span>
                      {(() => {
                        const api = apiStatusBadge(booking.api_payment_status);
                        return api ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${api.cls}`}
                            title="Estado agregado en Playtomic Manager (independiente de la cobertura trazable)"
                          >
                            {api.label}
                          </span>
                        ) : null;
                      })()}
                      {booking.has_unverified_manager ? (
                        <span
                          className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300"
                          title="El manager marcó pagos onsite en Playtomic pero no hay equivalente en Waitry — verificar"
                        >
                          ⚠ Sin Waitry
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
