import { describe, expect, it } from 'vitest';
import {
  deriveEstadoCuenta,
  excedeTopeContrato,
  findFacturaTotal,
  type EstimacionCuenta,
  type FacturaCuenta,
} from './contratos-estado-cuenta';

function est(overrides: Partial<EstimacionCuenta>): EstimacionCuenta {
  return { monto_total: 0, retencion: 0, es_anticipo: false, estado: 'autorizada', ...overrides };
}

function fac(overrides: Partial<FacturaCuenta>): FacturaCuenta {
  return {
    total: 0,
    monto_pagado: 0,
    estado_cxp: 'por_pagar',
    cancelada_at: null,
    obra_estimacion_id: 'e1',
    ...overrides,
  };
}

describe('deriveEstadoCuenta (contrato de obra — D4/D5)', () => {
  it('devengado = Σ autorizadas+pagadas; borrador y cancelada no cuentan', () => {
    const cuenta = deriveEstadoCuenta(1000, [
      est({ monto_total: 300 }),
      est({ monto_total: 200, estado: 'pagada' }),
      est({ monto_total: 150, estado: 'borrador' }),
      est({ monto_total: 999, estado: 'cancelada' }),
    ]);
    expect(cuenta.devengado).toBe(500);
    expect(cuenta.pendienteAutorizar).toBe(150);
    expect(cuenta.porDevengar).toBe(500);
    expect(cuenta.avancePct).toBe(50);
  });

  it('amortizaciones negativas netean el devengado y suman a anticipoAmortizado', () => {
    const cuenta = deriveEstadoCuenta(1000, [
      est({ monto_total: 400, es_anticipo: true }),
      est({ monto_total: 300 }),
      est({ monto_total: -100 }),
    ]);
    expect(cuenta.devengado).toBe(600);
    expect(cuenta.anticipoEntregado).toBe(400);
    expect(cuenta.anticipoAmortizado).toBe(100);
    expect(cuenta.anticipoPorAmortizar).toBe(300);
  });

  it('retenciones solo de estimaciones que devengan', () => {
    const cuenta = deriveEstadoCuenta(1000, [
      est({ monto_total: 300, retencion: 15 }),
      est({ monto_total: 200, retencion: 10, estado: 'pagada' }),
      est({ monto_total: 100, retencion: 99, estado: 'borrador' }),
    ]);
    expect(cuenta.retenciones).toBe(25);
  });

  it('facturado/pagado excluyen facturas canceladas', () => {
    const cuenta = deriveEstadoCuenta(
      1000,
      [],
      [
        fac({ total: 500, monto_pagado: 200 }),
        fac({ total: 999, monto_pagado: 999, cancelada_at: '2026-06-01' }),
        fac({ total: 100, monto_pagado: 0, estado_cxp: 'cancelada' }),
      ]
    );
    expect(cuenta.facturado).toBe(500);
    expect(cuenta.pagado).toBe(200);
  });

  it('contratado en 0 no divide entre cero', () => {
    expect(deriveEstadoCuenta(0, [est({ monto_total: 100 })]).avancePct).toBe(0);
  });

  it('la amortización automática (S3) reduce el devengado neto y baja el anticipo por amortizar', () => {
    // Contrato 100, anticipo 30 + avance 100 que amortiza 30 → devengado neto 100.
    const c = deriveEstadoCuenta(100, [
      est({ monto_total: 30, es_anticipo: true }),
      est({ monto_total: 100, amortizacion_aplicada: 30 }),
    ]);
    expect(c.devengado).toBe(100); // 30 + (100 − 30)
    expect(c.anticipoEntregado).toBe(30);
    expect(c.anticipoAmortizado).toBe(30);
    expect(c.anticipoPorAmortizar).toBe(0);
  });

  it('suma amortización automática y manual (negativa) sin doble contar el devengado', () => {
    const c = deriveEstadoCuenta(200, [
      est({ monto_total: 60, es_anticipo: true }),
      est({ monto_total: 100, amortizacion_aplicada: 30 }), // automática
      est({ monto_total: -30 }), // negativa manual histórica
    ]);
    expect(c.devengado).toBe(100); // 60 + (100−30) + (−30)
    expect(c.anticipoAmortizado).toBe(60); // 30 auto + 30 manual
    expect(c.anticipoPorAmortizar).toBe(0); // 60 entregado − 60 amortizado
  });
});

describe('findFacturaTotal', () => {
  it('encuentra la factura sin estimación de origen (activa)', () => {
    const total = fac({ obra_estimacion_id: null, total: 800 });
    expect(findFacturaTotal([fac({}), total])).toBe(total);
  });
  it('ignora facturas totales canceladas', () => {
    expect(
      findFacturaTotal([
        fac({ obra_estimacion_id: null, cancelada_at: '2026-06-01' }),
        fac({ obra_estimacion_id: null, estado_cxp: 'cancelada' }),
      ])
    ).toBeNull();
  });
  it('null si solo hay facturas por estimación', () => {
    expect(findFacturaTotal([fac({}), fac({ obra_estimacion_id: 'e2' })])).toBeNull();
  });
});

describe('excedeTopeContrato', () => {
  it('excede cuando devengado + estimación supera el valor del contrato', () => {
    expect(excedeTopeContrato(80, 30, 100)).toBe(true); // 110 > 100
  });
  it('no excede cuando cuadra justo al valor', () => {
    expect(excedeTopeContrato(70, 30, 100)).toBe(false); // 100 == 100
  });
  it('tolera el redondeo de centavos (epsilon 1 peso)', () => {
    expect(excedeTopeContrato(100, 0.5, 100)).toBe(false); // 100.5 <= 100+1
    expect(excedeTopeContrato(100, 2, 100)).toBe(true); // 102 > 100+1
  });
  it('las estimaciones no positivas (amortizaciones) nunca exceden', () => {
    expect(excedeTopeContrato(120, -30, 100)).toBe(false);
    expect(excedeTopeContrato(120, 0, 100)).toBe(false);
  });
  it('contratos sin valor capturado (valor_total <= 0) se eximen', () => {
    expect(excedeTopeContrato(0, 50, 0)).toBe(false);
  });
  it('un contrato ya excedido bloquea cualquier suma adicional', () => {
    expect(excedeTopeContrato(150, 10, 100)).toBe(true);
  });
});
