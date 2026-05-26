import { describe, expect, it } from 'vitest';
import { deriveKpis, type ContratoRow } from './contratos-module';

function c(overrides: Partial<ContratoRow>): ContratoRow {
  return {
    id: 'id',
    codigo: 'CON-001',
    fecha_contrato: '2026-01-01',
    contratista_id: 'c',
    proyecto_id: null,
    valor_total: 0,
    contratistaNombre: 'Contratista',
    contratistaAbreviacion: null,
    proyectoNombre: 'P',
    lotesCount: 0,
    ...overrides,
  };
}

describe('deriveKpis (Contratos DILESA — ADR-034)', () => {
  it('returns 5 KPIs', () => {
    const k = deriveKpis([]);
    expect(k.map((x) => x.key)).toEqual(['total', 'valor', 'lotes', 'promedio', 'top']);
  });
  it('total cuenta rows', () => {
    expect(deriveKpis([c({}), c({})])[0]?.value).toBe(2);
  });
  it('valor compact', () => {
    const rows = [c({ valor_total: 1_500_000 }), c({ valor_total: 2_500_000 })];
    expect(String(deriveKpis(rows)[1]?.value)).toContain('4');
  });
  it('"—" sin rows', () => {
    expect(deriveKpis([])[1]?.value).toBe('—');
  });
  it('lotes suma', () => {
    expect(deriveKpis([c({ lotesCount: 5 }), c({ lotesCount: 10 })])[2]?.value).toBe(15);
  });
  it('promedio por contrato', () => {
    const rows = [c({ valor_total: 1_000_000 }), c({ valor_total: 3_000_000 })];
    expect(String(deriveKpis(rows)[3]?.value)).toContain('2');
  });
  it('top contratista', () => {
    const rows = [
      c({ contratistaNombre: 'Ana' }),
      c({ contratistaNombre: 'Ana' }),
      c({ contratistaNombre: 'Pedro' }),
    ];
    expect(String(deriveKpis(rows)[4]?.value)).toContain('Ana');
  });
});
