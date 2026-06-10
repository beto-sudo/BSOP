/**
 * Tests del builder puro del hilo del gasto (`buildHiloPasos`) y de los hrefs
 * entre módulos (`hrefDoc`). Iniciativa `dilesa-flujo-gasto` · Sprint 1.
 *
 * Invariantes que protegen:
 * - H1: el sabor se deriva de los documentos (obra > directo > materiales).
 * - H2: pasos previos sin documento se omiten (hilo truncado), los futuros
 *   siempre aparecen como pendientes.
 * - H3: "Cotizada" solo aparece si hubo RFQ (o se mira desde la RFQ).
 * - H4: cancelaciones no cuentan como avance.
 * - H5: el paso del documento actual lleva `esActual` para el "estás aquí".
 * - H6: el href de la OC en DILESA va al hub Compras (no a /dilesa/ordenes-compra,
 *   ruta que no existe — bug que este sprint corrige en CxP).
 */

import { describe, expect, it } from 'vitest';
import {
  buildHiloPasos,
  emptyRegistros,
  hiloTieneActividad,
  hrefDoc,
  type HiloPaso,
  type HiloRegistros,
} from './hilo';

const reg = (partial: Partial<HiloRegistros>): HiloRegistros => ({
  ...emptyRegistros(),
  ...partial,
});

const REQ = { id: 'r1', codigo: 'REQ-1', autorizada_at: '2026-06-01', cancelada_at: null };
const COT = { id: 'c1', codigo: 'RFQ-1', estado: 'adjudicada', cancelada_at: null };
const OC = (over: Partial<HiloRegistros['ocs'][number]> = {}) => ({
  id: 'o1',
  codigo: 'OC-1',
  estado: 'enviada',
  cancelada_at: null,
  cantidadTotal: 10,
  cantidadRecibida: 0,
  total: 1000,
  ...over,
});
const FACT = (over: Partial<HiloRegistros['facturas'][number]> = {}) => ({
  id: 'f1',
  uuid_sat: 'ABCD1234-XXXX',
  estado_cxp: 'por_pagar',
  total: 1000,
  saldo: 1000,
  cancelada_at: null,
  ...over,
});
const PAGO = (over: Partial<HiloRegistros['pagos'][number]> = {}) => ({
  id: 'p1',
  estado: 'pagado',
  monto_total: 1000,
  fecha_pago: '2026-06-08',
  ...over,
});

const keys = (h: { pasos: HiloPaso[] }) => h.pasos.map((p) => p.key);
const paso = (h: { pasos: HiloPaso[] }, key: string) => {
  const p = h.pasos.find((x) => x.key === key);
  if (!p) throw new Error(`paso ${key} no existe`);
  return p;
};

describe('buildHiloPasos · sabor (H1)', () => {
  it('materiales cuando hay OC', () => {
    const h = buildHiloPasos(reg({ ocs: [OC()] }), { tipo: 'oc', id: 'o1' });
    expect(h.sabor).toBe('materiales');
    expect(keys(h)).toEqual(['ordenada', 'recibida', 'facturada', 'pagada']);
  });

  it('obra cuando hay contrato (aunque esté cancelado, el hilo fue de obra)', () => {
    const h = buildHiloPasos(
      reg({
        cotizaciones: [COT],
        contratos: [{ id: 'k1', codigo: 'CON-1', valor_total: 500, cancelada_at: '2026-06-05' }],
      }),
      { tipo: 'cotizacion', id: 'c1' }
    );
    expect(h.sabor).toBe('obra');
    expect(paso(h, 'contratada').estado).toBe('cancelado');
  });

  it('directo cuando se mira desde una factura sin OC', () => {
    const h = buildHiloPasos(reg({ facturas: [FACT()] }), { tipo: 'factura', id: 'f1' });
    expect(h.sabor).toBe('directo');
    expect(keys(h)).toEqual(['facturada', 'pagada']);
  });
});

describe('buildHiloPasos · truncado y pasos futuros (H2, H3)', () => {
  it('OC sin requisición ni RFQ omite Solicitada/Cotizada pero muestra futuros', () => {
    const h = buildHiloPasos(reg({ ocs: [OC()] }), { tipo: 'oc', id: 'o1' });
    expect(keys(h)).not.toContain('solicitada');
    expect(keys(h)).not.toContain('cotizada');
    expect(paso(h, 'facturada').estado).toBe('pendiente');
    expect(paso(h, 'pagada').estado).toBe('pendiente');
  });

  it('hilo completo: req → RFQ → OC → factura → pago', () => {
    const h = buildHiloPasos(
      reg({
        requisiciones: [REQ],
        cotizaciones: [COT],
        ocs: [OC({ cantidadRecibida: 10, estado: 'cerrada' })],
        facturas: [FACT({ saldo: 0, estado_cxp: 'pagada' })],
        pagos: [PAGO()],
      }),
      { tipo: 'factura', id: 'f1' }
    );
    expect(keys(h)).toEqual([
      'solicitada',
      'cotizada',
      'ordenada',
      'recibida',
      'facturada',
      'pagada',
    ]);
    expect(h.pasos.every((p) => p.estado === 'hecho')).toBe(true);
  });

  it('desde una requisición sola, Ordenada aparece como lo que sigue', () => {
    const h = buildHiloPasos(reg({ requisiciones: [REQ] }), { tipo: 'requisicion', id: 'r1' });
    expect(paso(h, 'ordenada').estado).toBe('pendiente');
    expect(paso(h, 'solicitada').estado).toBe('hecho');
  });
});

