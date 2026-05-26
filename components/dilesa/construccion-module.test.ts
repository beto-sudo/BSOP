import { describe, expect, it } from 'vitest';
import { deriveKpis, type ConstruccionListaRow } from './construccion-module';

function o(overrides: Partial<ConstruccionListaRow>): ConstruccionListaRow {
  return {
    id: 'id',
    codigo: 'OBR-001',
    unidad_id: 'u',
    producto_id: 'p',
    contratista_id: 'c',
    supervisor_persona_id: null,
    fecha_arranque: null,
    fecha_compromiso_terminar: null,
    fecha_terminada: null,
    fecha_seguro_calidad: null,
    fecha_paquete_ruv: null,
    fecha_dtu: null,
    avance_pct: 0,
    estado: 'arrancada',
    identificadorCompleto: 'M1-L1',
    proyectoNombre: 'P',
    prototipo: null,
    contratistaNombre: 'Contratista',
    contratistaAbreviacion: null,
    supervisorNombre: null,
    ...overrides,
  };
}

describe('deriveKpis (Construcción · Obras DILESA — ADR-034)', () => {
  it('returns 5 KPIs in defined order', () => {
    const kpis = deriveKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'total',
      'en_progreso',
      'avance',
      'terminadas',
      'proximas',
    ]);
  });

  it('total = rows.length', () => {
    expect(deriveKpis([o({}), o({}), o({})])[0]?.value).toBe(3);
  });

  it('en progreso = arrancada + en_progreso', () => {
    const rows = [
      o({ estado: 'arrancada' }),
      o({ estado: 'en_progreso' }),
      o({ estado: 'terminada' }),
      o({ estado: 'cancelada' }),
    ];
    expect(deriveKpis(rows)[1]?.value).toBe(2);
  });

  it('avance promedio en proporción 0-1 con formatPercent', () => {
    // 25 + 50 + 75 = 150 → mean 50 → 0.50 → "50.0%"
    const rows = [o({ avance_pct: 25 }), o({ avance_pct: 50 }), o({ avance_pct: 75 })];
    expect(String(deriveKpis(rows)[2]?.value)).toContain('50');
  });

  it('avance "—" cuando no hay rows', () => {
    expect(deriveKpis([])[2]?.value).toBe('—');
  });

  it('terminadas incluye terminada, dtu, seguro_calidad, extraida', () => {
    const rows = [
      o({ estado: 'terminada' }),
      o({ estado: 'dtu' }),
      o({ estado: 'seguro_calidad' }),
      o({ estado: 'extraida' }),
      o({ estado: 'en_progreso' }),
      o({ estado: 'cancelada' }),
    ];
    expect(deriveKpis(rows)[3]?.value).toBe(4);
  });

  it('próximas a entregar = avance >= 80 AND no terminada', () => {
    const rows = [
      o({ estado: 'en_progreso', avance_pct: 85 }), // cuenta
      o({ estado: 'arrancada', avance_pct: 90 }), // cuenta
      o({ estado: 'en_progreso', avance_pct: 70 }), // NO (< 80)
      o({ estado: 'terminada', avance_pct: 100 }), // NO (ya terminada)
    ];
    expect(deriveKpis(rows)[4]?.value).toBe(2);
  });

  it('reactivity: filtrar por estado="terminada" cambia los 5 KPIs', () => {
    const todas = [
      o({ estado: 'en_progreso', avance_pct: 40 }),
      o({ estado: 'terminada', avance_pct: 100 }),
    ];
    const soloTerminadas = todas.filter((r) => r.estado === 'terminada');
    const k = deriveKpis(soloTerminadas);
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe(0);
    expect(String(k[2]?.value)).toContain('100');
    expect(k[3]?.value).toBe(1);
    expect(k[4]?.value).toBe(0); // no cuenta porque ya terminada
  });
});
