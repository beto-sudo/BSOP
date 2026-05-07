'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  assignPaymentAction,
  unassignPaymentAction,
} from '@/app/rdb/playtomic/conciliacion/actions';
import { Button } from '@/components/ui/button';
import { TZ } from '@/components/playtomic/constants';
import { formatMoney } from '@/components/playtomic/utils';
import type { PendingBookingWithCoverage, RankedCandidate } from '@/lib/playtomic/conciliacion';
import type { AssignmentDetail } from './use-conciliacion-data';

const TIMESTAMP_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
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
  isDeepLinkedOutOfFilter,
  tolerancePresetLabel,
  onWidenWindow,
  onAfterChange,
}: {
  booking: PendingBookingWithCoverage | null;
  candidates: RankedCandidate[];
  existingAssignments: AssignmentDetail[];
  /**
   * `true` cuando el booking llegó por deep-link `?selected=` desde el
   * Historial y NO está en la lista filtrada normal (ya está full-cubierto,
   * fuera de los 90d, etc). Se muestra un banner explicativo arriba del
   * panel.
   */
  isDeepLinkedOutOfFilter?: boolean;
  tolerancePresetLabel: string;
  onWidenWindow?: () => void;
  onAfterChange: () => void;
}) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  // El padre pasa `key={selectedBookingId}` al panel para que React
  // remonte y reinicie selectedOrderIds/feedback al cambiar de reserva.

  // El monto a asignar de cada candidato es el menor entre:
  //   1. El saldo disponible del pedido (`remaining_amount`, en split-payment)
  //   2. El total faltante de la reserva
  // Esto garantiza que un coach con 3 clases en un pedido $900 pueda asignar
  // $300 a cada reserva sin asumir el monto fijo del ticket.
  function amountToAssign(
    c: { total_amount: number; remaining_amount?: number },
    bookingRemaining: number
  ): number {
    const available = c.remaining_amount ?? c.total_amount;
    return Math.min(available, bookingRemaining);
  }

  const bookingRemainingBeforeSelection = booking
    ? Math.max(0, booking.price_amount - booking.assigned_total)
    : 0;

  const totalSelected = useMemo(() => {
    let runningRemaining = bookingRemainingBeforeSelection;
    let sum = 0;
    for (const c of candidates) {
      if (!selectedOrderIds.has(c.order_id)) continue;
      const amt = amountToAssign(c, runningRemaining);
      sum += amt;
      runningRemaining = Math.max(0, runningRemaining - amt);
    }
    return sum;
  }, [candidates, selectedOrderIds, bookingRemainingBeforeSelection]);

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
      let runningRemaining = bookingRemainingBeforeSelection;
      const errors: string[] = [];
      for (const c of toAssign) {
        const amt = amountToAssign(c, runningRemaining);
        if (amt <= 0) {
          errors.push(`#${c.order_id}: la reserva ya quedó cubierta antes de asignar este pedido.`);
          continue;
        }
        const res = await assignPaymentAction({
          booking_id: booking.booking_id,
          waitry_order_id: c.order_id,
          assigned_amount: amt,
        });
        if (res.ok) {
          successes += 1;
          runningRemaining = Math.max(0, runningRemaining - amt);
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
      {isDeepLinkedOutOfFilter ? (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-200">
          <strong>Llegaste desde el Historial.</strong> Esta reserva ya tiene cobertura completa
          (Online + Waitry suman el total) o quedó fuera del rango normal del listado, por eso no
          aparece en la columna izquierda. La mostramos aquí para que puedas revisar/ajustar las
          asignaciones existentes.
        </div>
      ) : null}
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

      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <div>
            <span className="font-medium text-[var(--text)]">
              Cobertura trazable (preview): {formatMoney(totalPlanned)} de{' '}
              {formatMoney(booking.price_amount)}
            </span>
            <span className="ml-2 text-[var(--text-muted)]">({coveragePct}%)</span>
          </div>
          <div className="text-[var(--text-muted)]">
            {remaining > 0 ? `Faltan ${formatMoney(remaining)}` : 'Cubre el total'}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className={`h-full transition-all ${
              coveragePct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, coveragePct)}%` }}
          />
        </div>
        <ul className="space-y-1 text-xs text-[var(--text)]/80">
          <li className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--text-muted)]">
              Online (cliente vía app/web, ya en cuenta del club)
            </span>
            <span className="font-medium text-[var(--text)]">
              {formatMoney(booking.online_csv_total)}
            </span>
          </li>
          <li className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--text-muted)]">Waitry (asignado a esta reserva)</span>
            <span className="font-medium text-[var(--text)]">
              {formatMoney(
                booking.assigned_total - booking.online_csv_total - booking.wallet_coverage
              )}
            </span>
          </li>
          {booking.wallet_payments_count > 0 ? (
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--text-muted)]">
                Bono monedero ({booking.wallet_payments_count} jugador
                {booking.wallet_payments_count === 1 ? '' : 'es'})
              </span>
              <span className="font-medium text-[var(--text)]">
                {formatMoney(booking.wallet_coverage)}
              </span>
            </li>
          ) : null}
          {booking.manager_csv_total > 0 ? (
            <li
              className={`flex items-baseline justify-between gap-2 ${
                booking.has_unverified_manager ? 'text-rose-300' : ''
              }`}
            >
              <span>
                {booking.has_unverified_manager ? '⚠ ' : ''}
                Marcado por manager onsite (sin Waitry equivalente)
              </span>
              <span className="font-medium">{formatMoney(booking.manager_csv_total)}</span>
            </li>
          ) : null}
        </ul>
        {booking.has_unverified_manager ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
            El manager registró {formatMoney(booking.manager_csv_total)} como pagado en cancha desde
            Playtomic, pero esos cobros no están en Waitry. Verifica con la caja del club y asigna
            los pedidos Waitry correspondientes para cerrar la trazabilidad.
          </p>
        ) : null}
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
            {tolerancePresetLabel} alrededor del booking · cancha (padel/tenis/pickleball/coach) ·
            pagados · no asignados
          </span>
        </div>
        {candidates.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
            <p>
              Sin candidatos dentro de {tolerancePresetLabel} alrededor del booking. Posibles
              razones:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-xs">
              <li>
                El cliente pagó días antes (reservó y prepagó) o días después (volvió al club a
                cobrar) — ampliar ventana temporal.
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
              const isShared =
                (candidate.shared_with_bookings_count ?? 0) > 0 &&
                (candidate.assigned_to_other_bookings ?? 0) > 0;
              const remaining = candidate.remaining_amount ?? candidate.total_amount;
              const isAutoMatch = candidate.is_auto_match === true;
              return (
                <li
                  key={candidate.order_id}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm transition-colors ${
                    isSelected
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : isAutoMatch
                        ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/40'
                        : 'border-[var(--border)] bg-[var(--panel)]/20'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]">
                      <span>{tsLabel}</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      {isShared ? (
                        <span title={`Total del ticket: ${formatMoney(candidate.total_amount)}`}>
                          <span>{formatMoney(remaining)}</span>
                          <span className="ml-1 text-xs text-[var(--text-muted)]">
                            disponible de {formatMoney(candidate.total_amount)}
                          </span>
                        </span>
                      ) : (
                        <span>{formatMoney(candidate.total_amount)}</span>
                      )}
                      <span
                        className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 font-mono text-xs text-[var(--text-muted)]"
                        title={candidate.order_id}
                      >
                        #{candidate.order_id}
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        score {Math.round(candidate.score)}
                      </span>
                      {isShared ? (
                        <span
                          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200"
                          title={`Asignado a ${candidate.shared_with_bookings_count} reserva${candidate.shared_with_bookings_count === 1 ? '' : 's'} previa${candidate.shared_with_bookings_count === 1 ? '' : 's'} por ${formatMoney(candidate.assigned_to_other_bookings ?? 0)}`}
                        >
                          Pago compartido
                        </span>
                      ) : null}
                      {isAutoMatch ? (
                        <span
                          className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200"
                          title={`Cumple criterios para auto-conciliación: ${(candidate.auto_match_reasons ?? []).join(' · ')}. Cuando activemos auto-conciliación, este pedido se asignaría automáticamente.`}
                        >
                          🤖 Sugerido auto
                        </span>
                      ) : null}
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
