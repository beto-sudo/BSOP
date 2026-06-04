import { describe, it, expect } from 'vitest';
import { normCode, scoreVendor, computeVendorScores } from './peptides-score';
import type { Vendor, Test } from './peptides';

const v = (over: Partial<Vendor>): Vendor => ({
  id: 'x',
  codigo: 'X',
  nombre: 'X',
  estado: 'activo',
  precio_mg: null,
  precio_mg_sale: null,
  moneda: 'USD',
  us_warehouse: null,
  china_warehouse: null,
  eu_warehouse: null,
  metodos_pago: null,
  primer_contacto: null,
  garantia: null,
  notas: null,
  nota_personal: null,
  fuente_url: null,
  imported_at: null,
  ...over,
});

const t = (over: Partial<Test>): Test => ({
  id: 't',
  vendor_codigo: 'X',
  peptido: 'Reta',
  test_date: null,
  batch: null,
  expected_mass_mg: null,
  mass_mg: null,
  purity_pct: 99.5,
  tfa: null,
  endotoxin: null,
  test_lab: null,
  file_name: null,
  lab_url: null,
  ...over,
});

describe('normCode', () => {
  it('normaliza al token corto en mayúsculas', () => {
    expect(normCode('BFF/AMO')).toBe('BFF');
    expect(normCode('GYC peptides')).toBe('GYC');
    expect(normCode('aavant')).toBe('AAVANT');
    expect(normCode(null)).toBe('');
  });
});

describe('scoreVendor', () => {
  const ctx = { minPrice: 0.5, maxPrice: 1.0 };

  it('puntúa alto a un vendor activo, barato, muy probado y limpio', () => {
    const tests = Array.from({ length: 12 }, () => t({ purity_pct: 99.6, endotoxin: '<0.5' }));
    const s = scoreVendor(v({ precio_mg: 0.5 }), tests, ctx);
    expect(s.total).toBeGreaterThan(80);
    expect(s.precio).toBe(100); // el más barato del rango
    expect(s.endotoxina).toBe(100); // probado y limpio
    expect(s.nCoas).toBe(12);
  });

  it('el estado removido hunde el total vs el mismo vendor activo', () => {
    const tests = [t({}), t({})];
    const activo = scoreVendor(v({ estado: 'activo', precio_mg: 0.6 }), tests, ctx);
    const removido = scoreVendor(v({ estado: 'removido', precio_mg: 0.6 }), tests, ctx);
    expect(removido.total).toBeLessThan(activo.total);
  });

  it('marca endotoxina alta y la castiga', () => {
    const s = scoreVendor(v({ precio_mg: 0.7 }), [t({ endotoxin: '>2300 EU' })], ctx);
    expect(s.endotoxinaFlag).toBe(true);
    expect(s.endotoxina).toBe(0);
  });

  it('precio null cuando el vendor no tiene precio', () => {
    const s = scoreVendor(v({ precio_mg: null }), [t({})], ctx);
    expect(s.precio).toBeNull();
  });
});

describe('computeVendorScores', () => {
  it('liga COAs por código normalizado (BFF ↔ BFF/AMO)', () => {
    const scores = computeVendorScores(
      [v({ codigo: 'BFF', precio_mg: 0.6 })],
      [t({ vendor_codigo: 'BFF/AMO', purity_pct: 99 })]
    );
    expect(scores.get('BFF')?.nCoas).toBe(1);
  });
});
