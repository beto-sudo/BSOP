import { describe, it, expect } from 'vitest';
import {
  buildTimelinePresupuesto,
  cambiosNetosPorPartida,
  deltaFirmado,
  mapOrdenCambio,
  ordenesPendientes,
  type BaselineInfo,
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
    canceladaPor: null,
    canceladaAt: null,
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

describe('buildTimelinePresupuesto', () => {
  const baseline: BaselineInfo = {
    id: 'b1',
    proyectoId: 'p1',
    total: 1000,
    partidasCount: 3,
    notas: 'junta del 15',
    autorizadoPor: 'u-dir',
    autorizadoAt: '2026-06-01T10:00:00Z',
  };

  it('baseline + solicitud + resolución, cronológico DESC', () => {
    const eventos = buildTimelinePresupuesto(baseline, [
      orden({
        id: 'a',
        estado: 'autorizada',
        solicitadoAt: '2026-06-02T10:00:00Z',
        resueltoAt: '2026-06-03T10:00:00Z',
        resueltoPor: 'u-dir',
      }),
    ]);
    expect(eventos.map((e) => e.tipo)).toEqual([
      'orden_autorizada',
      'orden_solicitada',
      'baseline',
    ]);
    expect(eventos[2]).toMatchObject({ monto: 1000, detalle: 'junta del 15', actorId: 'u-dir' });
    expect(eventos[0]?.delta).toBe(100);
  });

  it('rechazada usa motivo de rechazo; cancelada usa cancelada_at', () => {
    const eventos = buildTimelinePresupuesto(null, [
      orden({
        id: 'r',
        estado: 'rechazada',
        tipo: 'deductiva',
        solicitadoAt: '2026-06-02T10:00:00Z',
        resueltoAt: '2026-06-02T12:00:00Z',
        motivoRechazo: 'sin soporte',
      }),
      orden({
        id: 'c',
        estado: 'cancelada',
        solicitadoAt: '2026-06-01T10:00:00Z',
        canceladaAt: '2026-06-01T11:00:00Z',
        canceladaPor: 'u-op',
      }),
    ]);
    const rechazo = eventos.find((e) => e.tipo === 'orden_rechazada');
    expect(rechazo).toMatchObject({ detalle: 'sin soporte', delta: -100 });
    const cancel = eventos.find((e) => e.tipo === 'orden_cancelada');
    expect(cancel).toMatchObject({ actorId: 'u-op', fecha: '2026-06-01T11:00:00Z' });
    // Solicitada pendiente (sin resolver) no genera evento terminal.
    expect(eventos).toHaveLength(4);
  });

  it('sin baseline ni órdenes → vacío', () => {
    expect(buildTimelinePresupuesto(null, [])).toEqual([]);
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
