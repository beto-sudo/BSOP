import { describe, it, expect } from 'vitest';
import { blendTotalMg, blendBreakdown, parseComponentes, type BlendComponente } from './blend';

const KLOW: BlendComponente[] = [
  { nombre: 'TB-500', mg: 10 },
  { nombre: 'BPC-157', mg: 10 },
  { nombre: 'KPV', mg: 10 },
  { nombre: 'GHK-Cu', mg: 50 },
];

describe('blendTotalMg', () => {
  it('suma los mg de los componentes (KLOW = 80mg/vial)', () => {
    expect(blendTotalMg(KLOW)).toBe(80);
  });
  it('devuelve 0 para null/vacío', () => {
    expect(blendTotalMg(null)).toBe(0);
    expect(blendTotalMg([])).toBe(0);
  });
  it('ignora mg no finitos', () => {
    expect(
      blendTotalMg([
        { nombre: 'x', mg: NaN },
        { nombre: 'y', mg: 5 },
      ])
    ).toBe(5);
  });
});

describe('blendBreakdown', () => {
  it('KLOW 80mg en 3mL, jalando 0.3mL → cada componente escala por mL/agua', () => {
    const rows = blendBreakdown(KLOW, 3, 0.3);
    expect(rows).toHaveLength(4);
    // mg = componente.mg × (0.3 / 3) = componente.mg × 0.1 (float, ~1)
    expect(rows[0].nombre).toBe('TB-500');
    expect(rows[0].mg).toBeCloseTo(1, 9);
    expect(rows[1].mg).toBeCloseTo(1, 9);
    expect(rows[2].mg).toBeCloseTo(1, 9);
    expect(rows[3].mg).toBeCloseTo(5, 9); // GHK-Cu 50 × 0.1
    // total jalado = concentración (80/3) × 0.3 = 8mg
    expect(rows.reduce((s, r) => s + r.mg, 0)).toBeCloseTo(8, 9);
  });
  it('expone mcg = mg × 1000', () => {
    const rows = blendBreakdown([{ nombre: 'KPV', mg: 10 }], 2, 0.2);
    expect(rows[0].mg).toBeCloseTo(1, 9);
    expect(rows[0].mcg).toBeCloseTo(1000, 6);
  });
  it('devuelve [] sin agua, sin volumen o sin componentes', () => {
    expect(blendBreakdown(KLOW, 0, 0.3)).toEqual([]);
    expect(blendBreakdown(KLOW, 3, null)).toEqual([]);
    expect(blendBreakdown(KLOW, 3, 0)).toEqual([]);
    expect(blendBreakdown(null, 3, 0.3)).toEqual([]);
  });
});

describe('parseComponentes', () => {
  it('valida y limpia un arreglo válido', () => {
    expect(parseComponentes([{ nombre: ' TB-500 ', mg: 10 }])).toEqual([
      { nombre: 'TB-500', mg: 10 },
    ]);
  });
  it('coacciona mg string numérico', () => {
    expect(parseComponentes([{ nombre: 'KPV', mg: '10' }])).toEqual([{ nombre: 'KPV', mg: 10 }]);
  });
  it('descarta filas sin nombre o con mg ≤ 0 / no numérico', () => {
    expect(
      parseComponentes([
        { nombre: '', mg: 10 },
        { nombre: 'x', mg: 0 },
        { nombre: 'y', mg: -3 },
        { nombre: 'z', mg: 'abc' },
        { nombre: 'ok', mg: 7 },
      ])
    ).toEqual([{ nombre: 'ok', mg: 7 }]);
  });
  it('devuelve null para no-arreglos o arreglos sin componentes válidos', () => {
    expect(parseComponentes(null)).toBeNull();
    expect(parseComponentes('foo')).toBeNull();
    expect(parseComponentes([])).toBeNull();
    expect(parseComponentes([{ nombre: '', mg: 0 }])).toBeNull();
  });
});
