import { describe, expect, it } from 'vitest';
import { mandatoLabel, resumenConsejo, type Consejero } from './gobierno';

function consejero(overrides: Partial<Consejero>): Consejero {
  return {
    id: 'c',
    empresa_id: 'e',
    organo: 'consejo',
    socio_id: null,
    persona_id: null,
    nombre: 'X',
    cargo: 'propietario',
    ostenta_voto: false,
    vitalicio: false,
    periodo_inicio: null,
    periodo_fin: null,
    activo: true,
    notas: null,
    ...overrides,
  };
}

describe('mandatoLabel', () => {
  it('null / 0 / negativo → —', () => {
    expect(mandatoLabel(null)).toBe('—');
    expect(mandatoLabel(0)).toBe('—');
    expect(mandatoLabel(-3)).toBe('—');
  });
  it('múltiplos de 12 → años', () => {
    expect(mandatoLabel(12)).toBe('1 año');
    expect(mandatoLabel(36)).toBe('3 años');
  });
  it('no múltiplos → meses', () => {
    expect(mandatoLabel(18)).toBe('18 meses');
  });
});

describe('resumenConsejo', () => {
  it('cuenta solo activos del órgano consejo', () => {
    const r = resumenConsejo([
      consejero({ ostenta_voto: true, vitalicio: true }),
      consejero({ ostenta_voto: true }),
      consejero({ ostenta_voto: false }),
      consejero({ activo: false, ostenta_voto: true }), // inactivo → no cuenta
      consejero({ organo: 'comite_directivo', ostenta_voto: true }), // otro órgano → no cuenta
    ]);
    expect(r).toEqual({ total: 3, conVoto: 2, vitalicios: 1 });
  });
  it('vacío', () => {
    expect(resumenConsejo([])).toEqual({ total: 0, conVoto: 0, vitalicios: 0 });
  });
});
