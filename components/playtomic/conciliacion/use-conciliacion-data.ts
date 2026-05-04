'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import type {
  CoverageStatus,
  PendingBookingWithCoverage,
  WaitryCandidate,
} from '@/lib/playtomic/conciliacion';

type BookingRow = {
  booking_id: string;
  booking_start: string;
  booking_end: string;
  resource_name: string | null;
  price_amount: number | null;
  owner_id: string | null;
};

type ParticipantRow = {
  booking_id: string;
  player_id: string;
  is_owner: boolean | null;
};

type PlayerRow = {
  playtomic_id: string;
  name: string | null;
  email: string | null;
};

type WaitryPedidoRow = {
  order_id: string;
  timestamp: string;
  notes: string | null;
  total_amount: number | null;
  paid: boolean | null;
};

type WaitryProductoRow = {
  order_id: string;
  product_name: string;
  unit_price: number | null;
  quantity: number | null;
};

export type ConciliacionData = {
  bookings: PendingBookingWithCoverage[];
  candidates: WaitryCandidate[];
  assignedOrderIds: Set<string>;
};

const RENTA_CANCHA_PRODUCT = 'Renta Cancha Padel';

export function useConciliacionData() {
  const [data, setData] = useState<ConciliacionData>({
    bookings: [],
    candidates: [],
    assignedOrderIds: new Set(),
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const playtomic = supabase.schema('playtomic');
      const rdb = supabase.schema('rdb');

      const nowIso = new Date().toISOString();
      const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { data: pendingBookings, error: pendingErr },
        { data: waitryPedidos, error: pedidosErr },
        { data: waitryProductos, error: productosErr },
      ] = await Promise.all([
        playtomic
          .from('bookings')
          .select('booking_id,booking_start,booking_end,resource_name,price_amount,owner_id')
          .eq('payment_status', 'PENDING')
          .eq('is_canceled', false)
          .lte('booking_start', nowIso)
          .gte('booking_start', ninetyDaysAgoIso)
          .order('booking_start', { ascending: true })
          .limit(2000)
          .returns<BookingRow[]>(),
        rdb
          .from('waitry_pedidos')
          .select('order_id,timestamp,notes,total_amount,paid')
          .eq('paid', true)
          .gte('timestamp', ninetyDaysAgoIso)
          .order('timestamp', { ascending: true })
          .limit(5000)
          .returns<WaitryPedidoRow[]>(),
        rdb
          .from('waitry_productos')
          .select('order_id,product_name,unit_price,quantity')
          .eq('product_name', RENTA_CANCHA_PRODUCT)
          .gte('created_at', ninetyDaysAgoIso)
          .limit(10000)
          .returns<WaitryProductoRow[]>(),
      ]);

      if (pendingErr) throw pendingErr;
      if (pedidosErr) throw pedidosErr;
      if (productosErr) throw productosErr;

      const bookingsList = pendingBookings ?? [];
      const bookingIds = bookingsList.map((b) => b.booking_id);

      let participants: ParticipantRow[] = [];
      let players: PlayerRow[] = [];

      if (bookingIds.length > 0) {
        const { data: participantRows, error: participantErr } = await playtomic
          .from('booking_participants')
          .select('booking_id,player_id,is_owner')
          .in('booking_id', bookingIds)
          .returns<ParticipantRow[]>();
        if (participantErr) throw participantErr;
        participants = participantRows ?? [];

        const playerIds = Array.from(new Set(participants.map((p) => p.player_id)));
        if (playerIds.length > 0) {
          const { data: playerRows, error: playerErr } = await playtomic
            .from('players')
            .select('playtomic_id,name,email')
            .in('playtomic_id', playerIds)
            .returns<PlayerRow[]>();
          if (playerErr) throw playerErr;
          players = playerRows ?? [];
        }
      }

      const playerMap = new Map(players.map((p) => [p.playtomic_id, p]));
      const participantsByBooking = new Map<string, ParticipantRow[]>();
      for (const p of participants) {
        const list = participantsByBooking.get(p.booking_id) ?? [];
        list.push(p);
        participantsByBooking.set(p.booking_id, list);
      }

      const productosByOrder = new Map<string, WaitryProductoRow>();
      for (const prod of waitryProductos ?? []) {
        if (!productosByOrder.has(prod.order_id)) productosByOrder.set(prod.order_id, prod);
      }

      const candidates: WaitryCandidate[] = (waitryPedidos ?? [])
        .map((pedido) => {
          const prod = productosByOrder.get(pedido.order_id);
          if (!prod) return null;
          return {
            order_id: pedido.order_id,
            timestamp: pedido.timestamp,
            notes: pedido.notes,
            total_amount: Number(pedido.total_amount ?? 0),
            unit_price: Number(prod.unit_price ?? 0),
            quantity: Number(prod.quantity ?? 1),
          };
        })
        .filter((c): c is WaitryCandidate => c !== null);

      // S1: la tabla payment_assignments está vacía hasta S2 — sin asignaciones existentes.
      // Cuando S2 implemente las server actions de write, esto consultará la tabla
      // (vía la vista `playtomic.v_bookings_payment_coverage` ya creada en la migración).
      const assignedOrderIds = new Set<string>();

      const bookings: PendingBookingWithCoverage[] = bookingsList.map((booking) => {
        const bookingParticipants = participantsByBooking.get(booking.booking_id) ?? [];
        const ownerParticipant = bookingParticipants.find((p) => p.is_owner === true);
        const ownerPlayer = ownerParticipant
          ? playerMap.get(ownerParticipant.player_id)
          : undefined;
        const participantNames: string[] = [];
        const participantEmails: string[] = [];
        for (const p of bookingParticipants) {
          const player = playerMap.get(p.player_id);
          if (player?.name) participantNames.push(player.name);
          if (player?.email) participantEmails.push(player.email);
        }

        return {
          booking_id: booking.booking_id,
          booking_start: booking.booking_start,
          booking_end: booking.booking_end,
          resource_name: booking.resource_name,
          price_amount: Number(booking.price_amount ?? 0),
          owner_id: booking.owner_id,
          owner_name: ownerPlayer?.name ?? null,
          owner_email: ownerPlayer?.email ?? null,
          participant_names: participantNames,
          participant_emails: participantEmails,
          coverage_status: 'none' as CoverageStatus,
          coverage_pct: 0,
          assigned_total: 0,
          assigned_waitry_orders: [] as string[],
        };
      });

      setData({ bookings, candidates, assignedOrderIds });
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudo cargar la conciliación.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  return {
    data,
    loading,
    refreshing,
    error,
    refetch: () => fetchData(true),
  };
}
