import { describe, expect, it } from 'vitest';
import { computeAvanceTarea, sumMontosPasos, type PasoRow } from './tarea-pasos';

function p(over: Partial<PasoRow>): PasoRow {
  return {
    id: over.id ?? 'p-' + Math.random().toString(36).slice(2, 8),
    tarea_id: 'tarea-x',
    paso: over.paso ?? 'cotizacion',
    monto: null,
    documento_url: null,
    fecha: null,
    estado: 'pendiente',
    notas: null,
    ...over,
  };
}

describe('computeAvanceTarea (Sprint 3)', () => {
  it('sin pasos → 0%', () => {
    expect(computeAvanceTarea([])).toBe(0);
  });

  it('todos pendientes → 0%', () => {
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion' }),
        p({ paso: 'factura' }),
        p({ paso: 'pago' }),
        p({ paso: 'resultado' }),
      ])
    ).toBe(0);
  });

  it('1 de 4 hechos → 25%', () => {
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion', estado: 'hecho' }),
        p({ paso: 'factura' }),
        p({ paso: 'pago' }),
        p({ paso: 'resultado' }),
      ])
    ).toBe(25);
  });

  it('todos hechos → 100%', () => {
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion', estado: 'hecho' }),
        p({ paso: 'factura', estado: 'hecho' }),
        p({ paso: 'pago', estado: 'hecho' }),
        p({ paso: 'resultado', estado: 'hecho' }),
      ])
    ).toBe(100);
  });

  it('"no_aplica" se saca del denominador', () => {
    // 1 hecho de 1 aplicable (3 son N/A) → 100%
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion', estado: 'no_aplica' }),
        p({ paso: 'factura', estado: 'no_aplica' }),
        p({ paso: 'pago', estado: 'no_aplica' }),
        p({ paso: 'resultado', estado: 'hecho' }),
      ])
    ).toBe(100);
  });

  it('todos N/A → 0%', () => {
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion', estado: 'no_aplica' }),
        p({ paso: 'factura', estado: 'no_aplica' }),
        p({ paso: 'pago', estado: 'no_aplica' }),
        p({ paso: 'resultado', estado: 'no_aplica' }),
      ])
    ).toBe(0);
  });

  it('redondea a entero', () => {
    // 2 hechos de 3 aplicables = 66.66... → 67
    expect(
      computeAvanceTarea([
        p({ paso: 'cotizacion', estado: 'hecho' }),
        p({ paso: 'factura', estado: 'hecho' }),
        p({ paso: 'pago' }),
        p({ paso: 'resultado', estado: 'no_aplica' }),
      ])
    ).toBe(67);
  });
});

describe('sumMontosPasos (Sprint 3)', () => {
  it('suma solo los 3 financieros, excluye resultado', () => {
    const pasos = [
      p({ paso: 'cotizacion', monto: 1000 }),
      p({ paso: 'factura', monto: 1000 }),
      p({ paso: 'pago', monto: 1000 }),
      p({ paso: 'resultado', monto: 9999 }), // ignorado
    ];
    expect(sumMontosPasos(pasos)).toBe(3000);
  });

  it('null/undefined no contribuyen', () => {
    expect(
      sumMontosPasos([p({ paso: 'cotizacion', monto: null }), p({ paso: 'factura', monto: 500 })])
    ).toBe(500);
  });

  it('sin pasos → 0', () => {
    expect(sumMontosPasos([])).toBe(0);
  });
});
