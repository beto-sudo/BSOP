import { describe, expect, it } from 'vitest';
import {
  deriveReqEstado,
  deriveReqKpis,
  puedeGenerarOc,
  reqLineaTotal,
  reqTotal,
  type ReqLinea,
  type ReqRow,
} from './requisiciones';

function linea(over: Partial<ReqLinea>): ReqLinea {
  return {
    id: 'l',
    partidaId: 'p',
    partidaLabel: 'Red de agua potable',
    descripcion: '',
    unidad: null,
    cantidad: 1,
    precioEstimado: 0,
    ...over,
  };
}

function req(over: Partial<ReqRow>): ReqRow {
  return {
    id: 'r',
    codigo: 'REQ-1',
    proyectoId: 'pr',
    proyectoNombre: 'Lomas',
    solicitanteNombre: 'Beto',
    autorizadaAt: null,
    ocCodigo: null,
    fecha: null,
    justificacion: null,
    lineas: [],
    ...over,
  };
}

describe('reqLineaTotal / reqTotal', () => {
  it('línea = cantidad × precio estimado', () => {
    expect(reqLineaTotal(linea({ cantidad: 3, precioEstimado: 100 }))).toBe(300);
  });
  it('requisición = Σ líneas', () => {
    const r = req({
      lineas: [
        linea({ cantidad: 2, precioEstimado: 50 }),
        linea({ cantidad: 1, precioEstimado: 100 }),
      ],
    });
    expect(reqTotal(r)).toBe(200);
  });
  it('null-safe en cantidad/precio', () => {
    expect(
      reqLineaTotal(linea({ cantidad: undefined as unknown as number, precioEstimado: 10 }))
    ).toBe(0);
  });
});

describe('deriveReqEstado', () => {
  it('pendiente cuando no hay autorización ni OC', () => {
    expect(deriveReqEstado(req({ autorizadaAt: null, ocCodigo: null }))).toBe('pendiente');
  });
  it('autorizada cuando hay autorizada_at pero no OC', () => {
    expect(deriveReqEstado(req({ autorizadaAt: '2026-06-05T00:00:00Z', ocCodigo: null }))).toBe(
      'autorizada'
    );
  });
  it('con_oc cuando hay OC ligada (gana sobre autorizada_at)', () => {
    expect(deriveReqEstado(req({ autorizadaAt: '2026-06-05T00:00:00Z', ocCodigo: 'OC-9' }))).toBe(
      'con_oc'
    );
    expect(deriveReqEstado(req({ autorizadaAt: null, ocCodigo: 'OC-9' }))).toBe('con_oc');
  });
});

describe('puedeGenerarOc', () => {
  it('true cuando no hay OC y hay línea con partida y cantidad', () => {
    expect(
      puedeGenerarOc(req({ ocCodigo: null, lineas: [linea({ partidaId: 'p', cantidad: 1 })] }))
    ).toBe(true);
  });
  it('false cuando ya tiene OC ligada', () => {
    expect(
      puedeGenerarOc(req({ ocCodigo: 'OC-1', lineas: [linea({ partidaId: 'p', cantidad: 1 })] }))
    ).toBe(false);
  });
  it('false cuando ninguna línea tiene partida o cantidad', () => {
    expect(puedeGenerarOc(req({ ocCodigo: null, lineas: [linea({ partidaId: null })] }))).toBe(
      false
    );
    expect(
      puedeGenerarOc(req({ ocCodigo: null, lineas: [linea({ partidaId: 'p', cantidad: 0 })] }))
    ).toBe(false);
  });
});

describe('deriveReqKpis', () => {
  it('cuenta por estado y suma estimado de lo no convertido a OC', () => {
    const rows = [
      req({
        autorizadaAt: null,
        ocCodigo: null,
        lineas: [linea({ cantidad: 1, precioEstimado: 1000 })],
      }),
      req({
        autorizadaAt: '2026-06-05T00:00:00Z',
        ocCodigo: null,
        lineas: [linea({ cantidad: 1, precioEstimado: 2000 })],
      }),
      req({
        autorizadaAt: '2026-06-05T00:00:00Z',
        ocCodigo: 'OC-1',
        lineas: [linea({ cantidad: 1, precioEstimado: 9999 })],
      }),
    ];
    const k = deriveReqKpis(rows);
    expect(k.total).toBe(3);
    expect(k.pendientes).toBe(1);
    expect(k.autorizadas).toBe(1);
    expect(k.conOc).toBe(1);
    // estimado = 1000 + 2000 (la con_oc no suma)
    expect(k.estimado).toBe(3000);
  });

  it('vacío → todo en cero', () => {
    expect(deriveReqKpis([])).toEqual({
      total: 0,
      pendientes: 0,
      autorizadas: 0,
      conOc: 0,
      estimado: 0,
    });
  });
});
