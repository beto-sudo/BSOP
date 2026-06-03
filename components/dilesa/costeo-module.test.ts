import { describe, expect, it } from 'vitest';
import { deriveKpis, type ContratoAgg, type CosteoRow } from './costeo-module';

function r(overrides: Partial<CosteoRow>): CosteoRow {
  return {
    id: 'id',
    proyecto_id: 'p1',
    proyectoNombre: 'Lomas',
    etapa: 'Urbanización',
    concepto: 'Drenaje',
    presupuestoPrevio: null,
    presupuestoActualizado: null,
    presupuesto: 0,
    gastoReal: 0,
    proveedor: null,
    fechaCompromiso: null,
    orden: 0,
    ratio: null,
    ...overrides,
  };
}

const NO_CONTRATOS: ContratoAgg = { contratado: 0, saldo: 0 };

describe('deriveKpis (Costeo DILESA — ADR-034)', () => {
  it('returns 5 KPIs en orden estable', () => {
    const k = deriveKpis([], NO_CONTRATOS);
    expect(k.map((x) => x.key)).toEqual([
      'presupuesto',
      'gasto',
      'ejecucion',
      'contratado',
      'saldo',
    ]);
  });

  it('"—" cuando no hay rows ni contratos', () => {
    const k = deriveKpis([], NO_CONTRATOS);
    expect(k[0]?.value).toBe('—');
    expect(k[1]?.value).toBe('—');
    expect(k[2]?.value).toBe('—');
  });

  it('suma presupuesto y gasto real (compact)', () => {
    const rows = [
      r({ presupuesto: 1_000_000, gastoReal: 500_000 }),
      r({ presupuesto: 2_000_000, gastoReal: 1_500_000 }),
    ];
    const k = deriveKpis(rows, NO_CONTRATOS);
    expect(String(k[0]?.value)).toContain('3'); // 3M presupuesto
    expect(String(k[1]?.value)).toContain('2'); // 2M gasto
  });

  it('% ejecución = gasto / presupuesto', () => {
    const rows = [r({ presupuesto: 1_000_000, gastoReal: 250_000 })];
    expect(String(deriveKpis(rows, NO_CONTRATOS)[2]?.value)).toContain('25');
  });

  it('ignora nulls al sumar (presupuesto/gasto null no rompe)', () => {
    const rows = [
      r({ presupuesto: null, gastoReal: 100 }),
      r({ presupuesto: 200, gastoReal: null }),
    ];
    const k = deriveKpis(rows, NO_CONTRATOS);
    // presupuesto Σ = 200, gasto Σ = 100, ratio = 0.5
    expect(String(k[2]?.value)).toContain('50');
  });

  it('% ejecución "—" si presupuesto = 0 (evita /0)', () => {
    const rows = [r({ presupuesto: 0, gastoReal: 500 })];
    expect(deriveKpis(rows, NO_CONTRATOS)[2]?.value).toBe('—');
  });

  it('contratado y saldo vienen del agregado de Capa B', () => {
    const k = deriveKpis([r({})], { contratado: 5_000_000, saldo: 1_200_000 });
    expect(String(k[3]?.value)).toContain('5'); // contratado
    expect(String(k[4]?.value)).toContain('1'); // saldo
  });
});
