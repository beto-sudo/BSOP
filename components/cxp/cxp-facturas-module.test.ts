import { describe, expect, it } from 'vitest';

import { esElegibleProgramar } from './cxp-facturas-module';

// Builder mínimo: solo los campos que mira la regla de elegibilidad.
type Arg = Parameters<typeof esElegibleProgramar>[0];
const f = (over: Partial<Arg>): Arg =>
  ({
    estado_cxp: 'por_pagar',
    porProgramar: 100,
    proveedor_id: 'prov-1',
    cuenta_contable_id: 'cta-1',
    ...over,
  }) as Arg;

describe('esElegibleProgramar (selección para pago agrupado)', () => {
  it('elegible: por_pagar (o parcial) con saldo, proveedor y cuenta contable', () => {
    expect(esElegibleProgramar(f({}))).toBe(true);
    expect(esElegibleProgramar(f({ estado_cxp: 'parcial' }))).toBe(true);
  });

  it('no elegible sin saldo por programar', () => {
    expect(esElegibleProgramar(f({ porProgramar: 0 }))).toBe(false);
  });

  it('no elegible sin proveedor enlazado', () => {
    expect(esElegibleProgramar(f({ proveedor_id: null }))).toBe(false);
  });

  it('no elegible sin cuenta contable clasificada', () => {
    expect(esElegibleProgramar(f({ cuenta_contable_id: null }))).toBe(false);
  });

  it('no elegible en estados que no son por_pagar/parcial', () => {
    for (const estado of ['borrador', 'pagada', 'cancelada'] as const) {
      expect(esElegibleProgramar(f({ estado_cxp: estado }))).toBe(false);
    }
  });
});
