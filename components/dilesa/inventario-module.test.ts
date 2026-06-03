import { describe, expect, it } from 'vitest';
import { computeDiasInventario, deriveKpis, type UnidadListaRow } from './inventario-module';

function row(overrides: Partial<UnidadListaRow>): UnidadListaRow {
  return {
    id: 'id',
    identificador: 'M1-L1',
    area_m2: null,
    m2_construccion: null,
    es_esquina: null,
    tiene_frente_verde: null,
    estado: 'en_construccion',
    proyecto_id: 'p',
    producto_id: null,
    created_at: '2026-01-01',
    proyectoNombre: 'Proyecto',
    prototipo: null,
    identificadorCompleto: 'M1-L1',
    valorExcedente: null,
    valorEsquina: null,
    valorFrenteVerde: null,
    valorVentaFuturo: null,
    precio: null,
    diasInventario: 0,
    ...overrides,
  };
}

describe('deriveKpis (Inventario DILESA — ADR-034)', () => {
  it('returns 5 KPIs in the order defined by Sprint 1 pivote D9', () => {
    const kpis = deriveKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'disponibles',
      'en_construccion',
      'terminadas',
      'valor',
      'dias_inventario',
    ]);
  });

  it('disponibles = rows.length', () => {
    expect(deriveKpis([row({}), row({}), row({})])[0]?.value).toBe(3);
  });

  it('en_construccion y terminadas se cuentan por separado', () => {
    const rows = [
      row({ estado: 'en_construccion' }),
      row({ estado: 'en_construccion' }),
      row({ estado: 'terminada' }),
    ];
    expect(deriveKpis(rows)[1]?.value).toBe(2);
    expect(deriveKpis(rows)[2]?.value).toBe(1);
  });

  it('valor disponible suma precio; null se ignora', () => {
    const rows = [row({ precio: 1_500_000 }), row({ precio: 2_500_000 }), row({ precio: null })];
    expect(String(deriveKpis(rows)[3]?.value)).toContain('4');
  });

  it('valor devuelve "—" cuando no hay rows', () => {
    expect(deriveKpis([])[3]?.value).toBe('—');
  });

  it('días promedio en inventario = mean(diasInventario), redondeado', () => {
    const rows = [
      row({ diasInventario: 30 }),
      row({ diasInventario: 60 }),
      row({ diasInventario: 90 }),
    ];
    // mean = 60 → "60 días"
    expect(deriveKpis(rows)[4]?.value).toBe('60 días');
  });

  it('días promedio devuelve "—" cuando no hay rows', () => {
    expect(deriveKpis([])[4]?.value).toBe('—');
  });

  it('reactivity: filtrar por estado reduce KPIs (KPI3)', () => {
    const todos = [
      row({ estado: 'en_construccion', precio: 1_000_000, diasInventario: 30 }),
      row({ estado: 'terminada', precio: 2_000_000, diasInventario: 90 }),
    ];
    const soloTerminadas = todos.filter((r) => r.estado === 'terminada');
    // Filtrado: 1 disponible, 0 en construcción, 1 terminada
    const k = deriveKpis(soloTerminadas);
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe(0);
    expect(k[2]?.value).toBe(1);
    expect(k[4]?.value).toBe('90 días');
  });
});

describe('computeDiasInventario', () => {
  it('en_construccion siempre reporta 0 (no aplica)', () => {
    expect(computeDiasInventario('en_construccion', null)).toBe(0);
    // Aunque haya fecha_terminada, si estado es en_construccion = 0.
    expect(computeDiasInventario('en_construccion', '2020-01-01')).toBe(0);
  });

  it('terminada sin fecha_terminada reporta 0 (fallback)', () => {
    expect(computeDiasInventario('terminada', null)).toBe(0);
  });

  it('terminada con fecha_terminada de hoy reporta 0', () => {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    expect(computeDiasInventario('terminada', iso)).toBe(0);
  });

  it('terminada con fecha_terminada de hace N días reporta N', () => {
    const hoy = new Date();
    const past = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 45);
    const iso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
    expect(computeDiasInventario('terminada', iso)).toBe(45);
  });

  it('terminada con fecha futura (raro) cae a 0', () => {
    const hoy = new Date();
    const futura = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10);
    const iso = `${futura.getFullYear()}-${String(futura.getMonth() + 1).padStart(2, '0')}-${String(futura.getDate()).padStart(2, '0')}`;
    expect(computeDiasInventario('terminada', iso)).toBe(0);
  });

  it('fecha_terminada con timestamp completo solo usa los primeros 10 chars', () => {
    const hoy = new Date();
    const past = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7);
    const iso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}T15:30:00Z`;
    expect(computeDiasInventario('terminada', iso)).toBe(7);
  });

  it('fecha mal formada cae a 0 (defensivo)', () => {
    expect(computeDiasInventario('terminada', 'no-es-fecha')).toBe(0);
    expect(computeDiasInventario('terminada', '')).toBe(0);
  });
});
