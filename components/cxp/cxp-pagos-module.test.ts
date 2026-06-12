import { describe, expect, it } from 'vitest';
import { filtrarPagosPorEstado } from './cxp-pagos-module';

type EstadoPago = 'programado' | 'aprobado' | 'pagado' | 'rechazado' | 'cancelado';

const PAGOS: { id: string; estado: EstadoPago }[] = [
  { id: 'prog', estado: 'programado' },
  { id: 'aprob', estado: 'aprobado' },
  { id: 'pag', estado: 'pagado' },
  { id: 'canc', estado: 'cancelado' },
  { id: 'rech', estado: 'rechazado' },
];

describe('filtrarPagosPorEstado (CxP · Pagos)', () => {
  it("'pendientes' (default de la vista) incluye programados Y aprobados — un pago aprobado no se pierde", () => {
    expect(filtrarPagosPorEstado(PAGOS, 'pendientes').map((p) => p.id)).toEqual(['prog', 'aprob']);
  });

  it('cadena vacía = todos los estados', () => {
    expect(filtrarPagosPorEstado(PAGOS, '')).toHaveLength(PAGOS.length);
  });

  it('un estado concreto filtra exacto', () => {
    expect(filtrarPagosPorEstado(PAGOS, 'pagado').map((p) => p.id)).toEqual(['pag']);
    expect(filtrarPagosPorEstado(PAGOS, 'cancelado').map((p) => p.id)).toEqual(['canc']);
  });
});

// ── armarControlPorPartida ────────────────────────────────────────────────────

import { armarControlPorPartida, type AbonoEjecutado } from './cxp-pagos-module';

const PARTIDA_MURO = {
  id: 'muro',
  concepto_texto: 'Muro de contención',
  presupuesto_aprobado: 1631152,
};
const CONTRATO_MURO = { partida_id: 'muro', codigo: '2026/1-DIE-MAYA-CAB#1', valor_total: 860000 };

const abono = (over: Partial<AbonoEjecutado>): AbonoEjecutado => ({
  pago_id: 'p-x',
  partida_id: 'muro',
  monto: 0,
  fecha: null,
  referencia: null,
  ...over,
});

describe('armarControlPorPartida (CxP · drawer del pago)', () => {
  it('caso real Morado: contrato en la partida, sin abonos previos', () => {
    const cards = armarControlPorPartida({
      pagoId: 'pago-195',
      aplicacionesDelPago: [{ monto_aplicado: 195000, partida_id: 'muro' }],
      partidas: [PARTIDA_MURO],
      contratos: [CONTRATO_MURO],
      abonosEjecutados: [],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      concepto: 'Muro de contención',
      contratado: 860000,
      contratoCodigo: '2026/1-DIE-MAYA-CAB#1',
      abonadoPrevio: 0,
      estePago: 195000,
      abonos: [],
    });
  });

  it('un pago ya ejecutado excluye sus propias aplicaciones de "abonado previo"', () => {
    const cards = armarControlPorPartida({
      pagoId: 'pago-195',
      aplicacionesDelPago: [{ monto_aplicado: 195000, partida_id: 'muro' }],
      partidas: [PARTIDA_MURO],
      contratos: [CONTRATO_MURO],
      abonosEjecutados: [
        abono({ pago_id: 'pago-195', monto: 195000, fecha: '2026-06-12' }),
        abono({ pago_id: 'pago-306', monto: 306000, fecha: '2026-06-11', referencia: 'SPEI 1' }),
      ],
    });
    expect(cards[0].abonadoPrevio).toBe(306000);
    expect(cards[0].estePago).toBe(195000);
    expect(cards[0].abonos.map((a) => a.pago_id)).toEqual(['pago-306']);
  });

  it('sin contrato usa presupuesto como referencia (contratado null)', () => {
    const cards = armarControlPorPartida({
      pagoId: 'p',
      aplicacionesDelPago: [{ monto_aplicado: 100, partida_id: 'muro' }],
      partidas: [PARTIDA_MURO],
      contratos: [],
      abonosEjecutados: [],
    });
    expect(cards[0].contratado).toBeNull();
    expect(cards[0].presupuesto).toBe(1631152);
  });

  it('suma varias facturas del pago a la misma partida y agrupa abonos por pago (desc por fecha)', () => {
    const cards = armarControlPorPartida({
      pagoId: 'p-nuevo',
      aplicacionesDelPago: [
        { monto_aplicado: 220000, partida_id: 'muro' },
        { monto_aplicado: 86000, partida_id: 'muro' },
        { monto_aplicado: 999, partida_id: null },
      ],
      partidas: [PARTIDA_MURO],
      contratos: [CONTRATO_MURO],
      abonosEjecutados: [
        abono({ pago_id: 'p-a', monto: 50000, fecha: '2026-05-01' }),
        abono({ pago_id: 'p-b', monto: 25000, fecha: '2026-06-01' }),
        abono({ pago_id: 'p-b', monto: 25000, fecha: '2026-06-01' }),
      ],
    });
    expect(cards[0].estePago).toBe(306000);
    expect(cards[0].abonadoPrevio).toBe(100000);
    expect(cards[0].abonos.map((a) => [a.pago_id, a.monto])).toEqual([
      ['p-b', 50000],
      ['p-a', 50000],
    ]);
  });

  it('dos contratos en la partida: suma valores y no muestra código único', () => {
    const cards = armarControlPorPartida({
      pagoId: 'p',
      aplicacionesDelPago: [{ monto_aplicado: 1, partida_id: 'muro' }],
      partidas: [PARTIDA_MURO],
      contratos: [CONTRATO_MURO, { partida_id: 'muro', codigo: 'OTRO', valor_total: 140000 }],
      abonosEjecutados: [],
    });
    expect(cards[0].contratado).toBe(1000000);
    expect(cards[0].contratoCodigo).toBeNull();
  });

  it('partida sin aplicación de este pago no genera card', () => {
    const cards = armarControlPorPartida({
      pagoId: 'p',
      aplicacionesDelPago: [{ monto_aplicado: 1, partida_id: 'muro' }],
      partidas: [PARTIDA_MURO, { id: 'otra', concepto_texto: 'Otra', presupuesto_aprobado: null }],
      contratos: [],
      abonosEjecutados: [],
    });
    expect(cards.map((c) => c.partida_id)).toEqual(['muro']);
  });
});
