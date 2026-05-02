import { describe, expect, it } from 'vitest';

import { formatDiffValue, valuesEqual } from './csf-diff';

describe('valuesEqual', () => {
  it('returns true for identical primitives', () => {
    expect(valuesEqual('a', 'a')).toBe(true);
    expect(valuesEqual(42, 42)).toBe(true);
    expect(valuesEqual(true, true)).toBe(true);
  });

  it('treats null and undefined as equivalent', () => {
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(undefined, undefined)).toBe(true);
    expect(valuesEqual(null, undefined)).toBe(true);
  });

  it('treats empty string as equivalent to null', () => {
    // Caso común del SAT: campo vacío en CSF llega como '' o null.
    expect(valuesEqual('', null)).toBe(true);
    expect(valuesEqual(null, '')).toBe(true);
    expect(valuesEqual('', undefined)).toBe(true);
  });

  it('returns false when only one side is null', () => {
    expect(valuesEqual('a', null)).toBe(false);
    expect(valuesEqual(null, 'a')).toBe(false);
    expect(valuesEqual(0, null)).toBe(false);
  });

  it('trims strings before comparing', () => {
    expect(valuesEqual('foo', 'foo  ')).toBe(true);
    expect(valuesEqual('  foo  ', 'foo')).toBe(true);
    expect(valuesEqual(' foo ', ' bar ')).toBe(false);
  });

  it('compares arrays via JSON.stringify (orden-sensitivo)', () => {
    expect(valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(valuesEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(valuesEqual([], [])).toBe(true);
  });

  it('compares objects via JSON.stringify', () => {
    expect(valuesEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    // Property order matters for JSON.stringify — esto es intencional:
    // si el SAT reorganiza un objeto, queremos verlo como diff.
    expect(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  it('returns false for incompatible types', () => {
    expect(valuesEqual('1', 1)).toBe(false);
    expect(valuesEqual([1], { 0: 1 })).toBe(false);
  });
});

describe('formatDiffValue', () => {
  it('returns em-dash for null / undefined / empty string', () => {
    expect(formatDiffValue(null)).toBe('—');
    expect(formatDiffValue(undefined)).toBe('—');
    expect(formatDiffValue('')).toBe('—');
  });

  it('returns "— (vacío)" for empty array', () => {
    expect(formatDiffValue([])).toBe('— (vacío)');
  });

  it('formats primitives via String()', () => {
    expect(formatDiffValue('foo')).toBe('foo');
    expect(formatDiffValue(42)).toBe('42');
    expect(formatDiffValue(true)).toBe('true');
  });

  it('formats array of actividad objects with orden + porcentaje', () => {
    // Shape de `actividades_economicas` que viene del SAT.
    const items = [
      { orden: 1, actividad: 'Servicios profesionales', porcentaje: '50%' },
      { orden: 2, actividad: 'Comercio', porcentaje: '50%' },
    ];
    expect(formatDiffValue(items)).toBe('1. Servicios profesionales (50%)\n2. Comercio (50%)');
  });

  it('handles actividad without orden (uses ?)', () => {
    expect(formatDiffValue([{ actividad: 'Sin orden' }])).toBe('?. Sin orden');
  });

  it('handles actividad without porcentaje', () => {
    expect(formatDiffValue([{ orden: 1, actividad: 'Comercio' }])).toBe('1. Comercio');
  });

  it('formats array of codigo+nombre objects', () => {
    const items = [
      { codigo: '601', nombre: 'Régimen General' },
      { codigo: '612', nombre: 'Personas Físicas' },
    ];
    expect(formatDiffValue(items)).toBe('601 · Régimen General\n612 · Personas Físicas');
  });

  it('formats array of descripcion objects', () => {
    const items = [{ descripcion: 'Pago provisional' }, { descripcion: 'Declaración anual' }];
    expect(formatDiffValue(items)).toBe('Pago provisional\nDeclaración anual');
  });

  it('falls back to String(item) for unknown shapes', () => {
    expect(formatDiffValue(['a', 'b', 'c'])).toBe('a\nb\nc');
  });

  it('prefers actividad shape over descripcion when both present', () => {
    // Si un objeto tiene 'actividad' Y 'descripcion', actividad gana
    // (es más específico — del shape de actividades_economicas).
    const items = [{ actividad: 'X', descripcion: 'desc', orden: 1 }];
    expect(formatDiffValue(items)).toBe('1. X');
  });

  it('prefers codigo+nombre over descripcion when both present', () => {
    const items = [{ codigo: 'A', nombre: 'Alpha', descripcion: 'desc' }];
    expect(formatDiffValue(items)).toBe('A · Alpha');
  });
});
