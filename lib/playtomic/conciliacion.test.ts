import { describe, expect, it } from 'vitest';
import {
  isCanchaProduct,
  isWithinTimestampWindow,
  rankCandidates,
  type WaitryCandidate,
} from './conciliacion';

describe('isCanchaProduct', () => {
  it('accepts the exact "Renta Cancha Padel"', () => {
    expect(isCanchaProduct('Renta Cancha Padel')).toBe(true);
  });

  it('accepts "Renta Tenis ..." variants', () => {
    expect(isCanchaProduct('Renta Tenis Doub. 90 min')).toBe(true);
    expect(isCanchaProduct('Renta Tenis Singles 90 min')).toBe(true);
  });

  it('accepts "Renta Pickleball ..." variants', () => {
    expect(isCanchaProduct('Renta Pickleball Doub. 90 min')).toBe(true);
    expect(isCanchaProduct('Renta Pickleball Doub. 60 min')).toBe(true);
    expect(isCanchaProduct('Renta Pickleball Sing. 60 min')).toBe(true);
    expect(isCanchaProduct('Renta Pickleball Sing 90 min')).toBe(true);
  });

  it('accepts "Uso cancha coach" variants (named coaches and PREMIUM)', () => {
    expect(isCanchaProduct('Uso cancha coach')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach PREMIUM')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach Omar')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach Anibal')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach Manuel')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach Paco')).toBe(true);
    expect(isCanchaProduct('Uso cancha coach PREMIUM Hugo')).toBe(true);
  });

  it('rejects equipment, academies, tournaments and unrelated products', () => {
    expect(isCanchaProduct('Palbea Padel Overgrip')).toBe(false);
    expect(isCanchaProduct('Pelotas Padel Head')).toBe(false);
    expect(isCanchaProduct('Renta de Pala Adidas')).toBe(false);
    expect(isCanchaProduct('Academia Padel')).toBe(false);
    expect(isCanchaProduct('Academia Tenis')).toBe(false);
    expect(isCanchaProduct('Clase de Academia Padel')).toBe(false);
    expect(isCanchaProduct('Torneo 2do Tenis Open')).toBe(false);
    expect(isCanchaProduct('Rey de la Cancha')).toBe(false);
    expect(isCanchaProduct('Reina de la cancha')).toBe(false);
    expect(isCanchaProduct('Pickle Juice')).toBe(false);
    expect(isCanchaProduct('Coca Cola')).toBe(false);
  });

  it('rejects null/undefined/empty', () => {
    expect(isCanchaProduct(null)).toBe(false);
    expect(isCanchaProduct(undefined)).toBe(false);
    expect(isCanchaProduct('')).toBe(false);
  });
});

const baseBooking = {
  booking_start: '2026-04-08T01:30:00Z',
  price_amount: 800,
  owner_name: 'Jose Luis Paz Zablah',
  owner_email: 'drjoseluispazz@gmail.com',
  participant_names: [
    'Jose Luis Paz Zablah',
    'Cristofer Canchola',
    'ARTURO MORALES',
    'Gerardo Del Toro Garibay',
  ],
  participant_emails: [
    'drjoseluispazz@gmail.com',
    'grillo1179@yahoo.com',
    'drmorales@ventrisfertility.com',
    'gerardo.deltoro@hankat.mx',
  ],
};

function candidate(overrides: Partial<WaitryCandidate>): WaitryCandidate {
  return {
    order_id: 'o1',
    timestamp: '2026-04-08T01:35:00Z',
    notes: null,
    total_amount: 200,
    unit_price: 200,
    quantity: 1,
    items: [{ product_name: 'Renta Cancha Padel', quantity: 1, unit_price: 200, total_price: 200 }],
    ...overrides,
  };
}

