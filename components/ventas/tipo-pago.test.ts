import { describe, expect, it } from 'vitest';
import {
  clasificarMetodoPago,
  matchTipoPago,
  sumarMontosPorTipo,
  type TipoPago,
} from './tipo-pago';

describe('clasificarMetodoPago', () => {
  it('cash → efectivo', () => {
    expect(clasificarMetodoPago('cash')).toBe('efectivo');
  });

  it('variantes credit_card* → tarjeta (valores reales de prod)', () => {
    expect(clasificarMetodoPago('credit_card')).toBe('tarjeta');
    expect(clasificarMetodoPago('credit_card_visa')).toBe('tarjeta');
    expect(clasificarMetodoPago('credit_card_master')).toBe('tarjeta');
  });

  it('POS → tarjeta (terminal, mismo bucket que en rdb.v_cortes_totales)', () => {
    expect(clasificarMetodoPago('POS')).toBe('tarjeta');
    expect(clasificarMetodoPago('pos')).toBe('tarjeta');
  });

  it('STRIPE → stripe (case-insensitive)', () => {
    expect(clasificarMetodoPago('STRIPE')).toBe('stripe');
    expect(clasificarMetodoPago('stripe')).toBe('stripe');
  });

  it('other / desconocidos / null → otro', () => {
    expect(clasificarMetodoPago('other')).toBe('otro');
    expect(clasificarMetodoPago('transferencia')).toBe('otro');
    expect(clasificarMetodoPago(null)).toBe('otro');
    expect(clasificarMetodoPago(undefined)).toBe('otro');
    expect(clasificarMetodoPago('')).toBe('otro');
  });
});

describe('matchTipoPago', () => {
  const tipos = new Set<TipoPago>(['efectivo', 'tarjeta']);

  it("filtro 'all' pasa siempre, incluso sin pagos registrados", () => {
    expect(matchTipoPago(tipos, 'all')).toBe(true);
    expect(matchTipoPago(undefined, 'all')).toBe(true);
  });

  it('pago dividido matchea por cualquiera de sus tipos', () => {
    expect(matchTipoPago(tipos, 'efectivo')).toBe(true);
    expect(matchTipoPago(tipos, 'tarjeta')).toBe(true);
    expect(matchTipoPago(tipos, 'stripe')).toBe(false);
  });

  it('pedido sin pagos registrados no matchea filtros específicos', () => {
    expect(matchTipoPago(undefined, 'efectivo')).toBe(false);
    expect(matchTipoPago(new Set(), 'efectivo')).toBe(false);
  });
});

describe('sumarMontosPorTipo', () => {
  it('acumula por bucket a través de pedidos, ignorando undefined', () => {
    const res = sumarMontosPorTipo([
      { efectivo: 100, tarjeta: 250 }, // pago dividido: cada monto a su bucket
      { efectivo: 50 },
      undefined, // pedido sin pagos registrados
      { stripe: 300 },
    ]);
    expect(res).toEqual({ efectivo: 150, tarjeta: 250, stripe: 300, otro: 0 });
  });

  it('sin pedidos devuelve ceros', () => {
    expect(sumarMontosPorTipo([])).toEqual({ efectivo: 0, tarjeta: 0, stripe: 0, otro: 0 });
  });
});
