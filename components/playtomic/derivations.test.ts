import { describe, expect, it } from 'vitest';
import { computeCoaches } from './derivations';
import type { Booking, PlayerRow } from './types';

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

describe('computeCoaches', () => {
  it('ignora bookings sin coach_ids', () => {
    const rows = computeCoaches([{ ...baseBooking, coach_ids: null }], []);
    expect(rows).toHaveLength(0);
  });

  it('ignora bookings cancelados', () => {
    const rows = computeCoaches(
      [{ ...baseBooking, coach_ids: ['omar-id'], is_canceled: true }],
      []
    );
    expect(rows).toHaveLength(0);
  });

  it('asigna revenue completo si solo hay 1 coach', () => {
    const rows = computeCoaches(
      [{ ...baseBooking, coach_ids: ['omar-id'], price_amount: 800 }],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].coach_id).toBe('omar-id');
    expect(rows[0].revenue).toBe(800);
    expect(rows[0].reservas).toBe(1);
  });

  it('reparte revenue entre N coaches del mismo booking', () => {
    const rows = computeCoaches(
      [{ ...baseBooking, coach_ids: ['omar-id', 'paco-id'], price_amount: 400 }],
      []
    );
    const omar = rows.find((r) => r.coach_id === 'omar-id');
    const paco = rows.find((r) => r.coach_id === 'paco-id');
    expect(omar?.revenue).toBe(200);
    expect(paco?.revenue).toBe(200);
  });

  it('cuenta jugadores únicos por owner_id distinto', () => {
    const rows = computeCoaches(
      [
        { ...baseBooking, booking_id: 'b1', coach_ids: ['omar-id'], owner_id: 'player-1' },
        { ...baseBooking, booking_id: 'b2', coach_ids: ['omar-id'], owner_id: 'player-2' },
        { ...baseBooking, booking_id: 'b3', coach_ids: ['omar-id'], owner_id: 'player-1' },
      ],
      []
    );
    const omar = rows.find((r) => r.coach_id === 'omar-id');
    expect(omar?.reservas).toBe(3);
    expect(omar?.jugadores_unicos).toBe(2);
  });

  it('toma la última reserva (booking_start más reciente)', () => {
    const rows = computeCoaches(
      [
        {
          ...baseBooking,
          booking_id: 'b1',
          coach_ids: ['omar-id'],
          booking_start: '2026-04-10T18:00:00Z',
        },
        {
          ...baseBooking,
          booking_id: 'b2',
          coach_ids: ['omar-id'],
          booking_start: '2026-04-20T18:00:00Z',
        },
        {
          ...baseBooking,
          booking_id: 'b3',
          coach_ids: ['omar-id'],
          booking_start: '2026-04-15T18:00:00Z',
        },
      ],
      []
    );
    const omar = rows.find((r) => r.coach_id === 'omar-id');
    expect(omar?.ultima_reserva).toBe('2026-04-20T18:00:00Z');
  });

  it('resuelve display_name desde players cuando matchea coach_id', () => {
    const players: PlayerRow[] = [
      {
        playtomic_id: 'omar-id',
        name: 'Omar Coach',
        email: 'omar@club.com',
        player_type: null,
        favorite_sport: null,
      },
    ];
    const rows = computeCoaches([{ ...baseBooking, coach_ids: ['omar-id'] }], players);
    expect(rows[0].display_name).toBe('Omar Coach');
  });

  it('fallback a coach_<8chars> cuando no hay match en players', () => {
    const rows = computeCoaches([{ ...baseBooking, coach_ids: ['abc12345xyz999'] }], []);
    expect(rows[0].display_name).toBe('coach_abc12345');
  });

  it('ignora coach_ids vacíos en el array', () => {
    const rows = computeCoaches([{ ...baseBooking, coach_ids: ['omar-id', ''] }], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].coach_id).toBe('omar-id');
  });
});
