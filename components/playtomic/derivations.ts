import { HOUR_FMT, WEEKDAY_INDEX_MAP, WEEKDAY_KEY_FMT, WEEKDAY_LABELS } from './constants';
import type {
  Booking,
  BookingParticipant,
  CancelPlayerRow,
  CoachRow,
  ComputedPlayer,
  DashboardData,
  PlayerRow,
  SyncRow,
} from './types';
import { isCanceledBooking, normalizeSport } from './utils';

export type PlaytomicKpis = {
  totalBookings: number;
  revenueTotal: number;
  cancellationRate: number;
  uniquePlayers: number;
  avgBookingValue: number;
  lastSync: SyncRow | null;
};

export function computeKpis(data: DashboardData): PlaytomicKpis {
  const totalBookings = data.bookings.length;
  const revenueTotal = data.bookings
    .filter(
      (booking) => !booking.is_canceled && !(booking.status ?? '').toLowerCase().includes('cancel')
    )
    .reduce((acc, booking) => acc + (booking.price_amount ?? 0), 0);
  const canceledCount = data.bookings.filter(
    (booking) => booking.is_canceled || (booking.status ?? '').toLowerCase().includes('cancel')
  ).length;
  const cancellationRate = totalBookings ? (canceledCount / totalBookings) * 100 : 0;
  const avgBookingValue = totalBookings ? revenueTotal / totalBookings : 0;
  const uniquePlayers = new Set<string>();

  data.bookings.forEach((booking) => {
    if (booking.owner_id) uniquePlayers.add(booking.owner_id);
  });
  data.participants.forEach((participant) => {
    if (participant.player_id) uniquePlayers.add(participant.player_id);
    if (participant.family_member_id) uniquePlayers.add(participant.family_member_id);
  });

  return {
    totalBookings,
    revenueTotal,
    cancellationRate,
    uniquePlayers: uniquePlayers.size,
    avgBookingValue,
    lastSync: data.syncs[0] ?? null,
  };
}

export type CancellationAnalysis = {
  canceledCount: number;
  cancellationRate: number;
  avgCanceledDuration: number;
  sports: {
    PADEL: { total: number; canceled: number };
    TENNIS: { total: number; canceled: number };
  };
  cancellationsByWeekday: { label: string; value: number }[];
  cancellationsByHour: { label: string; value: number }[];
  topCancelers: CancelPlayerRow[];
};

export function computeCancellationAnalysis(
  bookings: Booking[],
  players: PlayerRow[]
): CancellationAnalysis {
  const playerMap = new Map(players.map((player) => [player.playtomic_id, player]));
  const canceledBookings = bookings.filter((booking) => isCanceledBooking(booking));
  const sports = {
    PADEL: { total: 0, canceled: 0 },
    TENNIS: { total: 0, canceled: 0 },
  };

  const cancellationsByWeekday = WEEKDAY_LABELS.map((label) => ({ label, value: 0 }));
  const cancellationsByHour = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
  }));
  const cancelers = new Map<string, { totalBookings: number; canceledBookings: number }>();
  let canceledDurationTotal = 0;
  let canceledDurationCount = 0;

  bookings.forEach((booking) => {
    const canceled = isCanceledBooking(booking);
    const sport = normalizeSport(booking.sport_id);
    if (sport === 'PADEL' || sport === 'TENNIS') {
      sports[sport].total += 1;
      if (canceled) sports[sport].canceled += 1;
    }

    if (booking.owner_id) {
      const entry = cancelers.get(booking.owner_id) ?? { totalBookings: 0, canceledBookings: 0 };
      entry.totalBookings += 1;
      if (canceled) entry.canceledBookings += 1;
      cancelers.set(booking.owner_id, entry);
    }

    if (!canceled || !booking.booking_start) return;

    if (typeof booking.duration_min === 'number' && Number.isFinite(booking.duration_min)) {
      canceledDurationTotal += booking.duration_min;
      canceledDurationCount += 1;
    }

    const bookingDate = new Date(booking.booking_start);
    if (Number.isNaN(bookingDate.getTime())) return;

    const weekdayKey = WEEKDAY_KEY_FMT.format(bookingDate);
    const weekdayIndex = WEEKDAY_INDEX_MAP[weekdayKey];
    if (weekdayIndex != null) cancellationsByWeekday[weekdayIndex].value += 1;

    const hourValue = Number.parseInt(HOUR_FMT.format(bookingDate), 10);
    if (!Number.isNaN(hourValue) && cancellationsByHour[hourValue])
      cancellationsByHour[hourValue].value += 1;
  });

  const topCancelers = Array.from(cancelers.entries())
    .map(([ownerId, stats]) => ({
      ownerId,
      name: playerMap.get(ownerId)?.name ?? null,
      email: playerMap.get(ownerId)?.email ?? null,
      totalBookings: stats.totalBookings,
      canceledBookings: stats.canceledBookings,
      cancellationRate: stats.totalBookings
        ? (stats.canceledBookings / stats.totalBookings) * 100
        : 0,
    }))
    .filter((player): player is CancelPlayerRow => player.canceledBookings >= 2)
    .sort(
      (a, b) =>
        b.canceledBookings - a.canceledBookings ||
        b.cancellationRate - a.cancellationRate ||
        (a.name ?? '').localeCompare(b.name ?? '', 'es')
    )
    .slice(0, 10);

  return {
    canceledCount: canceledBookings.length,
    cancellationRate: bookings.length ? (canceledBookings.length / bookings.length) * 100 : 0,
    avgCanceledDuration: canceledDurationCount ? canceledDurationTotal / canceledDurationCount : 0,
    sports,
    cancellationsByWeekday,
    cancellationsByHour,
    topCancelers,
  };
}

