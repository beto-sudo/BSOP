import { describe, expect, it } from 'vitest';
import { buildBookingCoachMap, computeCoaches } from './derivations';
import type { Booking, BookingParticipant, PlayerRow } from './types';

const baseBooking: Booking = {
  booking_id: 'b1',
  resource_name: 'Padel 1',
  sport_id: '1',
  booking_start: '2026-04-15T18:00:00Z',
  booking_end: '2026-04-15T19:30:00Z',
  duration_min: 90,
  price_amount: 800,
  price_currency: 'MXN',
  status: 'confirmed',
  is_canceled: false,
  owner_id: 'player-1',
  booking_type: null,
  origin: 'app',
  payment_status: 'PAID',
  synced_at: null,
  coach_ids: null,
  course_id: null,
  course_name: null,
  activity_id: null,
  activity_name: null,
};

const omar: PlayerRow = {
  playtomic_id: 'player-omar',
  name: 'Omar Treviño',
  email: 'omar@club.com',
  player_type: null,
  favorite_sport: null,
};
const cliente: PlayerRow = {
  playtomic_id: 'player-1',
  name: 'Juan Pérez',
  email: 'juan@example.com',
  player_type: null,
  favorite_sport: null,
};
const aniba: PlayerRow = {
  playtomic_id: 'player-anibal',
  name: 'Aníbal González',
  email: 'anibal@club.com',
  player_type: null,
  favorite_sport: null,
};

describe('buildBookingCoachMap', () => {
  it('detecta coach cuando es owner del booking', () => {
    const bookings: Booking[] = [{ ...baseBooking, booking_id: 'b1', owner_id: 'player-omar' }];
    const map = buildBookingCoachMap(bookings, [], [omar]);
    expect(map.get('b1')).toEqual(new Set(['omar']));
  });

  it('detecta coach cuando es participante (no owner)', () => {
    const bookings: Booking[] = [{ ...baseBooking, booking_id: 'b1', owner_id: 'player-1' }];
    const participants: BookingParticipant[] = [
      { booking_id: 'b1', player_id: 'player-1', is_owner: true, family_member_id: null },
      { booking_id: 'b1', player_id: 'player-omar', is_owner: false, family_member_id: null },
    ];
    const map = buildBookingCoachMap(bookings, participants, [cliente, omar]);
    expect(map.get('b1')).toEqual(new Set(['omar']));
  });

  it('matchea nombres con tildes (Aníbal → anibal)', () => {
    const bookings: Booking[] = [{ ...baseBooking, owner_id: 'player-anibal' }];
    const map = buildBookingCoachMap(bookings, [], [aniba]);
    expect(map.get('b1')).toEqual(new Set(['anibal']));
  });

  it('un booking puede tener múltiples coaches (clase con 2)', () => {
    const bookings: Booking[] = [{ ...baseBooking, owner_id: 'player-omar' }];
    const participants: BookingParticipant[] = [
      { booking_id: 'b1', player_id: 'player-omar', is_owner: true, family_member_id: null },
      { booking_id: 'b1', player_id: 'player-anibal', is_owner: false, family_member_id: null },
    ];
    const map = buildBookingCoachMap(bookings, participants, [omar, aniba]);
    expect(map.get('b1')).toEqual(new Set(['omar', 'anibal']));
  });

  it('booking sin coach no entra al mapa', () => {
    const bookings: Booking[] = [{ ...baseBooking, owner_id: 'player-1' }];
    const map = buildBookingCoachMap(bookings, [], [cliente]);
    expect(map.has('b1')).toBe(false);
  });
});

describe('computeCoaches', () => {
  it('ranking vacío si el mapa no tiene entradas', () => {
    const rows = computeCoaches([baseBooking], new Map());
    expect(rows).toHaveLength(0);
  });

  it('ignora bookings cancelados aunque haya coach', () => {
    const map = new Map([['b1', new Set<'omar'>(['omar'])]]);
    const rows = computeCoaches([{ ...baseBooking, is_canceled: true }], map);
    expect(rows).toHaveLength(0);
  });

  it('asigna revenue completo si solo hay 1 coach en el booking', () => {
    const map = new Map([['b1', new Set<'omar'>(['omar'])]]);
    const rows = computeCoaches([{ ...baseBooking, price_amount: 800 }], map);
    expect(rows).toHaveLength(1);
    expect(rows[0].coach_id).toBe('omar');
    expect(rows[0].display_name).toBe('Omar');
    expect(rows[0].revenue).toBe(800);
    expect(rows[0].reservas).toBe(1);
  });

  it('reparte revenue cuando un booking involucra a 2 coaches', () => {
    const map = new Map([['b1', new Set<'omar' | 'anibal'>(['omar', 'anibal'])]]);
    const rows = computeCoaches([{ ...baseBooking, price_amount: 400 }], map);
    const omarRow = rows.find((r) => r.coach_id === 'omar');
    const anibalRow = rows.find((r) => r.coach_id === 'anibal');
    expect(omarRow?.revenue).toBe(200);
    expect(anibalRow?.revenue).toBe(200);
  });

  it('cuenta jugadores únicos por owner_id distinto', () => {
    const map = new Map([
      ['b1', new Set<'omar'>(['omar'])],
      ['b2', new Set<'omar'>(['omar'])],
      ['b3', new Set<'omar'>(['omar'])],
    ]);
    const rows = computeCoaches(
      [
        { ...baseBooking, booking_id: 'b1', owner_id: 'player-1' },
        { ...baseBooking, booking_id: 'b2', owner_id: 'player-2' },
        { ...baseBooking, booking_id: 'b3', owner_id: 'player-1' },
      ],
      map
    );
    expect(rows[0].reservas).toBe(3);
    expect(rows[0].jugadores_unicos).toBe(2);
  });

  it('toma la última reserva más reciente', () => {
    const map = new Map([
      ['b1', new Set<'omar'>(['omar'])],
      ['b2', new Set<'omar'>(['omar'])],
    ]);
    const rows = computeCoaches(
      [
        { ...baseBooking, booking_id: 'b1', booking_start: '2026-04-10T18:00:00Z' },
        { ...baseBooking, booking_id: 'b2', booking_start: '2026-04-20T18:00:00Z' },
      ],
      map
    );
    expect(rows[0].ultima_reserva).toBe('2026-04-20T18:00:00Z');
  });

  it('display_name capitaliza el slug correctamente', () => {
    const map = new Map([['b1', new Set<'anibal'>(['anibal'])]]);
    const rows = computeCoaches([baseBooking], map);
    expect(rows[0].display_name).toBe('Aníbal');
  });
});
