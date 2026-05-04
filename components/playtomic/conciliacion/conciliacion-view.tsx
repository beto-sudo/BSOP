'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { rankCandidates } from '@/lib/playtomic/conciliacion';
import { AssignmentPanel } from './assignment-panel';
import { PendingList } from './pending-list';
import { useConciliacionData } from './use-conciliacion-data';

export function ConciliacionView() {
  const { data, loading, refreshing, error, refetch } = useConciliacionData();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const selectedBooking = useMemo(
    () => data.bookings.find((b) => b.booking_id === selectedBookingId) ?? null,
    [data.bookings, selectedBookingId]
  );

  const rankedCandidates = useMemo(() => {
    if (!selectedBooking) return [];
    const available = data.candidates.filter((c) => !data.assignedOrderIds.has(c.order_id));
    return rankCandidates(selectedBooking, available);
  }, [selectedBooking, data.candidates, data.assignedOrderIds]);

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
            Cruza reservas marcadas como pendientes en Playtomic con cobros registrados en Waitry
            como &quot;Renta Cancha Padel&quot;. {data.bookings.length} reservas a revisar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={refreshing}>
          {refreshing ? 'Refrescando…' : 'Refrescar'}
        </Button>
      </header>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[var(--text)]">
        <strong>Sprint 1 — read-only:</strong> esta vista propone candidatos de Waitry para cada
        reserva pero <em>todavía no guarda asignaciones</em>. Sirve para validar que la heurística
        de matching es buena antes de habilitar la persistencia en S2.
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <PendingList
          bookings={data.bookings}
          selectedBookingId={selectedBookingId}
          onSelect={setSelectedBookingId}
        />
        <AssignmentPanel booking={selectedBooking} candidates={rankedCandidates} />
      </div>
    </div>
  );
}
