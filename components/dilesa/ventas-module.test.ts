import { describe, expect, it } from 'vitest';
import { deriveKpis, matchVentaSearch, type VentaListaRow } from './ventas-module';

function row(overrides: Partial<VentaListaRow>): VentaListaRow {
  return {
    id: 'id',
    persona_id: 'p',
    unidad_id: null,
    estado: 'activa',
    fase_actual: null,
    fase_posicion: null,
    valor_escrituracion: null,
    valor_comercial: null,
    tipo_credito: null,
    vendedor: null,
    vendedor_usuario_id: null,
    numero_escritura: null,
    fecha_escritura: null,
    cliente: 'Test',
    unidadIdentificador: null,
    unidadFechaDtu: null,
    unidadFechaExtraccion: null,
    proyectoNombre: '',
    prototipo: null,
    precio: null,
    diasEnFase: null,
    ...overrides,
  };
}

describe('deriveKpis (Ventas DILESA — ADR-034)', () => {
  it('returns 5 KPIs in the order defined by Sprint 0 curation', () => {
    const kpis = deriveKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'count',
      'pipeline',
      'escrituradas',
      'avance',
      'top_vendedor',
    ]);
  });

  it('count is just rows.length', () => {
    expect(deriveKpis([row({}), row({}), row({})])[0]?.value).toBe(3);
  });

  it('pipeline sums precio across rows; null values are skipped', () => {
    const rows = [row({ precio: 1_500_000 }), row({ precio: 2_500_000 }), row({ precio: null })];
    // formatCurrency compact: $4M
    expect(String(deriveKpis(rows)[1]?.value)).toContain('4');
  });

  it('pipeline shows "—" when there are no rows (KPI5 — distinguir "sin datos" vs "$0")', () => {
    expect(deriveKpis([])[1]?.value).toBe('—');
  });

  it('% Escrituradas = ventas con numero_escritura / total', () => {
    const rows = [
      row({ numero_escritura: 'ESC-1' }),
      row({ numero_escritura: 'ESC-2' }),
      row({ numero_escritura: null }),
      row({ numero_escritura: null }),
    ];
    // 2/4 = 50.0%
    expect(String(deriveKpis(rows)[2]?.value)).toContain('50');
  });

  it('% Escrituradas devuelve "—" cuando no hay rows', () => {
    expect(deriveKpis([])[2]?.value).toBe('—');
  });

  it('avance promedio = mean(fase_posicion) / max(fase_posicion en el dataset)', () => {
    // posiciones 5, 10, 15 → mean 10 → 10/15 = 66.7%
    const rows = [
      row({ fase_posicion: 5 }),
      row({ fase_posicion: 10 }),
      row({ fase_posicion: 15 }),
    ];
    const value = String(deriveKpis(rows)[3]?.value);
    expect(value).toContain('66'); // 66.7%
  });

  it('avance promedio devuelve "—" cuando no hay rows con fase_posicion', () => {
    expect(deriveKpis([row({ fase_posicion: null })])[3]?.value).toBe('—');
  });

  it('top vendedor por $ pipeline, no por count', () => {
    // Pedro: 2 ventas de $100 ($200 total); María: 1 venta de $1M ($1M total)
    // María gana aunque tenga menos ventas.
    const rows = [
      row({ vendedor: 'Pedro', precio: 100 }),
      row({ vendedor: 'Pedro', precio: 100 }),
      row({ vendedor: 'María', precio: 1_000_000 }),
    ];
    expect(deriveKpis(rows)[4]?.value).toBe('María');
  });

  it('top vendedor ignora ventas sin vendedor o sin precio', () => {
    const rows = [
      row({ vendedor: null, precio: 999_999_999 }),
      row({ vendedor: 'María', precio: null }),
      row({ vendedor: 'Pedro', precio: 100 }),
    ];
    expect(deriveKpis(rows)[4]?.value).toBe('Pedro');
  });

  it('top vendedor devuelve "—" cuando no hay vendedores válidos', () => {
    expect(deriveKpis([row({ vendedor: null, precio: 100 })])[4]?.value).toBe('—');
  });

  it('reactivity: filtros vacíos vs filtros aplicados producen KPIs distintos (KPI3)', () => {
    const todos = [
      row({ precio: 1_000_000, proyectoNombre: 'Lomas' }),
      row({ precio: 2_000_000, proyectoNombre: 'Bosques' }),
    ];
    const soloLomas = todos.filter((r) => r.proyectoNombre === 'Lomas');
    expect(deriveKpis(todos)[0]?.value).toBe(2);
    expect(deriveKpis(soloLomas)[0]?.value).toBe(1);
    // Pipeline también cambia
    expect(String(deriveKpis(todos)[1]?.value)).toContain('3');
    expect(String(deriveKpis(soloLomas)[1]?.value)).toContain('1');
  });
});

describe('matchVentaSearch (búsqueda por comprador o unidad)', () => {
  const venta = row({
    cliente: 'Cristian Eugenio Nieto Marquez',
    unidadIdentificador: 'M22-L5-LDLE',
  });

  it('query vacío o solo espacios matchea todo', () => {
    expect(matchVentaSearch(venta, '')).toBe(true);
    expect(matchVentaSearch(venta, '   ')).toBe(true);
  });

  it('matchea por nombre del comprador (case-insensitive)', () => {
    expect(matchVentaSearch(venta, 'nieto')).toBe(true);
    expect(matchVentaSearch(venta, 'CRISTIAN')).toBe(true);
  });

  it('matchea por identificador de unidad (case-insensitive, parcial)', () => {
    expect(matchVentaSearch(venta, 'm22-l5')).toBe(true);
    expect(matchVentaSearch(venta, 'M22-L5-LDLE')).toBe(true);
    expect(matchVentaSearch(venta, 'ldle')).toBe(true);
  });

  it('sin match en comprador ni unidad → false', () => {
    expect(matchVentaSearch(venta, 'm23-l9')).toBe(false);
    expect(matchVentaSearch(venta, 'garcia')).toBe(false);
  });

  it('venta sin unidad asignada no truena buscando por unidad', () => {
    expect(matchVentaSearch(row({ cliente: 'Ana', unidadIdentificador: null }), 'm22')).toBe(false);
  });
});
