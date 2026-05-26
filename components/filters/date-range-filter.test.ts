/**
 * Tests del helper puro `isInDateRange` que gobierna el filtrado en el
 * primitive `<DateRangeFilter>`. Iniciativa dilesa-tablas-filtros-columnas.
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_DATE_RANGE, isDateRangeActive, isInDateRange } from './date-range-filter';

describe('isInDateRange', () => {
  it('sin rango activo pasa todo (incluso null)', () => {
    expect(isInDateRange('2026-05-15', EMPTY_DATE_RANGE)).toBe(true);
    expect(isInDateRange(null, EMPTY_DATE_RANGE)).toBe(true);
    expect(isInDateRange(undefined, EMPTY_DATE_RANGE)).toBe(true);
    expect(isInDateRange('', EMPTY_DATE_RANGE)).toBe(true);
  });

  it('con rango activo, null/undefined/"" se excluyen', () => {
    const r = { from: '2026-01-01', to: null };
    expect(isInDateRange(null, r)).toBe(false);
    expect(isInDateRange(undefined, r)).toBe(false);
    expect(isInDateRange('', r)).toBe(false);
  });

  it('rango inclusivo en ambos extremos', () => {
    const r = { from: '2026-05-10', to: '2026-05-20' };
    expect(isInDateRange('2026-05-10', r)).toBe(true);
    expect(isInDateRange('2026-05-15', r)).toBe(true);
    expect(isInDateRange('2026-05-20', r)).toBe(true);
    expect(isInDateRange('2026-05-09', r)).toBe(false);
    expect(isInDateRange('2026-05-21', r)).toBe(false);
  });

  it('solo from acota por abajo', () => {
    const r = { from: '2026-05-10', to: null };
    expect(isInDateRange('2026-05-09', r)).toBe(false);
    expect(isInDateRange('2026-05-10', r)).toBe(true);
    expect(isInDateRange('2030-01-01', r)).toBe(true);
  });

  it('solo to acota por arriba', () => {
    const r = { from: null, to: '2026-05-20' };
    expect(isInDateRange('1999-01-01', r)).toBe(true);
    expect(isInDateRange('2026-05-20', r)).toBe(true);
    expect(isInDateRange('2026-05-21', r)).toBe(false);
  });

  it('acepta timestamptz completo (corta a YYYY-MM-DD)', () => {
    const r = { from: '2026-05-10', to: '2026-05-20' };
    expect(isInDateRange('2026-05-15T10:30:00.000Z', r)).toBe(true);
    expect(isInDateRange('2026-05-21T00:00:00.000Z', r)).toBe(false);
  });
});

describe('isDateRangeActive', () => {
  it('false sólo cuando ambos extremos son null/empty', () => {
    expect(isDateRangeActive(EMPTY_DATE_RANGE)).toBe(false);
    expect(isDateRangeActive({ from: null, to: null })).toBe(false);
    expect(isDateRangeActive({ from: '2026-01-01', to: null })).toBe(true);
    expect(isDateRangeActive({ from: null, to: '2026-01-01' })).toBe(true);
    expect(isDateRangeActive({ from: '2026-01-01', to: '2026-12-31' })).toBe(true);
  });
});
