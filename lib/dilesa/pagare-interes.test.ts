import { describe, expect, it } from 'vitest';
import { desglosarPagare } from './pagare-interes';

describe('desglosarPagare', () => {
  it('tasa 0 → interés 0, totales = capital', () => {
    const d = desglosarPagare(
      [
        { fecha: '2026-07-01', monto: 50000 },
        { fecha: '2026-08-01', monto: 50000 },
      ],
      0,
      '2026-06-01'
    );
    expect(d.totalCapital).toBe(100000);
    expect(d.totalInteres).toBe(0);
    expect(d.totalPagar).toBe(100000);
    expect(d.parcialidades.every((p) => p.interes === 0)).toBe(true);
  });

  it('una sola exhibición a 30 días con 12% anual: interés = monto × 12% × 30/360', () => {
    const d = desglosarPagare([{ fecha: '2026-07-01', monto: 120000 }], 12, '2026-06-01');
    // 120,000 × 0.12 × 30/360 = 1,200
    expect(d.parcialidades[0].dias).toBe(30);
    expect(d.parcialidades[0].saldoInsoluto).toBe(120000);
    expect(d.parcialidades[0].interes).toBe(1200);
    expect(d.parcialidades[0].pago).toBe(121200);
    expect(d.totalPagar).toBe(121200);
  });

  it('interés sobre saldos insolutos: el saldo baja con cada abono a capital', () => {
    const d = desglosarPagare(
      [
        { fecha: '2026-07-01', monto: 60000 },
        { fecha: '2026-07-31', monto: 60000 },
      ],
      12,
      '2026-06-01'
    );
    // P1: 120,000 × 0.12 × 30/360 = 1,200
    expect(d.parcialidades[0].saldoInsoluto).toBe(120000);
    expect(d.parcialidades[0].interes).toBe(1200);
    // P2: saldo 60,000 × 0.12 × 30/360 = 600
    expect(d.parcialidades[1].saldoInsoluto).toBe(60000);
    expect(d.parcialidades[1].dias).toBe(30);
    expect(d.parcialidades[1].interes).toBe(600);
    expect(d.totalCapital).toBe(120000);
    expect(d.totalInteres).toBe(1800);
    expect(d.totalPagar).toBe(121800);
  });

  it('ordena cronológicamente aunque se capturen en desorden y renumera', () => {
    const d = desglosarPagare(
      [
        { fecha: '2026-08-01', monto: 30000 },
        { fecha: '2026-07-01', monto: 70000 },
      ],
      12,
      '2026-06-01'
    );
    expect(d.parcialidades[0].fecha).toBe('2026-07-01');
    expect(d.parcialidades[0].num).toBe(1);
    expect(d.parcialidades[0].capital).toBe(70000);
    expect(d.parcialidades[1].fecha).toBe('2026-08-01');
    expect(d.parcialidades[1].num).toBe(2);
  });

  it('el total de interés suma las filas ya redondeadas (cuadra con la tabla)', () => {
    // Montos que generan fracciones de centavo por fila.
    const d = desglosarPagare(
      [
        { fecha: '2026-07-13', monto: 33333.33 },
        { fecha: '2026-08-13', monto: 33333.33 },
        { fecha: '2026-09-13', monto: 33333.34 },
      ],
      10.5,
      '2026-06-01'
    );
    const sumaFilas = d.parcialidades.reduce((s, p) => s + p.interes, 0);
    expect(d.totalInteres).toBe(Math.round(sumaFilas * 100) / 100);
    expect(d.totalPagar).toBe(d.totalCapital + d.totalInteres);
  });

  it('fila con fecha anterior a la suscripción no genera interés (defensivo)', () => {
    const d = desglosarPagare([{ fecha: '2026-05-01', monto: 10000 }], 12, '2026-06-01');
    expect(d.parcialidades[0].dias).toBe(0);
    expect(d.parcialidades[0].interes).toBe(0);
  });

  it('sin fecha de suscripción → interés 0 (no hay periodo base)', () => {
    const d = desglosarPagare([{ fecha: '2026-07-01', monto: 10000 }], 12, null);
    expect(d.totalInteres).toBe(0);
  });
});
