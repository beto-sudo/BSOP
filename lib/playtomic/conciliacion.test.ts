import { describe, expect, it } from 'vitest';
import { isWithinTimestampWindow, rankCandidates, type WaitryCandidate } from './conciliacion';

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
    timestamp: '2026-04-08T01:25:00Z',
    notes: null,
    total_amount: 200,
    unit_price: 200,
    quantity: 1,
    ...overrides,
  };
}

describe('isWithinTimestampWindow', () => {
  it('accepts candidate within ±3h by default', () => {
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T01:25:00Z')).toBe(true);
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-07T22:31:00Z')).toBe(true);
  });

  it('rejects candidate outside ±3h', () => {
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-07T22:29:00Z')).toBe(false);
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T04:31:00Z')).toBe(false);
  });

  it('respects custom tolerance', () => {
    const oneHour = 60 * 60 * 1000;
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T02:00:00Z', oneHour)).toBe(
      true
    );
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', '2026-04-08T02:31:00Z', oneHour)).toBe(
      false
    );
  });

  it('returns false on invalid timestamps', () => {
    expect(isWithinTimestampWindow('not-a-date', '2026-04-08T01:30:00Z')).toBe(false);
    expect(isWithinTimestampWindow('2026-04-08T01:30:00Z', 'invalid')).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('filters out candidates outside the timestamp window', () => {
    const offWindow = candidate({ order_id: 'far', timestamp: '2026-04-07T20:00:00Z' });
    const inWindow = candidate({ order_id: 'near', timestamp: '2026-04-08T01:25:00Z' });
    const ranked = rankCandidates(baseBooking, [offWindow, inWindow]);
    expect(ranked.map((r) => r.order_id)).toEqual(['near']);
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

  it('rewards typical renta-cancha unit price', () => {
    const typical = candidate({ order_id: 'typical', unit_price: 200 });
    const atypical = candidate({ order_id: 'atypical', unit_price: 350, total_amount: 350 });
    const ranked = rankCandidates(baseBooking, [atypical, typical]);
    expect(ranked[0].order_id).toBe('typical');
  });

  it('returns empty array when all candidates are out of window', () => {
    const far1 = candidate({ order_id: 'a', timestamp: '2025-12-01T00:00:00Z' });
    const far2 = candidate({ order_id: 'b', timestamp: '2026-08-01T00:00:00Z' });
    expect(rankCandidates(baseBooking, [far1, far2])).toEqual([]);
  });
});
