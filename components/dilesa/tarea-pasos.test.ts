import { describe, expect, it } from 'vitest';
import {
  computeAvanceTarea,
  estadoVisualDePaso,
  pasoRequiereAutorizacion,
  sumMontosPasos,
  type PasoRow,
} from './tarea-pasos';

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
    autorizado_at: null,
    autorizado_por: null,
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

describe('pasoRequiereAutorizacion (Sprint 3.5)', () => {
  it('cotizacion requiere autorización', () => {
    expect(pasoRequiereAutorizacion('cotizacion')).toBe(true);
  });
  it('factura/pago/resultado NO requieren autorización en v1', () => {
    expect(pasoRequiereAutorizacion('factura')).toBe(false);
    expect(pasoRequiereAutorizacion('pago')).toBe(false);
    expect(pasoRequiereAutorizacion('resultado')).toBe(false);
  });
});

describe('estadoVisualDePaso (Sprint 3.5)', () => {
  it('pendiente → pendiente', () => {
    expect(estadoVisualDePaso(p({ paso: 'cotizacion', estado: 'pendiente' }))).toBe('pendiente');
  });

  it('no_aplica → no_aplica', () => {
    expect(estadoVisualDePaso(p({ paso: 'cotizacion', estado: 'no_aplica' }))).toBe('no_aplica');
  });

  it('paso que requiere autorización + hecho + sin autorizado_at → esperando_autorizacion', () => {
    expect(
      estadoVisualDePaso(p({ paso: 'cotizacion', estado: 'hecho', autorizado_at: null }))
    ).toBe('esperando_autorizacion');
  });

  it('paso que requiere autorización + hecho + autorizado_at set → autorizado', () => {
    expect(
      estadoVisualDePaso(
        p({ paso: 'cotizacion', estado: 'hecho', autorizado_at: '2026-05-29T12:00:00Z' })
      )
    ).toBe('autorizado');
  });

  it('factura hecho → hecho (no requiere autorización en v1)', () => {
    expect(estadoVisualDePaso(p({ paso: 'factura', estado: 'hecho' }))).toBe('hecho');
  });

  it('resultado hecho → hecho', () => {
    expect(estadoVisualDePaso(p({ paso: 'resultado', estado: 'hecho' }))).toBe('hecho');
  });
});
