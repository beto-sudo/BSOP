import { describe, expect, it } from 'vitest';

import { avanceLabel, avanceTone, docsPendientesTone } from './ruv-utils';

describe('avanceTone', () => {
  it('neutral cuando no hay viviendas (null)', () => {
    expect(avanceTone(null)).toBe('neutral');
  });
  it('success al 100% o más', () => {
    expect(avanceTone(100)).toBe('success');
    expect(avanceTone(120)).toBe('success');
  });
  it('info entre 50 y 99', () => {
    expect(avanceTone(50)).toBe('info');
    expect(avanceTone(99)).toBe('info');
  });
  it('warning entre 1 y 49', () => {
    expect(avanceTone(1)).toBe('warning');
    expect(avanceTone(49)).toBe('warning');
  });
  it('neutral en 0', () => {
    expect(avanceTone(0)).toBe('neutral');
  });
});

describe('avanceLabel', () => {
  it('"Sin viviendas" cuando es null', () => {
    expect(avanceLabel(null)).toBe('Sin viviendas');
  });
  it('redondea el porcentaje', () => {
    expect(avanceLabel(0)).toBe('0%');
    expect(avanceLabel(66.6)).toBe('67%');
    expect(avanceLabel(100)).toBe('100%');
  });
});

describe('docsPendientesTone', () => {
  it('success cuando no hay pendientes', () => {
    expect(docsPendientesTone(0)).toBe('success');
  });
  it('warning con pocos pendientes (1–5)', () => {
    expect(docsPendientesTone(1)).toBe('warning');
    expect(docsPendientesTone(5)).toBe('warning');
  });
  it('danger con muchos pendientes (>5)', () => {
    expect(docsPendientesTone(6)).toBe('danger');
    expect(docsPendientesTone(27)).toBe('danger');
  });
});
