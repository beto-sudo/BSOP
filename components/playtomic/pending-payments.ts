import { PENDING_DATE_FMT, PENDING_TIME_FMT } from './constants';
import type {
  Booking,
  BookingParticipant,
  PendingBooking,
  PendingSummary,
  PlayerRow,
} from './types';
import { isCanceledBooking, normalizeSport } from './utils';

export type PendingPaymentsResult = {
  bookings: PendingBooking[];
  detailRows: PendingBooking[];
  detailTruncated: boolean;
  playerSummary: PendingSummary[];
  totalReservas: number;
  totalMonto: number;
};

export function computePendingPayments(
  bookings: Booking[],
  participants: BookingParticipant[],
  players: PlayerRow[]
): PendingPaymentsResult {
  const playerMap = new Map(players.map((player) => [player.playtomic_id, player]));
  const ownerParticipantMap = new Map<string, BookingParticipant>();

  participants.forEach((participant) => {
    if (participant.booking_id && participant.is_owner) {
      ownerParticipantMap.set(participant.booking_id, participant);
    }
  });

  const rowsWithSort = bookings
    .filter(
      (booking) =>
        !isCanceledBooking(booking) && (booking.payment_status ?? '').toUpperCase() === 'PENDING'
    )
    .map((booking) => {
      const bookingDate = booking.booking_start ? new Date(booking.booking_start) : null;
      const ownerParticipant = ownerParticipantMap.get(booking.booking_id);
      const player = ownerParticipant?.player_id
        ? playerMap.get(ownerParticipant.player_id)
        : undefined;
      const jugador = player?.name ?? 'Sin registro';
      const email = player?.email ?? '-';

      return {
        sortDate: bookingDate && !Number.isNaN(bookingDate.getTime()) ? bookingDate.getTime() : 0,
        row: {
          fecha:
            bookingDate && !Number.isNaN(bookingDate.getTime())
              ? PENDING_DATE_FMT.format(bookingDate)
              : '—',
          hora:
            bookingDate && !Number.isNaN(bookingDate.getTime())
              ? PENDING_TIME_FMT.format(bookingDate)
              : '—',
          cancha: booking.resource_name ?? '-',
          deporte:
            normalizeSport(booking.sport_id) === 'PADEL'
              ? 'Padel'
              : normalizeSport(booking.sport_id) === 'TENNIS'
                ? 'Tennis'
                : String(booking.sport_id ?? '—'),
          monto: booking.price_amount ?? 0,
          jugador,
          email,
        } satisfies PendingBooking,
      };
    })
    .sort((a, b) => b.sortDate - a.sortDate);

  const mapped = rowsWithSort.map((entry) => entry.row);
  const detailRows = mapped.slice(0, 200);
  const detailTruncated = mapped.length > 200;

  const summaryMap = new Map<string, PendingSummary>();
  mapped.forEach((booking) => {
    const key = `${booking.jugador}__${booking.email}`;
    const existing = summaryMap.get(key) ?? {
      jugador: booking.jugador,
      email: booking.email,
      reservas: 0,
      total: 0,
    };
    existing.reservas += 1;
    existing.total += booking.monto;
    summaryMap.set(key, existing);
  });

  const playerSummary = Array.from(summaryMap.values()).sort(
    (a, b) =>
      b.total - a.total || b.reservas - a.reservas || a.jugador.localeCompare(b.jugador, 'es')
  );

  const totalMonto = mapped.reduce((acc, booking) => acc + booking.monto, 0);

  return {
    bookings: mapped,
    detailRows,
    detailTruncated,
    playerSummary,
    totalReservas: mapped.length,
    totalMonto,
  };
}
