import { describe, expect, it } from 'vitest';
import { deriveKpis, type EstimacionRow } from './estimaciones-module';

function e(overrides: Partial<EstimacionRow>): EstimacionRow {
  return {
    id: 'id',
    codigo: 'EST-001',
    fecha_cierre: '2026-01-01',
    fecha_pago_programado: '2026-01-02',
    contratista_id: 'c',
    monto_bruto: 0,
    monto_neto: 0,
    estado: 'borrador',
    pagada_at: null,
    contratistaNombre: 'X',
    contratistaAbreviacion: null,
    tareasCount: 0,
    ...overrides,
  };
}

describe('deriveKpis (Estimaciones DILESA — ADR-034)', () => {
  it('returns 5 KPIs', () => {
    expect(deriveKpis([]).map((k) => k.key)).toEqual([
      'total',
      'pendientes',
      'pagadas',
      'neto_total',
      'pendiente_monto',
    ]);
  });
  it('pendientes = borrador + aprobada + facturada', () => {
    const rows = [
      e({ estado: 'borrador' }),
      e({ estado: 'aprobada' }),
      e({ estado: 'facturada' }),
      e({ estado: 'pagada' }),
      e({ estado: 'cancelada' }),
    ];
    expect(deriveKpis(rows)[1]?.value).toBe(3);
    expect(deriveKpis(rows)[2]?.value).toBe(1);
  });
  it('neto total y pendiente monto', () => {
    const rows = [
      e({ estado: 'borrador', monto_neto: 1_000_000 }),
      e({ estado: 'pagada', monto_neto: 2_000_000 }),
    ];
    expect(String(deriveKpis(rows)[3]?.value)).toContain('3'); // total 3M
    expect(String(deriveKpis(rows)[4]?.value)).toContain('1'); // pendiente 1M
  });
  it('"—" sin rows', () => {
    expect(deriveKpis([])[3]?.value).toBe('—');
    expect(deriveKpis([])[4]?.value).toBe('—');
  });
});
