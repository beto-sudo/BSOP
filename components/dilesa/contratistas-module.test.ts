import { describe, expect, it } from 'vitest';
import { deriveKpis, type ContratistaRow } from './contratistas-module';

function c(overrides: Partial<ContratistaRow>): ContratistaRow {
  return {
    persona_id: 'p',
    nombre: 'X',
    rfc: null,
    abreviacion: null,
    persona_fisica_o_moral: null,
    repse: null,
    retencion_pct: null,
    activo: true,
    obrasEnCurso: 0,
    obrasTerminadas: 0,
    moEjecutadoTotal: 0,
    ...overrides,
  };
}

describe('deriveKpis (Contratistas DILESA — ADR-034)', () => {
  it('returns 5 KPIs', () => {
    expect(deriveKpis([]).map((k) => k.key)).toEqual([
      'total',
      'activos',
      'obras_curso',
      'obras_term',
      'mo',
    ]);
  });
  it('total + activos cuentan correctamente', () => {
    const rows = [c({ activo: true }), c({ activo: false }), c({ activo: true })];
    expect(deriveKpis(rows)[0]?.value).toBe(3);
    expect(deriveKpis(rows)[1]?.value).toBe(2);
  });
  it('obras en curso suma', () => {
    expect(deriveKpis([c({ obrasEnCurso: 5 }), c({ obrasEnCurso: 10 })])[2]?.value).toBe(15);
  });
  it('mo "—" sin rows', () => {
    expect(deriveKpis([])[4]?.value).toBe('—');
  });
  it('mo compact con datos', () => {
    expect(String(deriveKpis([c({ moEjecutadoTotal: 5_000_000 })])[4]?.value)).toContain('5');
  });
});
