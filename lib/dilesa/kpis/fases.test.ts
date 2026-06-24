import { describe, expect, it } from 'vitest';
import { deriveFasesKpis, type VentaForKpis } from './fases';

const NOW = new Date('2026-05-26T12:00:00Z').getTime();

function v(overrides: Partial<VentaForKpis>): VentaForKpis {
  return {
    estado: 'activa',
    fase_actual: 'Solicitud',
    fase_posicion: 1,
    created_at: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('deriveFasesKpis (DILESA Fases — ADR-034)', () => {
  it('returns 5 KPIs in pivote D10 order', () => {
    const kpis = deriveFasesKpis([], { now: NOW });
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'activas',
      'fase_poblada',
      'dias_promedio',
      'estancadas',
      'avance',
    ]);
  });

  it('activas cuenta solo estado="activa" — terminadas y desasignadas quedan fuera del pipeline vivo', () => {
    const rows = [
      v({ estado: 'activa' }),
      v({ estado: 'activa' }),
      v({ estado: 'desasignada' }),
      v({ estado: 'terminada', fase_actual: 'Cerrar operación', fase_posicion: 17 }),
    ];
    expect(deriveFasesKpis(rows, { now: NOW })[0]?.value).toBe(2);
  });

  it('fase más poblada toma argmax por count, formato "Nombre (N)"', () => {
    const rows = [
      v({ fase_actual: 'Solicitud' }),
      v({ fase_actual: 'Aprobación' }),
      v({ fase_actual: 'Aprobación' }),
      v({ fase_actual: 'Aprobación' }),
    ];
    expect(deriveFasesKpis(rows, { now: NOW })[1]?.value).toBe('Aprobación (3)');
  });

  it('fase más poblada devuelve "—" cuando no hay activas', () => {
    expect(deriveFasesKpis([], { now: NOW })[1]?.value).toBe('—');
  });

  it('días promedio en pipeline = mean(days_since(created_at)) en activas', () => {
    // 3 ventas con 10/30/60 días respectivamente = mean 33
    const rows = [
      v({ created_at: new Date(NOW - 10 * 86400000).toISOString() }),
      v({ created_at: new Date(NOW - 30 * 86400000).toISOString() }),
      v({ created_at: new Date(NOW - 60 * 86400000).toISOString() }),
    ];
    expect(deriveFasesKpis(rows, { now: NOW })[2]?.value).toBe('33 días');
  });

  it('estancadas = activas con > 180 días desde created_at', () => {
    const rows = [
      v({ created_at: new Date(NOW - 30 * 86400000).toISOString() }), // joven
      v({ created_at: new Date(NOW - 200 * 86400000).toISOString() }), // estancada
      v({ created_at: new Date(NOW - 365 * 86400000).toISOString() }), // estancada
      v({
        estado: 'desasignada',
        created_at: new Date(NOW - 500 * 86400000).toISOString(),
      }), // NO cuenta (no activa)
    ];
    expect(deriveFasesKpis(rows, { now: NOW })[3]?.value).toBe(2);
  });

  it('avance promedio = mean(fase_posicion)/max', () => {
    // posiciones 5, 10, 15 → mean 10 → 10/15 = 66.7%
    const rows = [v({ fase_posicion: 5 }), v({ fase_posicion: 10 }), v({ fase_posicion: 15 })];
    expect(String(deriveFasesKpis(rows, { now: NOW })[4]?.value)).toContain('66');
  });

  it('avance devuelve "—" cuando ninguna activa tiene fase_posicion', () => {
    const rows = [v({ fase_posicion: null })];
    expect(deriveFasesKpis(rows, { now: NOW })[4]?.value).toBe('—');
  });

  it('reactivity: filtrar las activas a un subset cambia todos los KPIs', () => {
    const todas = [
      v({
        fase_actual: 'Solicitud',
        fase_posicion: 1,
        created_at: new Date(NOW - 10 * 86400000).toISOString(),
      }),
      v({
        fase_actual: 'Escrituración',
        fase_posicion: 17,
        created_at: new Date(NOW - 200 * 86400000).toISOString(),
      }),
    ];
    const soloViejas = todas.filter((r) => r.fase_posicion === 17);
    const k = deriveFasesKpis(soloViejas, { now: NOW });
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe('Escrituración (1)');
    expect(k[2]?.value).toBe('200 días');
    expect(k[3]?.value).toBe(1);
    expect(String(k[4]?.value)).toContain('100');
  });
});
