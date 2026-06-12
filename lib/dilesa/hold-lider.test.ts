import { describe, expect, it } from 'vitest';
import { esLiderDeCola } from './hold-lider';

describe('esLiderDeCola (hold de asignación — D4 Coda)', () => {
  it('venta BSOP líder de su fila → autorizable', () => {
    const cola = [
      { venta_id: 'v1', posicion: 1 },
      { venta_id: 'v2', posicion: 2 },
    ];
    expect(esLiderDeCola(cola, 'v1', false)).toBe(true);
  });

  it('venta BSOP en posición 2 → bloqueada', () => {
    const cola = [
      { venta_id: 'v1', posicion: 1 },
      { venta_id: 'v2', posicion: 2 },
    ];
    expect(esLiderDeCola(cola, 'v2', false)).toBe(false);
  });

  it('venta histórica de Coda con fila vacía → autorizable (bug M22-L5-LDLE)', () => {
    // Las ventas de Coda no entran a v_unidad_hold_queue (D4): la fila de
    // su unidad queda vacía y aun así deben poder autorizarse.
    expect(esLiderDeCola([], 'venta-coda', true)).toBe(true);
  });

  it('venta de Coda NO brinca a un líder BSOP que ya tiene el hold', () => {
    const cola = [{ venta_id: 'v-bsop', posicion: 1 }];
    expect(esLiderDeCola(cola, 'venta-coda', true)).toBe(false);
  });

  it('venta BSOP fuera de su propia fila (anomalía: borrada/expirada) → bloqueada', () => {
    expect(esLiderDeCola([], 'v-anomala', false)).toBe(false);
  });
});
