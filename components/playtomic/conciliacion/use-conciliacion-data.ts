'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import type {
  CoverageStatus,
  PendingBookingWithCoverage,
  WaitryCandidate,
  WaitryItem,
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
  total_price: number | null;
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
      const bookingsLookbackDays = 90;
      const ninetyDaysAgoIso = new Date(
        Date.now() - bookingsLookbackDays * 24 * 60 * 60 * 1000
      ).toISOString();
      // Waitry lookback = bookings + max tolerance window (30d) para cubrir
      // pagos hechos antes del booking_start más antiguo en la lista.
      const waitryLookbackDays = bookingsLookbackDays + 30;
      const waitryLookbackIso = new Date(
        Date.now() - waitryLookbackDays * 24 * 60 * 60 * 1000
      ).toISOString();

      // Paso 1: bookings + pedidos Waitry pagados + productos "Renta Cancha
      // Padel" (filtrado para no chocar con el cap default de PostgREST de
      // 1000 rows aunque pidamos más).
      const [
        { data: pendingBookings, error: pendingErr },
        { data: waitryPedidos, error: pedidosErr },
        { data: canchaProductos, error: canchaErr },
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
          .gte('timestamp', waitryLookbackIso)
          .order('timestamp', { ascending: true })
          .limit(8000)
          .returns<WaitryPedidoRow[]>(),
        rdb
          .from('waitry_productos')
          .select('order_id,product_name,unit_price,quantity,total_price')
          .eq('product_name', RENTA_CANCHA_PRODUCT)
          .gte('created_at', waitryLookbackIso)
          .limit(8000)
          .returns<WaitryProductoRow[]>(),
      ]);

      if (pendingErr) throw pendingErr;
      if (pedidosErr) throw pedidosErr;
      if (canchaErr) throw canchaErr;

      // Paso 2: con los order_ids que tienen Renta Cancha Padel, fetcheamos
      // TODOS los items de esos pedidos (incluye F&B, otros productos) — usa
      // `.in()` con un set acotado, ya no choca con el cap default.
      const candidateOrderIds = Array.from(new Set((canchaProductos ?? []).map((p) => p.order_id)));
      let waitryProductos: WaitryProductoRow[] = canchaProductos ?? [];
      if (candidateOrderIds.length > 0) {
        const { data: allItems, error: itemsErr } = await rdb
          .from('waitry_productos')
          .select('order_id,product_name,unit_price,quantity,total_price')
          .in('order_id', candidateOrderIds)
          .limit(20000)
          .returns<WaitryProductoRow[]>();
        if (itemsErr) throw itemsErr;
        if (allItems && allItems.length > 0) waitryProductos = allItems;
      }

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

      // Agrupa todos los productos por order_id para construir los items[]
      // del candidato y para localizar el producto "Renta Cancha Padel"
      // que alimenta unit_price/quantity de la heurística.
      const productosByOrder = new Map<string, WaitryProductoRow[]>();
      for (const prod of waitryProductos ?? []) {
        const list = productosByOrder.get(prod.order_id) ?? [];
        list.push(prod);
        productosByOrder.set(prod.order_id, list);
      }

      const candidates: WaitryCandidate[] = (waitryPedidos ?? [])
        .map((pedido) => {
          const prods = productosByOrder.get(pedido.order_id);
          if (!prods || prods.length === 0) return null;
          const cancha = prods.find((p) => p.product_name === RENTA_CANCHA_PRODUCT);
          if (!cancha) return null;
          const items: WaitryItem[] = prods.map((p) => ({
            product_name: p.product_name,
            quantity: Number(p.quantity ?? 0),
            unit_price: Number(p.unit_price ?? 0),
            total_price: Number(p.total_price ?? 0),
          }));
          return {
            order_id: pedido.order_id,
            timestamp: pedido.timestamp,
            notes: pedido.notes,
            total_amount: Number(pedido.total_amount ?? 0),
            unit_price: Number(cancha.unit_price ?? 0),
            quantity: Number(cancha.quantity ?? 1),
            items,
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