describe('isWithinTimestampWindow', () => {
  it('accepts post-booking candidates within tolerance (default 2d)', () => {
    // 5 min después — caso típico
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T01:35:00Z')).toBe(true);
    // 1 día después
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-09T01:30:00Z')).toBe(true);
    // 2 días después (justo en el límite)
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-10T01:29:00Z')).toBe(true);
  });

  it('accepts pre-booking candidates within the same tolerance (pago anticipado)', () => {
    // Caso operativo: el cliente reserva y paga en caja días antes de jugar
    // (coach Paco Palacios pagó 27-abr para jugar 4-may). La ventana es
    // simétrica para soportarlo.
    // 5 min antes — paga al registrarse
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T01:25:00Z')).toBe(true);
    // 25 min antes — todavía dentro
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T01:05:00Z')).toBe(true);
    // 1 día antes — pago anticipado típico
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-07T01:30:00Z')).toBe(true);
    // 2 días antes (justo en el límite simétrico)
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-06T01:31:00Z')).toBe(true);
  });

  it('rejects candidates beyond the tolerance on either side', () => {
    // 2d + 1min después
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-10T01:31:00Z')).toBe(false);
    // 2d + 1min antes
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-06T01:29:00Z')).toBe(false);
  });

  it('respects custom tolerance symmetrically', () => {
    const oneHour = 60 * 60 * 1000;
    // ±1h: 30min después → dentro
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T02:00:00Z', oneHour)).toBe(
      true
    );
    // ±1h: 1h+1min después → fuera
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T02:31:00Z', oneHour)).toBe(
      false
    );
    // ±1h: 30min antes → dentro
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T01:00:00Z', oneHour)).toBe(
      true
    );
    // ±1h: 1h+1min antes → fuera
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T00:29:00Z', oneHour)).toBe(
      false
    );
  });

  it('returns false on invalid timestamps', () => {
    expect(isWithinTimestampWindow('not-a-date', '2026-04-08T01:30:00Z')).toBe(false);
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', 'invalid')).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('filters out candidates outside the timestamp window (±2d default)', () => {
    const offWindow = candidate({ order_id: 'far', timestamp: '2026-04-04T20:00:00Z' }); // ~4d antes
    const inWindow = candidate({ order_id: 'near', timestamp: '2026-04-08T01:25:00Z' });
    const ranked = rankCandidates(baseBooking, [offWindow, inWindow]);
    expect(ranked.map((r) => r.order_id)).toEqual(['near']);
  });

  it('accepts pre-booking pagos within the symmetric tolerance (pago anticipado)', () => {
    // Caso operativo (Paco Palacios): cliente reserva y paga en caja
    // días antes de jugar. La ventana es simétrica para verlo.
    const dayBefore = candidate({
      order_id: 'day-before',
      timestamp: '2026-04-07T15:00:00Z',
      notes: 'jose Luis paz',
    });
    const dayAfter = candidate({
      order_id: 'day-after',
      timestamp: '2026-04-09T01:30:00Z',
      notes: 'jose Luis paz',
    });
    const ranked = rankCandidates(baseBooking, [dayBefore, dayAfter]);
    // Ambos dentro de ±2d default → ambos aparecen
    expect(ranked.map((r) => r.order_id)).toContain('day-before');
    expect(ranked.map((r) => r.order_id)).toContain('day-after');
  });

  it('accepts pre-booking pagos at any distance within tolerance', () => {
    const fiveBefore = candidate({
      order_id: 'just-before',
      timestamp: '2026-04-08T01:25:00Z',
    });
    const ranked = rankCandidates(baseBooking, [fiveBefore]);
    expect(ranked.map((r) => r.order_id)).toContain('just-before');
  });

  it('boosts candidate when notes match the owner', () => {
    const ownerMatch = candidate({
      order_id: 'owner',
      timestamp: '2026-04-08T01:17:00Z',
      notes: 'jose Luis paz efectivo',
    });
    const noNotes = candidate({
      order_id: 'plain',
      timestamp: '2026-04-08T01:18:00Z',
      notes: null,
    });
    const ranked = rankCandidates(baseBooking, [noNotes, ownerMatch]);
    expect(ranked[0].order_id).toBe('owner');
    expect(ranked[0].reasons).toContain('Notes coinciden con owner');
  });

  it('boosts candidate when notes match a participant if owner does not match', () => {
    const participantMatch = candidate({
      order_id: 'participant',
      timestamp: '2026-04-08T01:25:00Z',
      notes: 'cristofer canchola tarjeta',
    });
    const noMatch = candidate({
      order_id: 'no-match',
      timestamp: '2026-04-08T01:25:00Z',
      notes: 'cancha 7',
    });
    const ranked = rankCandidates(baseBooking, [noMatch, participantMatch]);
    expect(ranked[0].order_id).toBe('participant');
  });

  it('uses temporal proximity as tiebreaker when notes are absent', () => {
    const closer = candidate({ order_id: 'closer', timestamp: '2026-04-08T01:30:00Z' });
    const further = candidate({ order_id: 'further', timestamp: '2026-04-08T03:00:00Z' });
    const ranked = rankCandidates(baseBooking, [further, closer]);
    expect(ranked[0].order_id).toBe('closer');
  });

  it('derives the expected per-player price from the booking, not a hardcoded value', () => {
    // Padel: $800 / 4 jugadores = $200/jugador
    const padelBooking = { ...baseBooking, price_amount: 800 };
    const padelCandidate = candidate({ order_id: 'padel-200', unit_price: 200, total_amount: 200 });
    const padelOff = candidate({ order_id: 'padel-150', unit_price: 150, total_amount: 150 });
    const padelRanked = rankCandidates(padelBooking, [padelOff, padelCandidate]);
    expect(padelRanked[0].order_id).toBe('padel-200');

    // Tenis singles: $300 / 2 jugadores = $150/jugador. Aquí $200 NO debe ganar.
    const tenisSingles = {
      ...baseBooking,
      price_amount: 300,
      participant_names: ['Player A', 'Player B'],
    };
    const tenisCandidate = candidate({ order_id: 'tenis-150', unit_price: 150, total_amount: 150 });
    const padelPriceOff = candidate({ order_id: 'tenis-200', unit_price: 200, total_amount: 200 });
    const tenisRanked = rankCandidates(tenisSingles, [padelPriceOff, tenisCandidate]);
    expect(tenisRanked[0].order_id).toBe('tenis-150');

    // Tenis dobles con descuento: $400 / 4 jugadores = $100/jugador.
    const tenisDobles = {
      ...baseBooking,
      price_amount: 400,
      participant_names: ['A', 'B', 'C', 'D'],
    };
    const dobleMatch = candidate({ order_id: 'doble-100', unit_price: 100, total_amount: 100 });
    const dobleOff = candidate({ order_id: 'doble-200', unit_price: 200, total_amount: 200 });
    const dobleRanked = rankCandidates(tenisDobles, [dobleOff, dobleMatch]);
    expect(dobleRanked[0].order_id).toBe('doble-100');
  });

  it('rewards tickets that cover whole-court or multi-player payments', () => {
    // Padel $800/4 = $200. Un ticket de $400 = 2 jugadores en un solo cargo.
    const wholeCourt = candidate({
      order_id: 'whole',
      unit_price: 800,
      quantity: 1,
      total_amount: 800,
    });
    const halfCourt = candidate({
      order_id: 'half',
      unit_price: 200,
      quantity: 2,
      total_amount: 400,
    });
    const single = candidate({
      order_id: 'single',
      unit_price: 200,
      quantity: 1,
      total_amount: 200,
    });
    const ranked = rankCandidates(
      baseBooking,
      [single, halfCourt, wholeCourt].map((c, i) => ({
        ...c,
        timestamp: `2026-04-08T01:${20 + i}:00Z`,
      }))
    );
    expect(ranked.map((r) => r.order_id)).toContain('whole');
    expect(ranked.map((r) => r.order_id)).toContain('half');
    expect(ranked.map((r) => r.order_id)).toContain('single');
    // Los tres son matches válidos; la posición exacta depende de proximidad
    // temporal. Lo importante: ninguno debe quedar fuera por monto.
  });

  it('falls back to booking total when participants are not captured', () => {
    const noParticipants = {
      ...baseBooking,
      participant_names: [],
      price_amount: 600,
    };
    const fullMatch = candidate({ order_id: 'full', unit_price: 600, total_amount: 600 });
    const noMatch = candidate({ order_id: 'no', unit_price: 50, total_amount: 50 });
    const ranked = rankCandidates(noParticipants, [noMatch, fullMatch]);
    expect(ranked[0].order_id).toBe('full');
  });

  it('returns empty array when all candidates are out of window', () => {
    const far1 = candidate({ order_id: 'a', timestamp: '2025-12-01T00:00:00Z' });
    const far2 = candidate({ order_id: 'b', timestamp: '2026-08-01T00:00:00Z' });
    expect(rankCandidates(baseBooking, [far1, far2])).toEqual([]);
  });

  it('boosts coach tickets when the booking has a known coach as participant', () => {
    const coachBooking = {
      ...baseBooking,
      owner_name: 'Cliente Random',
      participant_names: ['Cliente Random', 'Omar Berlanga'],
    };
    const coachTicket = candidate({
      order_id: 'coach-1',
      timestamp: '2026-04-08T01:35:00Z',
      total_amount: 300,
      unit_price: 300,
      items: [{ product_name: 'Uso cancha coach', quantity: 1, unit_price: 300, total_price: 300 }],
    });
    const otherTicket = candidate({
      order_id: 'other',
      timestamp: '2026-04-08T01:35:00Z',
      total_amount: 200,
      unit_price: 200,
      items: [
        { product_name: 'Renta Cancha Padel', quantity: 1, unit_price: 200, total_price: 200 },
      ],
    });
    const ranked = rankCandidates(coachBooking, [otherTicket, coachTicket]);
    expect(ranked[0].order_id).toBe('coach-1');
    expect(ranked[0].reasons).toContain('Reserva con coach + ticket "Uso cancha coach"');
  });

  it('gives extra bonus when the coach name in the product matches the booking coach', () => {
    const coachBooking = {
      ...baseBooking,
      owner_name: 'Omar Berlanga',
      participant_names: ['Omar Berlanga', 'Cliente'],
    };
    const namedCoach = candidate({
      order_id: 'named',
      timestamp: '2026-04-08T01:35:00Z',
      total_amount: 300,
      unit_price: 300,
      items: [
        {
          product_name: 'Uso cancha coach Omar',
          quantity: 1,
          unit_price: 300,
          total_price: 300,
        },
      ],
    });
    const genericCoach = candidate({
      order_id: 'generic',
      timestamp: '2026-04-08T01:35:00Z',
      total_amount: 300,
      unit_price: 300,
      items: [{ product_name: 'Uso cancha coach', quantity: 1, unit_price: 300, total_price: 300 }],
    });
    const ranked = rankCandidates(coachBooking, [genericCoach, namedCoach]);
    expect(ranked[0].order_id).toBe('named');
    expect(ranked[0].reasons.some((r) => r.includes('Nombre del coach'))).toBe(true);
  });

  it('does not boost coach tickets when the booking has no coach', () => {
    const regularBooking = {
      ...baseBooking,
      owner_name: 'Cliente Sin Coach',
      participant_names: ['Cliente Sin Coach', 'Otro Cliente'],
    };
    const coachTicket = candidate({
      order_id: 'coach',
      timestamp: '2026-04-08T01:35:00Z',
      total_amount: 300,
      unit_price: 300,
      items: [
        { product_name: 'Uso cancha coach Omar', quantity: 1, unit_price: 300, total_price: 300 },
      ],
    });
    const ranked = rankCandidates(regularBooking, [coachTicket]);
    expect(ranked[0].reasons.some((r) => r.includes('coach'))).toBe(false);
  });
});
