'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  assignPaymentAction,
  unassignPaymentAction,
} from '@/app/rdb/playtomic/conciliacion/actions';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/components/playtomic/utils';
import type { PendingBookingWithCoverage, RankedCandidate } from '@/lib/playtomic/conciliacion';
import type { AssignmentDetail } from './use-conciliacion-data';

const TIMESTAMP_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

type ActionFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'partial'; message: string }
  | { kind: 'error'; message: string };

export function AssignmentPanel({
  booking,
  candidates,
  existingAssignments,
  tolerancePresetLabel,
  onWidenWindow,
  onAfterChange,
}: {
  booking: PendingBookingWithCoverage | null;
  candidates: RankedCandidate[];
  existingAssignments: AssignmentDetail[];
  tolerancePresetLabel: string;
  onWidenWindow?: () => void;
  onAfterChange: () => void;
}) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  // El padre pasa `key={selectedBookingId}` al panel para que React
  // remonte y reinicie selectedOrderIds/feedback al cambiar de reserva.

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

  function handleConciliar() {
    if (!booking || selectedOrderIds.size === 0) return;
    const toAssign = candidates.filter((c) => selectedOrderIds.has(c.order_id));
    setFeedback(null);
    startTransition(async () => {
      let successes = 0;
      const errors: string[] = [];
      for (const c of toAssign) {
        const res = await assignPaymentAction({
          booking_id: booking.booking_id,
          waitry_order_id: c.order_id,
          assigned_amount: c.total_amount,
        });
        if (res.ok) {
          successes += 1;
        } else {
          errors.push(`#${c.order_id}: ${res.error}`);
        }
      }

      if (errors.length === 0) {
        setFeedback({
          kind: 'success',
          message: `${successes} ${successes === 1 ? 'pedido asignado' : 'pedidos asignados'}.`,
        });
      } else if (successes > 0) {
        setFeedback({
          kind: 'partial',
          message: `${successes} asignados, ${errors.length} fallaron: ${errors.join(' · ')}`,
        });
      } else {
        setFeedback({
          kind: 'error',
          message: errors.join(' · '),
        });
      }

      if (successes > 0) {
        setSelectedOrderIds(new Set());
        onAfterChange();
      }
    });
  }

  function handleQuitar(assignmentId: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await unassignPaymentAction(assignmentId);
      if (res.ok) {
        setFeedback({ kind: 'success', message: 'Asignación quitada.' });
        onAfterChange();
      } else {
        setFeedback({ kind: 'error', message: res.error });
      }
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

      {feedback ? (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : feedback.kind === 'partial'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {existingAssignments.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text)]">
            Asignaciones actuales ({existingAssignments.length})
          </h4>
          <ul className="space-y-2">
            {existingAssignments.map((a) => {
              const ts = new Date(a.assigned_at);
              const tsLabel = Number.isNaN(ts.getTime()) ? '—' : TIMESTAMP_FMT.format(ts);
              return (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]">
                      <span>{formatMoney(a.assigned_amount)}</span>
                      <span
                        className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 font-mono text-xs text-[var(--text-muted)]"
                        title={a.waitry_order_id}
                      >
                        #{a.waitry_order_id}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{tsLabel}</span>
                    </div>
                    {a.note ? (
                      <div className="text-xs text-[var(--text)]/80">
                        <span className="text-[var(--text-muted)]">nota:</span> {a.note}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuitar(a.id)}
                    disabled={isPending}
                  >
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text)]">
            Candidatos en Waitry ({candidates.length})
          </h4>
          <span className="text-xs text-[var(--text-muted)]">
            hasta {tolerancePresetLabel} después del booking · cancha (padel/tenis/pickleball/coach)
            · pagados · no asignados
          </span>
        </div>
        {candidates.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
            <p>
              Sin candidatos dentro de {tolerancePresetLabel} después del booking. Posibles razones:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-xs">
              <li>
                El cliente pagó atrasado (volvió al club días después y se cobró entonces) — ampliar
                ventana.
              </li>
              <li>La búsqueda en notes está activa y no hay coincidencias.</li>
              <li>
                El pedido en Waitry no tiene un producto de cancha reconocido (padel, tenis,
                pickleball, uso de coach) — el operador lo registró con otro nombre.
              </li>
              <li>Realmente no hay pago en club registrado — pendiente real.</li>
            </ul>
            {onWidenWindow ? (
              <Button variant="outline" size="sm" onClick={onWidenWindow}>
                Ampliar ventana temporal
              </Button>
            ) : null}
          </div>
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
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]">
                      <span>{tsLabel}</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span>{formatMoney(candidate.total_amount)}</span>
                      <span
                        className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 font-mono text-xs text-[var(--text-muted)]"
                        title={candidate.order_id}
                      >
                        #{candidate.order_id}
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        score {Math.round(candidate.score)}
                      </span>
                    </div>
                    {candidate.items.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-[var(--text)]/80">
                        {candidate.items.map((item, idx) => (
                          <li
                            key={`${candidate.order_id}-${idx}`}
                            className="flex items-baseline gap-2"
                          >
                            <span className="text-[var(--text-muted)]">{item.quantity}×</span>
                            <span className="flex-1 truncate">{item.product_name}</span>
                            <span className="text-[var(--text-muted)]">
                              {formatMoney(item.total_price)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {candidate.notes ? (
                      <div className="text-xs text-[var(--text)]/80">
                        <span className="text-[var(--text-muted)]">notes:</span> &quot;
                        {candidate.notes}&quot;
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
                    disabled={isPending}
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
        <Button
          variant="default"
          size="sm"
          disabled={selectedOrderIds.size === 0 || isPending}
          onClick={handleConciliar}
        >
          {isPending
            ? 'Guardando…'
            : selectedOrderIds.size > 0
              ? `Conciliar (${selectedOrderIds.size})`
              : 'Conciliar'}
        </Button>
      </footer>
    </div>
  );
}