export function computeComputedPlayers(
  bookings: Booking[],
  participants: BookingParticipant[],
  players: PlayerRow[]
): ComputedPlayer[] {
  // Build a map of player_id -> { bookings count, total spend } from filtered bookings
  const playerStats = new Map<
    string,
    { reservas: number; gasto: number; sports: Map<string, number> }
  >();

  // Map booking_id -> booking for quick lookup
  const bookingMap = new Map(bookings.map((b) => [b.booking_id, b]));

  // Count owner bookings
  bookings.forEach((b) => {
    if (b.owner_id && !b.is_canceled) {
      const entry = playerStats.get(b.owner_id) ?? { reservas: 0, gasto: 0, sports: new Map() };
      entry.reservas += 1;
      entry.gasto += b.price_amount ?? 0;
      const sport = normalizeSport(b.sport_id);
      entry.sports.set(sport, (entry.sports.get(sport) ?? 0) + 1);
      playerStats.set(b.owner_id, entry);
    }
  });

  // Count participant bookings (non-owner)
  participants.forEach((p) => {
    if (p.player_id && !p.is_owner) {
      const booking = bookingMap.get(p.booking_id);
      if (booking && !booking.is_canceled) {
        const entry = playerStats.get(p.player_id) ?? {
          reservas: 0,
          gasto: 0,
          sports: new Map(),
        };
        entry.reservas += 1;
        const sport = normalizeSport(booking.sport_id);
        entry.sports.set(sport, (entry.sports.get(sport) ?? 0) + 1);
        playerStats.set(p.player_id, entry);
      }
    }
  });

  // Build player lookup
  const playerMap = new Map(players.map((p) => [p.playtomic_id, p]));

  // Merge stats with player info
  return Array.from(playerStats.entries()).map(([playerId, stats]) => {
    const player = playerMap.get(playerId);
    // Determine favorite sport from period data
    let favSport: string | null = null;
    let maxCount = 0;
    stats.sports.forEach((count, sport) => {
      if (count > maxCount) {
        maxCount = count;
        favSport = sport;
      }
    });
    return {
      name: player?.name ?? null,
      email: player?.email ?? null,
      reservas: stats.reservas,
      gasto: stats.gasto,
      favorite_sport: favSport,
      player_type: player?.player_type ?? null,
    };
  });
}

/**
 * Calcula ranking de entrenadores a partir de `bookings.coach_ids[]`.
 *
 * El API de Playtomic poblá `coach_ids` cuando una reserva involucra
 * a uno o más entrenadores. Aquí los expandimos (un booking con N
 * coaches contribuye N filas) y agregamos por coach_id:
 *
 * - reservas: count de bookings no canceladas que mencionan el coach.
 * - revenue: sum(price_amount / coach_ids.length) — si una reserva
 *   tiene 2 coaches, cada uno se lleva la mitad. Default 1 si solo
 *   hay 1 coach (que es el caso típico).
 * - jugadores_unicos: count distinct de owner_ids que reservaron con
 *   ese coach.
 * - ultima_reserva: timestamp del booking_start más reciente.
 *
 * Resolución de nombre: el `coach_id` de Playtomic suele coincidir con
 * un `players.playtomic_id`. Cuando matchea, mostramos el nombre real.
 * Cuando no, fallback al id truncado (`coach_<8 chars>`).
 */
export function computeCoaches(bookings: Booking[], players: PlayerRow[]): CoachRow[] {
  type Bucket = {
    reservas: number;
    revenue: number;
    owners: Set<string>;
    last: string | null;
  };
  const stats = new Map<string, Bucket>();

  for (const booking of bookings) {
    if (isCanceledBooking(booking)) continue;
    const coaches = booking.coach_ids ?? [];
    if (coaches.length === 0) continue;
    const split = (booking.price_amount ?? 0) / coaches.length;
    for (const coachId of coaches) {
      if (!coachId) continue;
      const bucket: Bucket = stats.get(coachId) ?? {
        reservas: 0,
        revenue: 0,
        owners: new Set<string>(),
        last: null,
      };
      bucket.reservas += 1;
      bucket.revenue += split;
      if (booking.owner_id) bucket.owners.add(booking.owner_id);
      if (booking.booking_start && (!bucket.last || booking.booking_start > bucket.last)) {
        bucket.last = booking.booking_start;
      }
      stats.set(coachId, bucket);
    }
  }

  const playerMap = new Map(players.map((p) => [p.playtomic_id, p]));

  return Array.from(stats.entries()).map(([coachId, bucket]) => {
    const player = playerMap.get(coachId);
    const display = player?.name?.trim() || `coach_${coachId.slice(0, 8)}`;
    return {
      coach_id: coachId,
      display_name: display,
      reservas: bucket.reservas,
      revenue: bucket.revenue,
      jugadores_unicos: bucket.owners.size,
      ultima_reserva: bucket.last,
    };
  });
}
