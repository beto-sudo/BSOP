import { describe, expect, it } from 'vitest';
import {
  adeudoNetoEjercicio,
  resumenPrediales,
  totalBrutoEjercicio,
  type PredialEjercicio,
} from './prediales';

function ejercicio(over: Partial<PredialEjercicio>): PredialEjercicio {
  return {
    id: 'e1',
    cuenta_id: 'c1',
    ejercicio: 2026,
    predial: null,
    recargos: null,
    aseo: null,
    recargos_aseo: null,
    bomberos: null,
    recargos_bomberos: null,
    estado: 'pendiente',
    fecha_pago: null,
    monto_pagado: null,
    notas: null,
    convenio: null,
    ...over,
  };
}

describe('totalBrutoEjercicio', () => {
  it('suma todos los cargos del recibo tratando null como 0', () => {
    const e = ejercicio({ predial: 1000, recargos: 100, aseo: 370.5, bomberos: 100.83 });
    expect(totalBrutoEjercicio(e)).toBeCloseTo(1571.33, 2);
  });

  it('es 0 cuando no hay montos (fila marcada solo PAGADO)', () => {
    expect(totalBrutoEjercicio(ejercicio({}))).toBe(0);
  });
});

describe('adeudoNetoEjercicio', () => {
  it('pagado/condonado no deben nada aunque tengan montos', () => {
    expect(adeudoNetoEjercicio(ejercicio({ predial: 500, estado: 'pagado' }))).toBe(0);
    expect(adeudoNetoEjercicio(ejercicio({ predial: 500, estado: 'condonado' }))).toBe(0);
  });

  it('pendiente sin convenio debe el bruto completo', () => {
    expect(adeudoNetoEjercicio(ejercicio({ predial: 500, recargos: 50 }))).toBe(550);
  });

  it('convenio vigente aplica el % de descuento sin tocar los montos', () => {
    const e = ejercicio({
      predial: 1000,
      aseo: 500,
      estado: 'convenio',
      convenio: { id: 'cv', nombre: 'Reducción 60%', descuento_pct: 60, estado: 'vigente' },
    });
    expect(adeudoNetoEjercicio(e)).toBeCloseTo(600, 2); // 1500 × 0.4
    expect(e.predial).toBe(1000); // el monto capturado queda íntegro
  });

  it('convenio NO vigente (cancelado/cumplido) no descuenta', () => {
    const e = ejercicio({
      predial: 1000,
      estado: 'convenio',
      convenio: { id: 'cv', nombre: 'x', descuento_pct: 60, estado: 'cancelado' },
    });
    expect(adeudoNetoEjercicio(e)).toBe(1000);
  });
});

describe('resumenPrediales', () => {
  it('agrega neto, bruto pendiente y conteos', () => {
    const r = resumenPrediales([
      ejercicio({ predial: 1000 }),
      ejercicio({ id: 'e2', predial: 2000, estado: 'pagado' }),
      ejercicio({
        id: 'e3',
        predial: 1000,
        estado: 'convenio',
        convenio: { id: 'cv', nombre: 'x', descuento_pct: 60, estado: 'vigente' },
      }),
    ]);
    expect(r.adeudoNeto).toBeCloseTo(1400, 2); // 1000 + 0 + 400
    expect(r.brutoPendiente).toBeCloseTo(2000, 2); // 1000 + 1000
    expect(r.pagados).toBe(1);
    expect(r.pendientes).toBe(2);
  });
});