describe('buildHiloPasos · estados (H4, H5)', () => {
  it('recepción parcial reporta porcentaje', () => {
    const h = buildHiloPasos(reg({ ocs: [OC({ cantidadRecibida: 6, estado: 'parcial' })] }), {
      tipo: 'oc',
      id: 'o1',
    });
    expect(paso(h, 'recibida').estado).toBe('parcial');
    expect(paso(h, 'recibida').detalle).toBe('60%');
  });

  it('OC cerrada cuenta la recepción como hecha aunque no llegó al 100%', () => {
    const h = buildHiloPasos(reg({ ocs: [OC({ cantidadRecibida: 6, estado: 'cerrada' })] }), {
      tipo: 'oc',
      id: 'o1',
    });
    expect(paso(h, 'recibida').estado).toBe('hecho');
  });

  it('requisición sin autorizar queda parcial con detalle', () => {
    const h = buildHiloPasos(
      reg({ requisiciones: [{ ...REQ, autorizada_at: null }], ocs: [OC()] }),
      { tipo: 'oc', id: 'o1' }
    );
    expect(paso(h, 'solicitada').estado).toBe('parcial');
    expect(paso(h, 'solicitada').detalle).toBe('sin autorizar');
  });

  it('factura cancelada no cuenta como facturado', () => {
    const h = buildHiloPasos(
      reg({ ocs: [OC()], facturas: [FACT({ cancelada_at: '2026-06-07' })] }),
      { tipo: 'oc', id: 'o1' }
    );
    expect(paso(h, 'facturada').estado).toBe('cancelado');
  });

  it('pago programado (no pagado) deja Pagada en parcial', () => {
    const h = buildHiloPasos(
      reg({ ocs: [OC()], facturas: [FACT()], pagos: [PAGO({ estado: 'programado' })] }),
      { tipo: 'oc', id: 'o1' }
    );
    expect(paso(h, 'pagada').estado).toBe('parcial');
    expect(paso(h, 'pagada').detalle).toBe('programado');
  });

  it('marca esActual en el paso del documento desde el que se mira', () => {
    const h = buildHiloPasos(reg({ ocs: [OC()], facturas: [FACT()] }), {
      tipo: 'factura',
      id: 'f1',
    });
    expect(paso(h, 'facturada').esActual).toBe(true);
    expect(paso(h, 'ordenada').esActual).toBe(false);
  });

  it('pago multi-factura junta refs de todas las facturas', () => {
    const h = buildHiloPasos(
      reg({
        ocs: [OC(), OC({ id: 'o2', codigo: 'OC-2' })],
        facturas: [FACT(), FACT({ id: 'f2', uuid_sat: 'EFGH5678-YYYY' })],
        pagos: [PAGO()],
      }),
      { tipo: 'pago', id: 'p1' }
    );
    expect(paso(h, 'facturada').refs).toHaveLength(2);
    expect(paso(h, 'ordenada').refs).toHaveLength(2);
  });
});

describe('buildHiloPasos · actual=null (hilo por partida, fase 2)', () => {
  it('nada es esActual y el sabor sale solo de los datos', () => {
    const h = buildHiloPasos(reg({ ocs: [OC()], facturas: [FACT()] }), null);
    expect(h.sabor).toBe('materiales');
    expect(h.pasos.every((p) => !p.esActual)).toBe(true);
  });

  it('factura sin OC con actual=null es gasto directo', () => {
    const h = buildHiloPasos(reg({ facturas: [FACT()] }), null);
    expect(h.sabor).toBe('directo');
  });

  it('hiloTieneActividad distingue hilo vacío de hilo con avance', () => {
    expect(hiloTieneActividad(buildHiloPasos(reg({}), null))).toBe(false);
    expect(hiloTieneActividad(buildHiloPasos(reg({ ocs: [OC()] }), null))).toBe(true);
  });
});

describe('hrefDoc (H6)', () => {
  it('en DILESA la OC abre en el hub Compras', () => {
    expect(hrefDoc('dilesa', 'oc', 'x')).toBe('/dilesa/compras?focus=x');
  });
  it('en RDB la OC conserva su módulo propio', () => {
    expect(hrefDoc('rdb', 'oc', 'x')).toBe('/rdb/ordenes-compra?focus=x');
  });
  it('factura y pago van a CxP en cualquier empresa', () => {
    expect(hrefDoc('rdb', 'factura', 'x')).toBe('/rdb/cxp?focus=x');
    expect(hrefDoc('dilesa', 'pago', 'x')).toBe('/dilesa/cxp/pagos?focus=x');
  });
  it('documentos sin módulo en la empresa devuelven null (nodo sin link)', () => {
    expect(hrefDoc('rdb', 'requisicion', 'x')).toBeNull();
    expect(hrefDoc('rdb', 'contrato', 'x')).toBeNull();
  });
});
