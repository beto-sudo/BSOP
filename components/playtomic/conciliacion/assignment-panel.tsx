'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/components/playtomic/utils';
import type { PendingBookingWithCoverage, RankedCandidate } from '@/lib/playtomic/conciliacion';

const TIMESTAMP_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function AssignmentPanel({
  booking,
  candidates,
}: {
  booking: PendingBookingWithCoverage | null;
  candidates: RankedCandidate[];
}) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const totalSelected = useMemo(
    () =>
      candidates
        .filter((c) => selectedOrderIds.has(c.order_id))
        .reduce((sum, c) => sum + c.total_amount, 0),
    [candidates, selectedOrderIds]
  );

  if (!booking) {
    return (
      <div className="flex h-full min-h-[20rem] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--text-muted)]">
        Selecciona una reserva de la lista para ver candidatos de pago en Waitry.
      </div>
    );
  }

  const totalPlanned = booking.assigned_total + totalSelected;
  const coveragePct =
    booking.price_amount > 0 ? Math.round((totalPlanned / booking.price_amount) * 100) : 0;
  const remaining = Math.max(0, booking.price_amount - totalPlanned);

  function toggle(orderId: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  const date = booking.booking_start ? new Date(booking.booking_start) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? TIMESTAMP_FMT.format(date) : '—';

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--text)]">Detalle de reserva</h3>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">Fecha y hora</dt>
            <dd className="font-medium text-[var(--text)]">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Cancha</dt>
            <dd className="font-medium text-[var(--text)]">{booking.resource_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Owner</dt>
            <dd className="font-medium text-[var(--text)]">
              {booking.owner_name ?? 'Sin registro'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Total reserva</dt>
            <dd className="font-medium text-[var(--text)]">{formatMoney(booking.price_amount)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--text-muted)]">Participantes</dt>
            <dd className="text-[var(--text)]/80">
              {booking.participant_names.length > 0 ? booking.participant_names.join(', ') : '—'}
            </dd>
          </div>
        </dl>
      </header>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <div>
            <span className="font-medium text-[var(--text)]">
              Cubierto (preview): {formatMoney(totalPlanned)} de {formatMoney(booking.price_amount)}
            </span>
            <span className="ml-2 text-[var(--text-muted)]">({coveragePct}%)</span>
          </div>
          <div className="text-[var(--text-muted)]">
            {remaining > 0 ? `Faltan ${formatMoney(remaining)}` : 'Cubre el total'}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className={`h-full transition-all ${
              coveragePct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, coveragePct)}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text)]">
            Candidatos en Waitry ({candidates.length})
          </h4>
          <span className="text-xs text-[var(--text-muted)]">
            ±3h del booking · &quot;Renta Cancha Padel&quot; · pagados · no asignados
          </span>
        </div>
        {candidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
            Sin candidatos en la ventana temporal. La heurística no encontró pedidos elegibles —
            puede que no haya pago en club registrado para esta reserva.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((candidate) => {
              const isSelected = selectedOrderIds.has(candidate.order_id);
              const tsLabel = TIMESTAMP_FMT.format(new Date(candidate.timestamp));
              return (
                <li
                  key={candidate.order_id}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm transition-colors ${
                    isSelected
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-[var(--border)] bg-[var(--panel)]/20'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-[var(--text)]">
                      <span>{tsLabel}</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span>{formatMoney(candidate.total_amount)}</span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        score {Math.round(candidate.score)}
                      </span>
                    </div>
                    {candidate.notes ? (
                      <div className="text-[var(--text)]/80">
                        notes: &quot;{candidate.notes}&quot;
                      </div>
                    ) : null}
                    {candidate.reasons.length > 0 ? (
                      <div className="text-xs text-[var(--text-muted)]">
                        {candidate.reasons.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggle(candidate.order_id)}
                  >
                    {isSelected ? 'Quitar' : 'Agregar'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-sm">
        <span className="text-[var(--text-muted)]">
          Selección actual: {selectedOrderIds.size} pedidos · {formatMoney(totalSelected)}
        </span>
        <Button variant="default" size="sm" disabled title="Disponible en S2">
          Conciliar (S2)
        </Button>
      </footer>
    </div>
  );
}
