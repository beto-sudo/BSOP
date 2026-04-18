import { describe, it, expect } from 'vitest';

import { getLocalDayBoundsUtc, zonedDateTimeToUtcIso } from './timezone';

/**
 * Timezone utility tests.
 *
 * BSOP stores timestamps in UTC in Supabase but reports/queries are driven
 * by the user's local day. These helpers bridge the two. The tests below
 * lock in the behavior for the timezones BSOP currently cares about:
 *
 *   • America/Mexico_City — year-round UTC-6 since 2022 (no DST)
 *   • UTC — reference/no-op case
 *   • Asia/Tokyo — positive offset, no DST
 *   • America/New_York — exercises DST (EST=UTC-5 / EDT=UTC-4)
 */

describe('zonedDateTimeToUtcIso', () => {
  it('converts Mexico City midnight to 06:00 UTC (UTC-6, no DST)', () => {
    expect(zonedDateTimeToUtcIso('2026-01-15', '00:00:00', 'America/Mexico_City')).toBe(
      '2026-01-15T06:00:00.000Z'
    );
  });

  it('converts Mexico City noon in summer to 18:00 UTC (still UTC-6, MX dropped DST in 2022)', () => {
    // This guards against someone re-enabling DST-like behavior for Mexico.
    expect(zonedDateTimeToUtcIso('2026-07-15', '12:00:00', 'America/Mexico_City')).toBe(
      '2026-07-15T18:00:00.000Z'
    );
  });

  it('is a no-op for UTC input', () => {
    expect(zonedDateTimeToUtcIso('2026-01-15', '12:30:45', 'UTC')).toBe('2026-01-15T12:30:45.000Z');
  });

  it('converts Tokyo noon to 03:00 UTC (UTC+9)', () => {
    expect(zonedDateTimeToUtcIso('2026-07-15', '12:00:00', 'Asia/Tokyo')).toBe(
      '2026-07-15T03:00:00.000Z'
    );
  });

  it('applies EST (UTC-5) for New York in January', () => {
    expect(zonedDateTimeToUtcIso('2026-01-15', '12:00:00', 'America/New_York')).toBe(
      '2026-01-15T17:00:00.000Z'
    );
  });

  it('applies EDT (UTC-4) for New York in July', () => {
    expect(zonedDateTimeToUtcIso('2026-07-15', '12:00:00', 'America/New_York')).toBe(
      '2026-07-15T16:00:00.000Z'
    );
  });

  it('handles leap day without corruption', () => {
    expect(zonedDateTimeToUtcIso('2028-02-29', '10:30:00', 'America/Mexico_City')).toBe(
      '2028-02-29T16:30:00.000Z'
    );
  });
});

describe('getLocalDayBoundsUtc', () => {
  it('returns local midnight and 23:59:59 in UTC for Mexico City', () => {
    const bounds = getLocalDayBoundsUtc('2026-01-15', 'America/Mexico_City');
    // Midnight local MX (UTC-6) == 06:00 UTC that same calendar day.
    expect(bounds.start).toBe('2026-01-15T06:00:00.000Z');
    // 23:59:59 local MX == 05:59:59 UTC of the following calendar day.
    expect(bounds.end).toBe('2026-01-16T05:59:59.000Z');
  });

  it('bounds a UTC day cleanly', () => {
    const bounds = getLocalDayBoundsUtc('2026-01-15', 'UTC');
    expect(bounds.start).toBe('2026-01-15T00:00:00.000Z');
    expect(bounds.end).toBe('2026-01-15T23:59:59.000Z');
  });

  it('bounds a Tokyo day (UTC+9) crossing the previous UTC day', () => {
    const bounds = getLocalDayBoundsUtc('2026-07-15', 'Asia/Tokyo');
    // Midnight Tokyo (UTC+9) == 15:00 UTC the previous calendar day.
    expect(bounds.start).toBe('2026-07-14T15:00:00.000Z');
    // 23:59:59 Tokyo == 14:59:59 UTC the same calendar day.
    expect(bounds.end).toBe('2026-07-15T14:59:59.000Z');
  });

  it('respects EDT for New York in July', () => {
    const bounds = getLocalDayBoundsUtc('2026-07-15', 'America/New_York');
    // Midnight EDT (UTC-4) == 04:00 UTC same day.
    expect(bounds.start).toBe('2026-07-15T04:00:00.000Z');
    // 23:59:59 EDT == 03:59:59 UTC next day.
    expect(bounds.end).toBe('2026-07-16T03:59:59.000Z');
  });
});
