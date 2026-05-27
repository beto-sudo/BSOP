import { describe, expect, it } from 'vitest';
import { deriveKpis, type ProyectoListRow } from './proyectos-module';

function p(overrides: Partial<ProyectoListRow>): ProyectoListRow {
  return {
    id: 'id',
    tipo: 'desarrollo',
    nombre: 'Proyecto',
    estado: 'propuesta',
    clave_interna: null,
    proyecto_padre_id: null,
    proyecto_predecesor_id: null,
    fecha_inicio: null,
    fecha_fin_estimada: null,
    fecha_licencia: null,
    area_m2: null,
    area_vendible_m2: null,
    areas_verdes_m2: null,
    lotes_proyectados: null,
    presupuesto_estimado: null,
    costo_terreno: null,
    costo_urbanizacion: null,
    costo_construccion: null,
    costo_comercializacion: null,
    notas: null,
    plano_oficial_url: null,
    image_url: null,
    acreditacion_escritura: null,
    objetivo_trimestral: null,
    avances: null,
    ...overrides,
  };
}

describe('deriveKpis (Proyectos DILESA — ADR-034)', () => {
  it('returns 5 KPIs in pivote D13 order', () => {
    const kpis = deriveKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual(['total', 'ejecutando', 'presupuesto', 'lotes', 'area']);
  });

  it('total = rows.length', () => {
    expect(deriveKpis([p({}), p({}), p({})])[0]?.value).toBe(3);
  });

  it('en ejecución = count(estado="ejecutando")', () => {
    const rows = [
      p({ estado: 'ejecutando' }),
      p({ estado: 'propuesta' }),
      p({ estado: 'ejecutando' }),
      p({ estado: 'completado' }),
    ];
    expect(deriveKpis(rows)[1]?.value).toBe(2);
  });

  it('presupuesto suma compact, ignora null', () => {
    const rows = [
      p({ presupuesto_estimado: 5_000_000 }),
      p({ presupuesto_estimado: 10_000_000 }),
      p({ presupuesto_estimado: null }),
    ];
    expect(String(deriveKpis(rows)[2]?.value)).toContain('15');
  });

  it('presupuesto "—" cuando no hay rows', () => {
    expect(deriveKpis([])[2]?.value).toBe('—');
  });

  it('lotes proyectados suma sin decimales', () => {
    const rows = [
      p({ lotes_proyectados: 50 }),
      p({ lotes_proyectados: 100 }),
      p({ lotes_proyectados: null }),
    ];
    expect(deriveKpis(rows)[3]?.value).toBe('150');
  });

  it('área vendible: < 10K m² → "X m²"', () => {
    const rows = [p({ area_vendible_m2: 5_000 }), p({ area_vendible_m2: 3_000 })];
    // 8,000 m² → "8,000 m²"
    expect(String(deriveKpis(rows)[4]?.value)).toMatch(/m²/);
    expect(String(deriveKpis(rows)[4]?.value)).toContain('8');
  });

  it('área vendible: >= 10K m² → "X.Y ha"', () => {
    const rows = [p({ area_vendible_m2: 25_000 }), p({ area_vendible_m2: 30_000 })];
    // 55,000 m² → 5.5 ha
    expect(String(deriveKpis(rows)[4]?.value)).toContain('ha');
    expect(String(deriveKpis(rows)[4]?.value)).toContain('5.5');
  });

  it('área "—" cuando no hay rows', () => {
    expect(deriveKpis([])[4]?.value).toBe('—');
  });

  it('reactivity: filtrar por tipo cambia todos los KPIs', () => {
    const todos = [
      p({
        tipo: 'desarrollo',
        estado: 'ejecutando',
        presupuesto_estimado: 10_000_000,
        lotes_proyectados: 50,
        area_vendible_m2: 20_000,
      }),
      p({
        tipo: 'remodelacion',
        estado: 'propuesta',
        presupuesto_estimado: 2_000_000,
        lotes_proyectados: 0,
        area_vendible_m2: 1_000,
      }),
    ];
    const soloDesarrollo = todos.filter((r) => r.tipo === 'desarrollo');
    const k = deriveKpis(soloDesarrollo);
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe(1);
    expect(String(k[2]?.value)).toContain('10');
    expect(k[3]?.value).toBe('50');
    expect(String(k[4]?.value)).toContain('2'); // 2 ha
  });
});
