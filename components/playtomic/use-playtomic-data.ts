'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Pre-existing `any` on Supabase row mapping (moved from page.tsx in
 * refactor PR). Proper typing requires schema refactor — out of scope.
 */

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { TZ } from './constants';
import type {
  Booking,
  BookingParticipant,
  DashboardData,
  OccupancyRow,
  PlayerRow,
  RangeKey,
  ResourceRow,
  RevenueRow,
  SyncRow,
} from './types';
import { chunkArray } from './utils';

export function usePlaytomicData({
  range,
  fromIso,
  toIso,
}: {
  range: RangeKey;
  fromIso: string;
  toIso: string;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    participants: [],
    revenue: [],
    occupancy: [],
    players: [],
    resources: [],
    syncs: [],
  });

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const schema = supabase.schema('playtomic');

        const bookingsFromBounds = getLocalDayBoundsUtc(fromIso, TZ);
        const bookingsToBounds = getLocalDayBoundsUtc(toIso, TZ);

        const bookingsQuery = schema
          .from('bookings')
          .select(
            'booking_id,resource_name,sport_id,booking_start,booking_end,duration_min,price_amount,price_currency,status,is_canceled,owner_id,booking_type,origin,payment_status,synced_at'
          )
          .gte('booking_start', bookingsFromBounds.start)
          .lte('booking_start', bookingsToBounds.end)
          .order('booking_start', { ascending: true })
          .limit(
            range === 'all' || range === 'year'
              ? 15000
              : range === '30d' || range === 'month'
                ? 5000
                : 2000
          );

        const revenueQuery = schema
          .from('v_revenue_diario')
          .select('fecha,sport_id,reservas,revenue,cancelaciones')
          .gte('fecha', fromIso)
          .lte('fecha', toIso)
          .order('fecha', { ascending: true });

        const occupancyQuery = schema
          .from('v_ocupacion_diaria')
          .select('resource_name,fecha,hora,reservas,revenue')
          .gte('fecha', fromIso)
          .lte('fecha', toIso)
          .order('resource_name', { ascending: true });

        const playersQuery = schema
          .from('players')
          .select('playtomic_id,name,email,player_type,favorite_sport')
          .limit(2000);

        const resourcesQuery = schema
          .from('resources')
          .select('resource_id,resource_name,sport_id,active,first_seen_at,last_seen_at')
          .order('resource_name', { ascending: true })
          .limit(50);

        const syncsQuery = schema
          .from('sync_log')
          .select(
            'sync_type,status,bookings_fetched,bookings_upserted,players_upserted,started_at,finished_at,error_message'
          )
          .order('started_at', { ascending: false })
          .limit(10);

        const [bookingsRes, revenueRes, occupancyRes, playersRes, resourcesRes, syncsRes] =
          await Promise.all([
            bookingsQuery,
            revenueQuery,
            occupancyQuery,
            playersQuery,
            resourcesQuery,
            syncsQuery,
          ]);

        if (bookingsRes.error) throw bookingsRes.error;
        if (revenueRes.error) throw revenueRes.error;
        if (occupancyRes.error) throw occupancyRes.error;
        if (playersRes.error) throw playersRes.error;
        if (resourcesRes.error) throw resourcesRes.error;
        if (syncsRes.error) throw syncsRes.error;

        const bookings = (bookingsRes.data ?? []) as Booking[];
        const bookingIds = bookings.map((booking) => booking.booking_id).filter(Boolean);
        const participants: BookingParticipant[] = [];

        if (bookingIds.length) {
          const bookingChunks = chunkArray(bookingIds, 500);
          const participantResponses = await Promise.all(
            bookingChunks.map((chunk) =>
              schema
                .from('booking_participants')
                .select('booking_id,player_id,is_owner,family_member_id')
                .in('booking_id', chunk)
            )
          );

          participantResponses.forEach((response) => {
            if (response.error) throw response.error;
            participants.push(...((response.data ?? []) as BookingParticipant[]));
          });
        }

        setData({
          bookings,
          participants,
          revenue: (revenueRes.data ?? []) as RevenueRow[],
          occupancy: (occupancyRes.data ?? []) as OccupancyRow[],
          players: (playersRes.data ?? []) as PlayerRow[],
          resources: (resourcesRes.data ?? []) as ResourceRow[],
          syncs: (syncsRes.data ?? []) as SyncRow[],
        });
      } catch (err: any) {
        setError(err?.message ?? 'No se pudo cargar el dashboard de Playtomic');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromIso, toIso, range]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, fetchData };
}
