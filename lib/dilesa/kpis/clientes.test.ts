import { describe, expect, it } from 'vitest';
import { deriveClientesKpis, type ClienteForKpis } from './clientes';

function c(overrides: Partial<ClienteForKpis>): ClienteForKpis {
  return {
    numVentas: 1,
    numActivas: 1,
    montoTotal: 0,
    email: null,
    telefono: null,
    ...overrides,
  };
}

describe('deriveClientesKpis (DILESA Clientes — ADR-034)', () => {
  it('returns 5 KPIs in pivote D12 order', () => {
    const kpis = deriveClientesKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'total',
      'activos',
      'repetidores',
      'compra_promedio',
      'contactables',
    ]);
  });

  it('total = rows.length', () => {
    expect(deriveClientesKpis([c({}), c({}), c({})])[0]?.value).toBe(3);
  });

  it('con venta activa = clientes con numActivas > 0', () => {
    const rows = [c({ numActivas: 1 }), c({ numActivas: 0 }), c({ numActivas: 2 })];
    expect(deriveClientesKpis(rows)[1]?.value).toBe(2);
  });

  it('repetidores = clientes con numVentas > 1', () => {
    const rows = [c({ numVentas: 1 }), c({ numVentas: 2 }), c({ numVentas: 5 })];
    expect(deriveClientesKpis(rows)[2]?.value).toBe(2);
  });

  it('compra promedio = mean(montoTotal)', () => {
    const rows = [c({ montoTotal: 1_000_000 }), c({ montoTotal: 3_000_000 })];
    // mean = 2M
    expect(String(deriveClientesKpis(rows)[3]?.value)).toContain('2');
  });

  it('compra promedio devuelve "—" cuando no hay clientes', () => {
    expect(deriveClientesKpis([])[3]?.value).toBe('—');
  });

  it('% contactables = clientes con email OR telefono / total', () => {
    const rows = [
      c({ email: 'a@b.com' }),
      c({ telefono: '555' }),
      c({ email: 'c@d.com', telefono: '999' }),
      c({}), // ninguno
    ];
    // 3/4 = 75.0%
    expect(String(deriveClientesKpis(rows)[4]?.value)).toContain('75');
  });

  it('% contactables devuelve "—" cuando no hay rows', () => {
    expect(deriveClientesKpis([])[4]?.value).toBe('—');
  });

  it('reactivity: filtrar a subset cambia todos los KPIs', () => {
    const todos = [
      c({ numVentas: 1, numActivas: 1, montoTotal: 1_000_000, email: 'a@b.com' }),
      c({ numVentas: 3, numActivas: 2, montoTotal: 5_000_000 }),
    ];
    const soloRepetidores = todos.filter((r) => r.numVentas > 1);
    const k = deriveClientesKpis(soloRepetidores);
    expect(k[0]?.value).toBe(1);
    expect(k[2]?.value).toBe(1);
    expect(String(k[3]?.value)).toContain('5'); // $5M promedio (sólo el repetidor)
    expect(String(k[4]?.value)).toMatch(/^0[.,]0\s?%$/); // ese cliente no tiene contacto
  });
});
