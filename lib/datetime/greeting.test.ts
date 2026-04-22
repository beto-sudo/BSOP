import { describe, it, expect } from 'vitest';

import { getGreeting, formatLongDate } from './greeting';

/**
 * Los tests de getGreeting usan un mock de `t` que devuelve la clave que recibe.
 * Así no dependemos del diccionario real de i18n y aislamos la lógica de franja
 * horaria. La franja corta:
 *   hora < 12   → morning
 *   12 <= hora < 19 → afternoon
 *   hora >= 19  → evening
 */
const identityT = (key: string) => key;

describe('getGreeting', () => {
  it('devuelve greeting.morning antes de mediodía', () => {
    expect(getGreeting(new Date('2026-04-22T08:15:00'), identityT)).toBe('greeting.morning');
  });

  it('devuelve greeting.afternoon entre 12 y 19', () => {
    expect(getGreeting(new Date('2026-04-22T14:30:00'), identityT)).toBe('greeting.afternoon');
  });

  it('devuelve greeting.evening desde las 19 en adelante', () => {
    expect(getGreeting(new Date('2026-04-22T21:05:00'), identityT)).toBe('greeting.evening');
  });
});

describe('formatLongDate', () => {
  it('incluye el año en ambos locales', () => {
    const d = new Date('2026-04-22T12:00:00');
    expect(formatLongDate(d, 'es')).toMatch(/2026/);
    expect(formatLongDate(d, 'en')).toMatch(/2026/);
  });
});
