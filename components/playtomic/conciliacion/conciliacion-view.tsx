'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TIMESTAMP_TOLERANCE_PRESETS_MS,
  rankCandidates,
  type TimestampTolerancePreset,
} from '@/lib/playtomic/conciliacion';
import { AssignmentPanel } from './assignment-panel';
import { PendingList } from './pending-list';
import { useConciliacionData } from './use-conciliacion-data';

const TOLERANCE_LABELS: Record<TimestampTolerancePreset, string> = {
  '3h': '±3 h',
  '1d': '±1 día',
  '2d': '±2 días',
  '7d': '±7 días',
  '30d': '±30 días',
};

export function ConciliacionView() {
  // Deep-link desde el tab Historial: `?selected=<bookingId>` pre-selecciona
  // la reserva. Se lee solo en mount (pattern recommended: single source of
  // truth = state local).
  //
  // El hook recibe `extraBookingId` (con el valor del query param inicial)
  // para hacer fetch específico de ese booking si NO está en la lista
  // filtrada (porque ya está full-cubierto, fuera del rango 90d, etc).
  // Solo se usa el valor inicial — clicks subsiguientes en otras reservas
  // de la lista NO disparan re-fetch.
  const searchParams = useSearchParams();
  const [initialSelectedId] = useState<string | null>(() => searchParams.get('selected'));
  const { data, loading, refreshing, error, refetch } = useConciliacionData({
    extraBookingId: initialSelectedId,
  });
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(initialSelectedId);
  const [tolerancePreset, setTolerancePreset] = useState<TimestampTolerancePreset>('2d');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedBooking = useMemo(
    () => data.bookings.find((b) => b.booking_id === selectedBookingId) ?? null,
    [data.bookings, selectedBookingId]
  );

  const isDeepLinkedOutOfFilter = useMemo(
    () => Boolean(selectedBookingId && data.outOfFilterBookings.has(selectedBookingId)),
    [data.outOfFilterBookings, selectedBookingId]
  );

  const existingAssignments = useMemo(
    () => (selectedBookingId ? (data.assignmentsByBooking.get(selectedBookingId) ?? []) : []),
    [data.assignmentsByBooking, selectedBookingId]
  );

  const rankedCandidates = useMemo(() => {
    if (!selectedBooking) return [];
    // Soporta split-payment: un mismo pedido Waitry puede asignarse a N
    // bookings hasta agotar `total_amount`. Cada candidato lleva consigo
    // su `remaining_amount` para que el panel sepa cuánto puede asignar.
    const available = data.candidates
      .map((c) => {
        const summary = data.orderAssignmentSummary.get(c.order_id);
        if (!summary) {
          return { ...c, remaining_amount: c.total_amount };
        }
        return {
          ...c,
          remaining_amount: summary.remaining,
          assigned_to_other_bookings: summary.assigned,
          shared_with_bookings_count: summary.bookingsCount,
        };
      })
      // Tolerancia 0.01 igual que en BD/action: redondeos no deben
      // ocultar pedidos que aún tienen saldo asignable.
      .filter((c) => (c.remaining_amount ?? c.total_amount) > 0.01);
    const ranked = rankCandidates(selectedBooking, available, {
      toleranceMs: TIMESTAMP_TOLERANCE_PRESETS_MS[tolerancePreset],
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((c) => (c.notes ?? '').toLowerCase().includes(q));
  }, [selectedBooking, data.candidates, data.orderAssignmentSummary, tolerancePreset, searchQuery]);

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
        <p className="text-sm text-red-500">Error al cargar datos: {error}</p>
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
            Conciliación Playtomic ↔ Waitry
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Reservas con cobertura trazable incompleta: pagos online del CSV de Playtomic Manager +
            asignaciones Waitry no llegan al total. {data.bookings.length} reservas a revisar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={refreshing}>
          {refreshing ? 'Refrescando…' : 'Refrescar'}
        </Button>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <label
            htmlFor="tolerance-preset"
            className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            Ventana temporal
          </label>
          <select
            id="tolerance-preset"
            value={tolerancePreset}
            onChange={(e) => setTolerancePreset(e.target.value as TimestampTolerancePreset)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
          >
            {(Object.keys(TIMESTAMP_TOLERANCE_PRESETS_MS) as TimestampTolerancePreset[]).map(
              (preset) => (
                <option key={preset} value={preset}>
                  {TOLERANCE_LABELS[preset]}
                </option>
              )
            )}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="notes-search"
            className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            Buscar en notes
          </label>
          <input
            id="notes-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='nombre del cliente, "efectivo", etc.'
            className="w-64 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <PendingList
          bookings={data.bookings}
          selectedBookingId={selectedBookingId}
          onSelect={setSelectedBookingId}
        />
        <AssignmentPanel
          key={selectedBookingId ?? 'none'}
          booking={selectedBooking}
          candidates={rankedCandidates}
          existingAssignments={existingAssignments}
          isDeepLinkedOutOfFilter={isDeepLinkedOutOfFilter}
          tolerancePresetLabel={TOLERANCE_LABELS[tolerancePreset]}
          onWidenWindow={
            tolerancePreset !== '30d'
              ? () => {
                  const order: TimestampTolerancePreset[] = ['3h', '1d', '2d', '7d', '30d'];
                  const next = order[order.indexOf(tolerancePreset) + 1];
                  if (next) setTolerancePreset(next);
                }
              : undefined
          }
          onAfterChange={refetch}
        />
      </div>
    </div>
  );
}
