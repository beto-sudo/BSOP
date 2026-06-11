import { describe, it, expect } from 'vitest';
import {
  cambiosNetosPorPartida,
  deltaFirmado,
  mapOrdenCambio,
  ordenesPendientes,
  type OrdenCambio,
} from './ordenes-cambio';

function orden(partial: Partial<OrdenCambio>): OrdenCambio {
  return {
    id: 'o1',
    proyectoId: 'p1',
    partidaId: 'pa1',
    tipo: 'aditiva',
    montoDelta: 100,
    categoria: 'otro',
    motivo: 'x',
    estado: 'autorizada',
    solicitadoPor: null,
    solicitadoAt: '2026-06-10T00:00:00Z',
    resueltoPor: null,
    resueltoAt: null,
    motivoRechazo: null,
    montoAntes: null,
    montoDespues: null,
    ...partial,
  };
}

describe('deltaFirmado', () => {
  it('aditiva suma, deductiva resta', () => {
    expect(deltaFirmado(orden({ tipo: 'aditiva', montoDelta: 50 }))).toBe(50);
    expect(deltaFirmado(orden({ tipo: 'deductiva', montoDelta: 50 }))).toBe(-50);
  });
});

describe('cambiosNetosPorPartida', () => {
  it('suma solo autorizadas, neteando aditivas y deductivas por partida', () => {
    const netos = cambiosNetosPorPartida([
      orden({ id: 'a', partidaId: 'pa1', tipo: 'aditiva', montoDelta: 100 }),
      orden({ id: 'b', partidaId: 'pa1', tipo: 'deductiva', montoDelta: 30 }),
      orden({ id: 'c', partidaId: 'pa2', tipo: 'deductiva', montoDelta: 10 }),
      orden({ id: 'd', partidaId: 'pa1', tipo: 'aditiva', montoDelta: 999, estado: 'solicitada' }),
      orden({ id: 'e', partidaId: 'pa1', tipo: 'aditiva', montoDelta: 999, estado: 'rechazada' }),
      orden({ id: 'f', partidaId: 'pa3', tipo: 'aditiva', montoDelta: 999, estado: 'cancelada' }),
    ]);
    expect(netos.get('pa1')).toBe(70);
    expect(netos.get('pa2')).toBe(-10);
    expect(netos.has('pa3')).toBe(false);
  });

  it('vacío sin órdenes', () => {
    expect(cambiosNetosPorPartida([]).size).toBe(0);
  });
});

describe('ordenesPendientes', () => {
  it('filtra solo solicitadas', () => {
    const pend = ordenesPendientes([
      orden({ id: 'a', estado: 'solicitada' }),
      orden({ id: 'b', estado: 'autorizada' }),
      orden({ id: 'c', estado: 'rechazada' }),
    ]);
    expect(pend.map((o) => o.id)).toEqual(['a']);
  });
});

describe('mapOrdenCambio', () => {
  it('mapea fila cruda con numerics como string (PostgREST)', () => {
    const o = mapOrdenCambio({
      id: 'x',
      proyecto_id: 'p',
      partida_id: 'pa',
      tipo: 'deductiva',
      monto_delta: '1500.50',
      motivo_categoria: 'adjudicacion',
      motivo: 'ahorro en RFQ',
      estado: 'autorizada',
      solicitado_por: 'u1',
      solicitado_at: '2026-06-10T00:00:00Z',
      resuelto_por: 'u2',
      resuelto_at: '2026-06-10T01:00:00Z',
      motivo_rechazo: null,
      monto_aprobado_antes: '5000',
      monto_aprobado_despues: '3499.5',
    });
    expect(o.montoDelta).toBe(1500.5);
    expect(o.tipo).toBe('deductiva');
    expect(o.categoria).toBe('adjudicacion');
    expect(o.montoAntes).toBe(5000);
    expect(o.montoDespues).toBe(3499.5);
  });
});
