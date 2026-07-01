import { describe, it, expect } from 'vitest';
import { congelarDesglose, leerDesglose } from './desglose-precio';

const calculoCompleto = {
  valor_comercial: 920000,
  metros_excedentes: 0,
  valor_excedente_terreno: 0,
  valor_frente_verde: 0,
  valor_esquina: 0,
  pct_esquina_aplicado: 0,
  valor_venta_futuro: 0,
  costo_credito_adicional: 55200,
  zcu_exento: false,
  productos_adicionales: 0,
  precio_venta_total: 975200,
  apoyo_infonavit: 0,
  pago_directo: 975200,
  enganche_1pct: 9752,
  isai_2pct: 19504,
  gastos_notariales_6pct: 58512,
};

describe('congelarDesglose', () => {
  it('congela el cálculo completo con metadata de asignación y sin el campo error', () => {
    const snap = congelarDesglose({ ...calculoCompleto, error: undefined }) as Record<
      string,
      unknown
    >;
    expect(snap).not.toBeNull();
    expect(snap.precio_venta_total).toBe(975200);
    expect(snap.componentes_detallados).toBe(true);
    expect(snap.origen).toBe('asignacion');
    expect(snap.costo_credito_adicional).toBe(55200);
    expect('error' in snap).toBe(false);
  });

  it('no congela si el cálculo trae error', () => {
    expect(congelarDesglose({ precio_venta_total: 100, error: 'unidad no encontrada' })).toBeNull();
  });

  it('no congela si falta el precio total o el cálculo es nulo', () => {
    expect(congelarDesglose({ valor_comercial: 920000 })).toBeNull();
    expect(congelarDesglose({ precio_venta_total: null })).toBeNull();
    expect(congelarDesglose(null)).toBeNull();
    expect(congelarDesglose(undefined)).toBeNull();
  });
});

describe('leerDesglose', () => {
  it('lee un snapshot detallado (venta nueva)', () => {
    const snap = leerDesglose({
      ...calculoCompleto,
      origen: 'asignacion',
      componentes_detallados: true,
    });
    expect(snap).not.toBeNull();
    expect(snap?.componentes_detallados).toBe(true);
    expect(snap?.origen).toBe('asignacion');
    expect(snap?.valor_comercial).toBe(920000);
    expect(snap?.precio_venta_total).toBe(975200);
  });

  it('lee un snapshot histórico backfilleado (solo total de contrato)', () => {
    const snap = leerDesglose({
      precio_venta_total: 1021000,
      valor_comercial: 920000,
      origen: 'backfill_contrato',
      componentes_detallados: false,
    });
    expect(snap?.componentes_detallados).toBe(false);
    expect(snap?.origen).toBe('backfill_contrato');
    expect(snap?.precio_venta_total).toBe(1021000);
    expect(snap?.costo_credito_adicional).toBeUndefined();
    // Enganche/ISAI/gastos se derivan del total (no estaban en el backfill) —
    // si no, la solicitud/PDF los mostraba en $0.
    expect(snap?.enganche_1pct).toBe(10210);
    expect(snap?.isai_2pct).toBe(20420);
    expect(snap?.gastos_notariales_6pct).toBe(61260);
  });

  it('preserva enganche/ISAI/gastos guardados (no re-deriva en ventas nuevas)', () => {
    const snap = leerDesglose({
      precio_venta_total: 1000000,
      enganche_1pct: 5,
      isai_2pct: 7,
      gastos_notariales_6pct: 9,
      componentes_detallados: true,
    });
    expect(snap?.enganche_1pct).toBe(5);
    expect(snap?.isai_2pct).toBe(7);
    expect(snap?.gastos_notariales_6pct).toBe(9);
  });

  it('round-trip: congelar y luego leer preserva el total y marca detallado', () => {
    const frozen = congelarDesglose(calculoCompleto);
    const snap = leerDesglose(frozen);
    expect(snap?.precio_venta_total).toBe(975200);
    expect(snap?.componentes_detallados).toBe(true);
    expect(snap?.origen).toBe('asignacion');
  });

  it('round-trip: preserva el descuento al valor base y su motivo congelado', () => {
    // Migración 20260701222450: lista − descuento = neto, con la etiqueta del
    // motivo congelada app-side para que la solicitud/PDF la impriman aunque
    // el catálogo cambie después.
    const frozen = congelarDesglose({
      ...calculoCompleto,
      valor_comercial: 899000,
      valor_comercial_lista: 920000,
      descuento_valor_base: 21000,
      descuento_valor_base_motivo: 'Reasignación por problema ZCU',
    });
    const snap = leerDesglose(frozen);
    expect(snap?.valor_comercial).toBe(899000);
    expect(snap?.valor_comercial_lista).toBe(920000);
    expect(snap?.descuento_valor_base).toBe(21000);
    expect(snap?.descuento_valor_base_motivo).toBe('Reasignación por problema ZCU');
  });

  it('snapshots viejos sin descuento leen sin los campos nuevos', () => {
    const snap = leerDesglose({
      ...calculoCompleto,
      origen: 'asignacion',
      componentes_detallados: true,
    });
    expect(snap?.valor_comercial_lista).toBeUndefined();
    expect(snap?.descuento_valor_base).toBeUndefined();
    expect(snap?.descuento_valor_base_motivo).toBeUndefined();
  });

  it('devuelve null para entradas inválidas', () => {
    expect(leerDesglose(null)).toBeNull();
    expect(leerDesglose(undefined)).toBeNull();
    expect(leerDesglose('x')).toBeNull();
    expect(leerDesglose([1, 2])).toBeNull();
    expect(leerDesglose({ valor_comercial: 1 })).toBeNull(); // sin precio_venta_total
  });
});
