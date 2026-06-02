import { describe, expect, it } from 'vitest';
import { sumaPorcentajes, capTableStatus, capTableStatusLabel } from './cap-table';

const s = (porcentaje: number, activo = true) => ({ porcentaje, activo });

describe('sumaPorcentajes', () => {
  it('suma solo socios activos', () => {
    expect(sumaPorcentajes([s(33.3333), s(33.3333), s(33.3333)])).toBeCloseTo(99.9999, 4);
    expect(sumaPorcentajes([s(50), s(50, false)])).toBe(50);
  });
  it('vacío = 0', () => {
    expect(sumaPorcentajes([])).toBe(0);
  });
  it('ignora valores no finitos', () => {
    expect(sumaPorcentajes([s(50), { porcentaje: NaN, activo: true }])).toBe(50);
  });
});

describe('capTableStatus', () => {
  it('vacío sin socios activos', () => {
    expect(capTableStatus([])).toBe('vacio');
    expect(capTableStatus([s(100, false)])).toBe('vacio');
  });
  it('ok a 100 exacto y a tres tercios (tolerancia 0.01)', () => {
    expect(capTableStatus([s(100)])).toBe('ok');
    expect(capTableStatus([s(33.3333), s(33.3333), s(33.3333)])).toBe('ok');
  });
  it('incompleto < 100', () => {
    expect(capTableStatus([s(33.3333), s(33.3333)])).toBe('incompleto');
  });
  it('excedido > 100', () => {
    expect(capTableStatus([s(50), s(60)])).toBe('excedido');
  });
});

describe('capTableStatusLabel', () => {
  it('ok muestra check', () => {
    expect(capTableStatusLabel('ok', 100)).toBe('Σ 100% ✓');
  });
  it('incompleto muestra el faltante', () => {
    expect(capTableStatusLabel('incompleto', 66.67)).toContain('falta');
  });
  it('excedido muestra el excedente', () => {
    expect(capTableStatusLabel('excedido', 110)).toContain('excede');
  });
});
