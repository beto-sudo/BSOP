import { describe, it, expect } from 'vitest';

import { TOLERANCIA_MXN, conciliarEfectivo, conciliarTarjeta } from '../conciliacion';
import type { Corte, CorteTotales, Voucher } from '../types';

/**
 * Tests para components/cortes/conciliacion.ts.
 *
 * Cubre las reglas de §7 del plan (`docs/plans/cortes-detail-conciliacion.md`)
 * y los edge cases de §9. Lógica 100% pura — sin DB, sin fetch.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function v(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v-default',
    corte_id: 'corte-1',
    storage_path: 'rdb/corte-1/v.jpg',
    signed_url: null,
    nombre_original: 'voucher.jpg',
    tamano_bytes: 12345,
    mime_type: 'image/jpeg',
    afiliacion: null,
    monto_reportado: null,
    uploaded_by_nombre: null,
    uploaded_at: null,
    categoria: 'voucher_tarjeta',
    banco_id: null,
    banco_nombre: null,
    movimiento_caja_id: null,
    ocr_texto_crudo: null,
    ocr_monto_sugerido: null,
    ocr_banco_sugerido_id: null,
    ocr_confianza: null,
    ...overrides,
  };
}

function totales(over: Partial<CorteTotales> = {}): CorteTotales {
  return {
    corte_id: 'corte-1',
    caja_id: null,
    caja_nombre: null,
    estado: 'cerrado',
    hora_inicio: null,
    hora_fin: null,
    efectivo_inicial: 0,
    ingresos_efectivo: 0,
    ingresos_tarjeta: 0,
    ingresos_stripe: 0,
    ingresos_transferencias: 0,
    total_ingresos: 0,
    depositos: 0,
    retiros: 0,
    efectivo_esperado: 0,
    ...over,
  };
}

function corte(over: Partial<Corte> = {}): Corte {
  return {
    id: 'corte-1',
    corte_nombre: null,
    caja_nombre: null,
    caja_id: null,
    fecha_operativa: null,
    hora_inicio: null,
    hora_fin: null,
    estado: 'cerrado',
    efectivo_inicial: null,
    efectivo_contado: null,
    responsable_apertura: null,
    responsable_cierre: null,
    turno: null,
    tipo: null,
    observaciones: null,
    ...over,
  };
}

// ── conciliarTarjeta ─────────────────────────────────────────────────────────

describe('conciliarTarjeta', () => {
  it('sin_actividad: ingresos=0 y sin vouchers', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 0 }), []);
    expect(r.estado).toBe('sin_actividad');
    expect(r.ingresos_pedidos).toBe(0);
    expect(r.total_evidencia).toBe(0);
    expect(r.evidencia_count).toBe(0);
    expect(r.evidencia_pendiente).toBe(0);
    expect(r.diferencia).toBe(0);
  });

  it('sin_voucher: ingresos>0 sin vouchers de tarjeta', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), []);
    expect(r.estado).toBe('sin_voucher');
    expect(r.ingresos_pedidos).toBe(5354);
    expect(r.total_evidencia).toBe(0);
    expect(r.evidencia_count).toBe(0);
    expect(r.diferencia).toBe(-5354);
  });

  it('pendiente_captura: 1 voucher con monto, 1 sin monto', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [
      v({ id: 'v1', monto_reportado: 1200 }),
      v({ id: 'v2', monto_reportado: null }),
    ]);
    expect(r.estado).toBe('pendiente_captura');
    expect(r.evidencia_count).toBe(2);
    expect(r.evidencia_pendiente).toBe(1);
    expect(r.total_evidencia).toBe(1200);
    expect(r.diferencia).toBe(1200 - 5354);
  });

  it('cuadra exacto: suma vouchers === ingresos', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [
      v({ id: 'v1', monto_reportado: 1200 }),
      v({ id: 'v2', monto_reportado: 4154 }),
    ]);
    expect(r.estado).toBe('cuadra');
    expect(r.diferencia).toBe(0);
    expect(r.total_evidencia).toBe(5354);
    expect(r.evidencia_count).toBe(2);
    expect(r.evidencia_pendiente).toBe(0);
  });

  it('cuadra_aprox: diferencia exactamente $5 (tolerancia inclusiva)', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [v({ monto_reportado: 5359 })]);
    expect(r.estado).toBe('cuadra_aprox');
    expect(r.diferencia).toBe(5);
  });

  it('cuadra_aprox: diferencia $4.99', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 100 }), [v({ monto_reportado: 95.01 })]);
    expect(r.estado).toBe('cuadra_aprox');
    expect(Math.abs(r.diferencia)).toBeLessThanOrEqual(TOLERANCIA_MXN);
  });

  it('diferencia: diferencia $5.01 (justo arriba de tolerancia)', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 100 }), [
      v({ monto_reportado: 105.01 }),
    ]);
    expect(r.estado).toBe('diferencia');
    expect(Math.abs(r.diferencia)).toBeGreaterThan(TOLERANCIA_MXN);
  });

  it('diferencia: vouchers menores que ingresos por mucho', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [v({ monto_reportado: 1200 })]);
    expect(r.estado).toBe('diferencia');
    expect(r.diferencia).toBe(-4154);
  });

  it('diferencia: vouchers mayores que ingresos (positivo)', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [v({ monto_reportado: 5360 })]);
    expect(r.estado).toBe('diferencia');
    expect(r.diferencia).toBe(6);
  });

  it('voucher monto=0 cuenta como capturado, no pendiente', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 0 }), [v({ monto_reportado: 0 })]);
    // No es sin_actividad porque hay un voucher; no es pendiente_captura porque
    // 0 cuenta como capturado; ingresos=0 y total=0 → cuadra exacto.
    expect(r.estado).toBe('cuadra');
    expect(r.evidencia_count).toBe(1);
    expect(r.evidencia_pendiente).toBe(0);
    expect(r.total_evidencia).toBe(0);
    expect(r.diferencia).toBe(0);
  });

  it('ignora vouchers con categoria=comprobante_movimiento', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [
      v({ id: 'v1', monto_reportado: 5354 }),
      v({ id: 'v2', monto_reportado: 999, categoria: 'comprobante_movimiento' }),
    ]);
    expect(r.estado).toBe('cuadra');
    expect(r.evidencia_count).toBe(1);
    expect(r.total_evidencia).toBe(5354);
    expect(r.diferencia).toBe(0);
  });

  it('ignora vouchers con categoria=otro', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 5354 }), [
      v({ id: 'v1', monto_reportado: 5354 }),
      v({ id: 'v2', monto_reportado: 999, categoria: 'otro' }),
    ]);
    expect(r.estado).toBe('cuadra');
    expect(r.evidencia_count).toBe(1);
    expect(r.total_evidencia).toBe(5354);
  });

  it('múltiples vouchers misma afiliación suman normal', () => {
    const r = conciliarTarjeta(totales({ ingresos_tarjeta: 9000 }), [
      v({ id: 'v1', afiliacion: '7235801', monto_reportado: 3000 }),
      v({ id: 'v2', afiliacion: '7235801', monto_reportado: 4000 }),
      v({ id: 'v3', afiliacion: '7235801', monto_reportado: 2000 }),
    ]);
    expect(r.estado).toBe('cuadra');
    expect(r.total_evidencia).toBe(9000);
    expect(r.evidencia_count).toBe(3);
  });

  it('totales=null se trata como ingresos=0', () => {
    const r = conciliarTarjeta(null, []);
    expect(r.estado).toBe('sin_actividad');
    expect(r.ingresos_pedidos).toBe(0);
    expect(r.diferencia).toBe(0);
  });

  it('totales=null con vouchers da diferencia (ingresos=0, vouchers>0)', () => {
    const r = conciliarTarjeta(null, [v({ monto_reportado: 100 })]);
    expect(r.estado).toBe('diferencia');
    expect(r.ingresos_pedidos).toBe(0);
    expect(r.total_evidencia).toBe(100);
    expect(r.diferencia).toBe(100);
  });
});

// ── conciliarEfectivo ────────────────────────────────────────────────────────

describe('conciliarEfectivo', () => {
  it('pendiente_cierre: corte abierto', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'abierto', efectivo_contado: 3000 }),
      totales({ efectivo_esperado: 3166.2 })
    );
    expect(r.estado).toBe('pendiente_cierre');
    expect(r.contado).toBeNull();
    expect(r.diferencia).toBeNull();
    expect(r.esperado).toBe(3166.2);
  });

  it('pendiente_cierre: efectivo_contado null aunque corte cerrado', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'cerrado', efectivo_contado: null }),
      totales({ efectivo_esperado: 3166.2 })
    );
    expect(r.estado).toBe('pendiente_cierre');
    expect(r.contado).toBeNull();
    expect(r.diferencia).toBeNull();
  });

  it('cuadra exacto: contado === esperado', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'cerrado', efectivo_contado: 3166.2 }),
      totales({ efectivo_esperado: 3166.2 })
    );
    expect(r.estado).toBe('cuadra');
    expect(r.diferencia).toBe(0);
    expect(r.contado).toBe(3166.2);
  });

  it('cuadra_aprox: diferencia exactamente $5', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'cerrado', efectivo_contado: 3171 }),
      totales({ efectivo_esperado: 3166 })
    );
    expect(r.estado).toBe('cuadra_aprox');
    expect(r.diferencia).toBe(5);
  });

  it('diferencia: faltó efectivo (negativo) > tolerancia', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'cerrado', efectivo_contado: 3150 }),
      totales({ efectivo_esperado: 3166.2 })
    );
    expect(r.estado).toBe('diferencia');
    expect(r.diferencia).toBeCloseTo(-16.2, 2);
  });

  it('diferencia: sobró efectivo (positivo) > tolerancia', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'cerrado', efectivo_contado: 3200 }),
      totales({ efectivo_esperado: 3166 })
    );
    expect(r.estado).toBe('diferencia');
    expect(r.diferencia).toBe(34);
  });

  it('diferencia es null cuando estado=pendiente_cierre', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'abierto', efectivo_contado: null }),
      totales({ efectivo_esperado: 100 })
    );
    expect(r.estado).toBe('pendiente_cierre');
    expect(r.diferencia).toBeNull();
  });

  it('totales=null se trata como esperado=0', () => {
    const r = conciliarEfectivo(corte({ estado: 'cerrado', efectivo_contado: 0 }), null);
    expect(r.estado).toBe('cuadra');
    expect(r.esperado).toBe(0);
    expect(r.diferencia).toBe(0);
  });

  it('estado abierto en mayúsculas también dispara pendiente_cierre', () => {
    const r = conciliarEfectivo(
      corte({ estado: 'ABIERTO', efectivo_contado: 3166.2 }),
      totales({ efectivo_esperado: 3166.2 })
    );
    expect(r.estado).toBe('pendiente_cierre');
    expect(r.contado).toBeNull();
    expect(r.diferencia).toBeNull();
  });
});

// ── TOLERANCIA_MXN ──────────────────────────────────────────────────────────

describe('TOLERANCIA_MXN', () => {
  it('está exportada y vale 5', () => {
    expect(TOLERANCIA_MXN).toBe(5);
  });
});
