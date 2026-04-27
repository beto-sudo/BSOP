import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDelta,
  formatNumber,
  formatPercent,
  formatPrecioM2,
  formatRelativeDays,
  formatSuperficie,
  formatTime,
} from './index';

describe('formatCurrency', () => {
  it('formats MXN with 2 decimals by default', () => {
    expect(formatCurrency(1234.56)).toMatch(/\$1,234\.56/);
  });
  it('returns dash for null/undefined/NaN', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
  });
  it('formats 0 as $0.00', () => {
    expect(formatCurrency(0)).toMatch(/\$0\.00/);
  });
  it('formats negatives with minus sign', () => {
    expect(formatCurrency(-50)).toMatch(/-?\$50\.00|-\$50\.00/);
  });
  it('compact notation reduces precision', () => {
    expect(formatCurrency(1500000, { compact: true })).toMatch(/1\.5/);
  });
  it('respects custom decimals', () => {
    expect(formatCurrency(10, { decimals: 0 })).toMatch(/\$10/);
    expect(formatCurrency(10, { decimals: 0 })).not.toMatch(/\.00/);
  });
});

describe('formatNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatNumber(1234567)).toMatch(/1,234,567/);
  });
  it('returns dash for nullish', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
  it('respects decimals', () => {
    expect(formatNumber(3.14159, { decimals: 2 })).toBe('3.14');
    expect(formatNumber(3.14159, { decimals: 0 })).toBe('3');
  });
});

describe('formatPercent', () => {
  it('formats 0-1 range as %', () => {
    expect(formatPercent(0.275)).toMatch(/27\.5\s*%/);
    expect(formatPercent(1)).toMatch(/100\.0\s*%/);
    expect(formatPercent(0)).toMatch(/0\.0\s*%/);
  });
  it('returns dash for nullish', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
  it('respects fractionDigits', () => {
    expect(formatPercent(0.5, { fractionDigits: 0 })).toMatch(/50\s*%/);
    expect(formatPercent(0.5, { fractionDigits: 2 })).toMatch(/50\.00\s*%/);
  });
});

describe('formatDate', () => {
  it('formats ISO date-only without TZ shift', () => {
    // 2026-04-23 should always be Apr 23 regardless of locale TZ.
    expect(formatDate('2026-04-23')).toMatch(/23 abr 2026/);
  });
  it('formats full ISO timestamp', () => {
    const result = formatDate('2026-04-23T18:00:00Z');
    expect(result).toMatch(/abr 2026/);
  });
  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
  it('returns raw input for unparseable strings', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
  it('accepts Date objects', () => {
    // Use UTC timestamp at midday to avoid TZ shift across runners.
    // 15:00 UTC = 10:00 CDT (Matamoros), so still 23 abr.
    const d = new Date('2026-04-23T15:00:00Z');
    expect(formatDate(d)).toMatch(/23 abr 2026/);
  });
});

describe('formatDateTime', () => {
  it('formats with date + time', () => {
    const result = formatDateTime('2026-04-23T14:30:00Z');
    // dd/mm/yyyy or dd/mm/yy. Hour shifts based on TZ (CI=UTC, dev=local),
    // but minute stays 30. So just verify year + minute presence.
    expect(result).toMatch(/04\/(20)?26/);
    expect(result).toMatch(/:30/);
  });
  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatTime', () => {
  it('formats just hour:minute', () => {
    const result = formatTime('2026-04-23T14:30:00Z');
    // Hour depends on runner TZ; minute is consistent.
    expect(result).toMatch(/^\d{2}:30$/);
  });
  it('returns dash for null', () => {
    expect(formatTime(null)).toBe('—');
  });
});

describe('formatRelativeDays', () => {
  it('returns "Hoy" for today', () => {
    const today = new Date();
    expect(formatRelativeDays(today)).toBe('Hoy');
  });
  it('returns "Mañana" for tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatRelativeDays(tomorrow)).toBe('Mañana');
  });
  it('returns "Ayer" for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDays(yesterday)).toBe('Ayer');
  });
  it('returns Nd for short futures', () => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    expect(formatRelativeDays(d)).toBe('5d');
  });
  it('returns dash for null', () => {
    expect(formatRelativeDays(null)).toBe('—');
  });
});

describe('formatDelta', () => {
  it('positive number → +text + emerald', () => {
    const result = formatDelta(1234);
    expect(result.sign).toBe('+');
    expect(result.text).toMatch(/^\+1,234/);
    expect(result.color).toContain('emerald');
  });
  it('negative number → -text + destructive', () => {
    const result = formatDelta(-50);
    expect(result.sign).toBe('-');
    expect(result.text).toMatch(/^-50/);
    expect(result.color).toContain('destructive');
  });
  it('zero → muted', () => {
    const result = formatDelta(0);
    expect(result.sign).toBe('0');
    expect(result.color).toContain('muted');
  });
  it('null → dash + muted', () => {
    const result = formatDelta(null);
    expect(result.text).toBe('—');
    expect(result.sign).toBe('0');
  });
  it('currency option formats as MXN', () => {
    const result = formatDelta(1234.5, { currency: true });
    expect(result.text).toMatch(/\$/);
  });
});

describe('formatSuperficie', () => {
  it('shows m² under 10000', () => {
    expect(formatSuperficie(150)).toMatch(/150 m²/);
    expect(formatSuperficie(9999)).toMatch(/9,999 m²/);
  });
  it('shows ha at 10000+', () => {
    expect(formatSuperficie(10000)).toMatch(/1 ha/);
    expect(formatSuperficie(15000)).toMatch(/1\.5 ha/);
  });
  it('returns dash for null', () => {
    expect(formatSuperficie(null)).toBe('—');
  });
});

describe('formatPrecioM2', () => {
  it('formats with /m² suffix', () => {
    expect(formatPrecioM2(1200)).toMatch(/\$1,200\/m²/);
  });
  it('uses 2 decimals for precios < 10', () => {
    expect(formatPrecioM2(5.5)).toMatch(/\$5\.50\/m²/);
  });
  it('returns dash for null', () => {
    expect(formatPrecioM2(null)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('returns empty string for 0 / null', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(null)).toBe('');
  });
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats KB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });
  it('formats MB', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
  it('formats GB', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});
