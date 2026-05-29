import { describe, expect, it } from 'vitest';
import { groupByEstado, totalesPorEstado, type PartidaRow } from './partidas-presupuestales';

function p(over: Partial<PartidaRow>): PartidaRow {
  return {
    id: over.id ?? 'p-' + Math.random().toString(36).slice(2, 8),
    partida: 'Partida X',
    descripcion: null,
    monto_estimado: null,
    monto_aprobado: null,
    monto_ejercido: null,
    fuente: null,
    estado: 'preliminar',
    tarea_origen_id: null,
    autorizado_at: null,
    ...over,
  };
}

describe('groupByEstado (Sprint 2)', () => {
  it('devuelve map vacío si no hay partidas', () => {
    expect(groupByEstado([]).size).toBe(0);
  });

  it('agrupa por estado', () => {
    const partidas = [
      p({ id: 'a', estado: 'preliminar' }),
      p({ id: 'b', estado: 'preliminar' }),
      p({ id: 'c', estado: 'autorizada' }),
    ];
    const map = groupByEstado(partidas);
    expect(map.get('preliminar')).toHaveLength(2);
    expect(map.get('autorizada')).toHaveLength(1);
    expect(map.has('cerrada')).toBe(false);
  });

  it('un estado inválido se mete a preliminar como fallback', () => {
    const map = groupByEstado([p({ estado: 'desconocido' as never })]);
    expect(map.get('preliminar')).toHaveLength(1);
  });
});

describe('totalesPorEstado (Sprint 2)', () => {
  it('suma monto_aprobado cuando existe, sino monto_estimado', () => {
    const partidas = [
      p({ estado: 'preliminar', monto_estimado: 1000 }), // no aprobado
      p({ estado: 'preliminar', monto_estimado: 500 }),
      p({ estado: 'autorizada', monto_estimado: 2000, monto_aprobado: 2200 }), // gana aprobado
    ];
    const t = totalesPorEstado(partidas);
    expect(t.preliminar).toBe(1500);
    expect(t.autorizada).toBe(2200);
  });

  it('partidas con ambos null no contribuyen', () => {
    const partidas = [p({ estado: 'preliminar', monto_estimado: null, monto_aprobado: null })];
    expect(totalesPorEstado(partidas).preliminar).toBe(0);
  });

  it('estados sin partidas no aparecen en el objeto', () => {
    const t = totalesPorEstado([p({ estado: 'preliminar', monto_estimado: 100 })]);
    expect(t.autorizada).toBeUndefined();
    expect(t.cerrada).toBeUndefined();
  });
});
