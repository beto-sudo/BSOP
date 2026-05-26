import { describe, expect, it } from 'vitest';
import { deriveKpis, type PrototipoRow } from './prototipos-module';

function p(overrides: Partial<PrototipoRow>): PrototipoRow {
  return {
    id: 'id',
    nombre: 'X',
    proyectoNombre: 'P',
    m2_construccion: null,
    tiempo_construccion: null,
    costo_materiales: null,
    ultimoPrecioMoM2: null,
    totalMoCalculado: null,
    obrasEnConstruccion: 0,
    obrasTerminadas: 0,
    ...overrides,
  };
}

describe('deriveKpis (Prototipos DILESA — ADR-034)', () => {
  it('returns 5 KPIs', () => {
    expect(deriveKpis([]).map((k) => k.key)).toEqual([
      'total',
      'obras_curso',
      'obras_term',
      'mo_promedio',
      'm2',
    ]);
  });
  it('mo promedio ignora null', () => {
    const rows = [
      p({ totalMoCalculado: 1_000_000 }),
      p({ totalMoCalculado: 3_000_000 }),
      p({ totalMoCalculado: null }),
    ];
    // mean(2 valores) = 2M
    expect(String(deriveKpis(rows)[3]?.value)).toContain('2');
  });
  it('m2 con sufijo m²', () => {
    const rows = [p({ m2_construccion: 120 }), p({ m2_construccion: 80 })];
    expect(String(deriveKpis(rows)[4]?.value)).toContain('m²');
    expect(String(deriveKpis(rows)[4]?.value)).toContain('100');
  });
  it('"—" sin datos para mo/m2', () => {
    expect(deriveKpis([])[3]?.value).toBe('—');
    expect(deriveKpis([])[4]?.value).toBe('—');
  });
});
