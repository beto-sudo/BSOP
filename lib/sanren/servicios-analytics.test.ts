import { describe, it, expect } from 'vitest';

import {
  computeServicioKpis,
  computeComparativos,
  computeAnomalias,
} from '@/lib/sanren/servicios-analytics';
import type { ReciboVista } from '@/lib/sanren-servicios';

/** Fábrica mínima de un recibo con los campos que la analítica usa. */
function recibo(partial: Partial<ReciboVista> & { id: string; periodo: string }): ReciboVista {
  return {
    servicio_id: 's',
    fecha_recibo: `${partial.periodo}-01`,
    fecha_vencimiento: null,
    monto: null,
    subtotal: null,
    iva: null,
    tarifa: null,
    moneda: 'MXN',
    folio: null,
    lectura_consumo: null,
    lectura_produccion: null,
    pagado: true,
    fecha_pago: null,
    metodo_pago: null,
    notas: null,
    coda_row_id: null,
    extraccion: null,
    servicio_tipo: 'agua',
    proveedor: null,
    unidad_consumo: 'm³',
    tiene_produccion: false,
    propiedad_nombre: 'Casa',
    consumo_periodo: null,
    produccion_periodo: null,
    costo_unitario: null,
    saldo_neto: null,
    delta_monto_mom: null,
    recibo_adjunto_path: null,
    comprobante_adjunto_path: null,
    ...partial,
  };
}

describe('computeServicioKpis', () => {
  it('agrega gasto, consumo, costo unitario y mes pico de agua', () => {
    const recibos = [
      recibo({ id: 'a1', periodo: '2025-01', monto: 1000, consumo_periodo: 50 }),
      recibo({ id: 'a2', periodo: '2025-02', monto: 2000, consumo_periodo: 150, pagado: false }),
    ];
    const k = computeServicioKpis(recibos);
    expect(k.count).toBe(2);
    expect(k.gasto).toBe(3000);
    expect(k.pendientes).toBe(1);
    expect(k.rango).toEqual(['2025-01', '2025-02']);
    expect(k.consumoTotal).toBe(200);
    expect(k.consumoUnidad).toBe('m³');
    expect(k.costoUnitarioProm).toBeCloseTo(15);
    expect(k.consumoPromMensual).toBeCloseTo(100);
    expect(k.mesPico).toEqual({ periodo: '2025-02', consumo: 150 });
    expect(k.generacionTotal).toBeNull();
    expect(k.bancoEnergia).toBeNull();
  });

  it('captura generación y banco de energía del recibo de luz más reciente', () => {
    const recibos = [
      recibo({
        id: 'l1',
        periodo: '2025-01',
        servicio_tipo: 'luz',
        unidad_consumo: 'kWh',
        monto: 50,
        consumo_periodo: 100,
        tiene_produccion: true,
        produccion_periodo: 400,
        extraccion: { energia_acumulada_favor: 1200 },
      }),
      recibo({
        id: 'l2',
        periodo: '2025-02',
        servicio_tipo: 'luz',
        unidad_consumo: 'kWh',
        monto: 60,
        consumo_periodo: 120,
        tiene_produccion: true,
        produccion_periodo: 300,
        extraccion: { energia_acumulada_favor: 2638 },
      }),
    ];
    const k = computeServicioKpis(recibos);
    expect(k.generacionTotal).toBe(700);
    expect(k.bancoEnergia).toBe(2638); // el más reciente (2025-02)
  });

  it('devuelve nulls seguros con set vacío', () => {
    const k = computeServicioKpis([]);
    expect(k.count).toBe(0);
    expect(k.gasto).toBe(0);
    expect(k.rango).toBeNull();
    expect(k.consumoTotal).toBeNull();
    expect(k.costoUnitarioProm).toBeNull();
    expect(k.mesPico).toBeNull();
  });
});

describe('computeComparativos', () => {
  it('compara mismo mes año previo y ventanas de 12 meses', () => {
    const recibos = [
      recibo({ id: 'p1', periodo: '2024-06', monto: 1000 }),
      recibo({ id: 'p2', periodo: '2025-06', monto: 1500 }),
    ];
    const c = computeComparativos(recibos);
    expect(c.ultimoPeriodo).toBe('2025-06');
    expect(c.gastoUltimo).toBe(1500);
    expect(c.gastoMismoMesAnioPrevio).toBe(1000);
    expect(c.deltaGastoPct).toBeCloseTo(0.5);
  });

  it('maneja set vacío sin romper', () => {
    const c = computeComparativos([]);
    expect(c.ultimoPeriodo).toBeNull();
    expect(c.deltaGastoPct).toBeNull();
    expect(c.total12m).toBe(0);
  });
});

describe('computeAnomalias', () => {
  it('marca un salto de consumo sobre el baseline previo', () => {
    const recibos = [
      recibo({ id: 'm1', periodo: '2025-01', consumo_periodo: 100 }),
      recibo({ id: 'm2', periodo: '2025-02', consumo_periodo: 100 }),
      recibo({ id: 'm3', periodo: '2025-03', consumo_periodo: 100 }),
      recibo({ id: 'm4', periodo: '2025-04', consumo_periodo: 200 }), // +100% vs baseline 100
    ];
    const anom = computeAnomalias(recibos);
    expect(anom.has('m4')).toBe(true);
    expect(anom.get('m4')?.exceso).toBeCloseTo(1);
    expect(anom.has('m1')).toBe(false); // sin previos suficientes
  });

  it('no marca consumos dentro de la variación normal', () => {
    const recibos = [
      recibo({ id: 'n1', periodo: '2025-01', consumo_periodo: 100 }),
      recibo({ id: 'n2', periodo: '2025-02', consumo_periodo: 105 }),
      recibo({ id: 'n3', periodo: '2025-03', consumo_periodo: 110 }),
      recibo({ id: 'n4', periodo: '2025-04', consumo_periodo: 115 }),
    ];
    expect(computeAnomalias(recibos).size).toBe(0);
  });

  it('aísla el baseline por tipo de servicio', () => {
    const recibos = [
      recibo({ id: 'a1', servicio_tipo: 'agua', periodo: '2025-01', consumo_periodo: 10 }),
      recibo({ id: 'a2', servicio_tipo: 'agua', periodo: '2025-02', consumo_periodo: 10 }),
      recibo({ id: 'g1', servicio_tipo: 'gas', periodo: '2025-01', consumo_periodo: 200 }),
      recibo({ id: 'g2', servicio_tipo: 'gas', periodo: '2025-02', consumo_periodo: 200 }),
      recibo({ id: 'a3', servicio_tipo: 'agua', periodo: '2025-03', consumo_periodo: 50 }), // +400% agua
    ];
    const anom = computeAnomalias(recibos);
    expect(anom.has('a3')).toBe(true);
    expect(anom.has('g2')).toBe(false);
  });
});
