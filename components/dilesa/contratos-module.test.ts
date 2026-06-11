import { describe, expect, it } from 'vitest';
import { deriveKpis, deriveKpisObra, esContratoObra, type ContratoRow } from './contratos-module';

function c(overrides: Partial<ContratoRow>): ContratoRow {
  return {
    id: 'id',
    codigo: 'CON-001',
    fecha_contrato: '2026-01-01',
    contratista_id: 'c',
    proyecto_id: null,
    valor_total: 0,
    tipo: 'vivienda',
    cancelada_at: null,
    contratistaNombre: 'Contratista',
    contratistaAbreviacion: null,
    proyectoNombre: 'P',
    lotesCount: 0,
    devengado: 0,
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

describe('esContratoObra (sub-vistas S2)', () => {
  it('vivienda no es obra; el resto sí', () => {
    expect(esContratoObra(c({ tipo: 'vivienda' }))).toBe(false);
    expect(esContratoObra(c({ tipo: 'urbanizacion' }))).toBe(true);
    expect(esContratoObra(c({ tipo: 'obra_cabecera' }))).toBe(true);
    expect(esContratoObra(c({ tipo: 'tarea_menor' }))).toBe(true);
  });
});

describe('deriveKpisObra (vista Obra de proyecto — D4)', () => {
  it('returns 5 KPIs', () => {
    expect(deriveKpisObra([]).map((x) => x.key)).toEqual([
      'total',
      'contratado',
      'devengado',
      'por_devengar',
      'avance',
    ]);
  });
  it('contratado/devengado suman; avance = devengado/contratado', () => {
    const rows = [
      c({ tipo: 'urbanizacion', valor_total: 1_000_000, devengado: 400_000 }),
      c({ tipo: 'urbanizacion', valor_total: 1_000_000, devengado: 600_000 }),
    ];
    const k = deriveKpisObra(rows);
    expect(String(k[1]?.value)).toContain('2');
    expect(String(k[2]?.value)).toContain('1');
    expect(k[4]?.value).toBe('50%');
  });
  it('cancelados cuentan en total pero no suman dinero', () => {
    const rows = [
      c({ tipo: 'urbanizacion', valor_total: 1_000_000, devengado: 500_000 }),
      c({
        tipo: 'urbanizacion',
        valor_total: 9_000_000,
        devengado: 9_000_000,
        cancelada_at: '2026-06-01',
      }),
    ];
    const k = deriveKpisObra(rows);
    expect(k[0]?.value).toBe(2);
    expect(k[4]?.value).toBe('50%');
  });
  it('"—" sin contratos activos', () => {
    expect(deriveKpisObra([])[1]?.value).toBe('—');
    expect(deriveKpisObra([])[4]?.value).toBe('—');
  });
});
