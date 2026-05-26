import { describe, expect, it } from 'vitest';
import { deriveVendedoresKpis, type VendedorForKpis } from './vendedores';

function v(overrides: Partial<VendedorForKpis>): VendedorForKpis {
  return { nombre: 'Vendedor', numVentas: 1, montoTotal: 0, ...overrides };
}

describe('deriveVendedoresKpis (DILESA Vendedores — ADR-034)', () => {
  it('returns 5 KPIs in curated order', () => {
    const kpis = deriveVendedoresKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'activos',
      'ventas_total',
      'monto_total',
      'promedio',
      'top',
    ]);
  });

  it('activos = count(numVentas > 0)', () => {
    const rows = [v({ numVentas: 1 }), v({ numVentas: 5 }), v({ numVentas: 0 })];
    expect(deriveVendedoresKpis(rows)[0]?.value).toBe(2);
  });

  it('ventas_total = SUM(numVentas)', () => {
    const rows = [v({ numVentas: 3 }), v({ numVentas: 5 }), v({ numVentas: 2 })];
    expect(deriveVendedoresKpis(rows)[1]?.value).toBe(10);
  });

  it('$ vendido = SUM(montoTotal) compact', () => {
    const rows = [v({ montoTotal: 1_500_000 }), v({ montoTotal: 2_500_000 })];
    expect(String(deriveVendedoresKpis(rows)[2]?.value)).toContain('4');
  });

  it('$ vendido devuelve "—" cuando no hay rows', () => {
    expect(deriveVendedoresKpis([])[2]?.value).toBe('—');
  });

  it('promedio/vendedor = total_ventas / activos', () => {
    const rows = [v({ numVentas: 3 }), v({ numVentas: 5 }), v({ numVentas: 2 })];
    // 10 / 3 = 3.333 → "3.3"
    expect(deriveVendedoresKpis(rows)[3]?.value).toBe('3.3');
  });

  it('promedio devuelve "—" cuando no hay vendedores activos', () => {
    expect(deriveVendedoresKpis([])[3]?.value).toBe('—');
  });

  it('top vendedor es argmax(montoTotal) con formato "Nombre ($N.MM)"', () => {
    const rows = [
      v({ nombre: 'Ana', montoTotal: 500_000 }),
      v({ nombre: 'María', montoTotal: 3_000_000 }),
      v({ nombre: 'Pedro', montoTotal: 1_500_000 }),
    ];
    const top = String(deriveVendedoresKpis(rows)[4]?.value);
    expect(top).toContain('María');
    expect(top).toContain('3');
  });

  it('top vendedor devuelve "—" cuando todos están en 0 o vacío', () => {
    expect(deriveVendedoresKpis([])[4]?.value).toBe('—');
    expect(deriveVendedoresKpis([v({ montoTotal: 0 })])[4]?.value).toBe('—');
  });

  it('reactivity: filtrar por mes (ya sucede antes del derive) cambia los 5 KPIs', () => {
    const todos = [
      v({ nombre: 'Ana', numVentas: 3, montoTotal: 3_000_000 }),
      v({ nombre: 'Pedro', numVentas: 1, montoTotal: 1_000_000 }),
    ];
    const soloAna = todos.filter((r) => r.nombre === 'Ana');
    const k = deriveVendedoresKpis(soloAna);
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe(3);
    expect(String(k[2]?.value)).toContain('3');
    // formatNumber con max 1 decimal: enteros muestran sin decimal ("3")
    expect(k[3]?.value).toBe('3');
    expect(String(k[4]?.value)).toContain('Ana');
  });
});
