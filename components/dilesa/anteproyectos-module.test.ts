import { describe, expect, it } from 'vitest';
import { deriveKpis } from './anteproyectos-module';
import { deriveAnalisis, gatePromocion } from './anteproyecto-detalle';
import type { ProyectoDetalle } from './proyecto-detalle';

function ap(overrides: Partial<ProyectoDetalle>): ProyectoDetalle {
  return {
    id: 'id',
    tipo: 'anteproyecto',
    nombre: 'Anteproyecto',
    estado: 'analisis',
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
    clasificacion_inmobiliaria: null,
    area_comercial_m2: null,
    area_residencial_m2: null,
    area_vialidades_m2: null,
    precio_m2_excedente: null,
    costo_mo: null,
    ...overrides,
  };
}

describe('deriveKpis (Anteproyectos DILESA — ADR-034 + D2)', () => {
  it('returns 5 KPIs en orden D2', () => {
    const kpis = deriveKpis([]);
    expect(kpis).toHaveLength(5);
    expect(kpis.map((k) => k.key)).toEqual([
      'total',
      'activos',
      'inversion',
      'lotes',
      'en_decision',
    ]);
  });

  it('total = rows.length', () => {
    expect(deriveKpis([ap({}), ap({}), ap({})])[0]?.value).toBe(3);
  });

  it('activos = count(estado IN propuesta|analisis|aprobado)', () => {
    const rows = [
      ap({ estado: 'propuesta' }),
      ap({ estado: 'analisis' }),
      ap({ estado: 'aprobado' }),
      ap({ estado: 'completado' }),
      ap({ estado: 'archivado' }),
    ];
    expect(deriveKpis(rows)[1]?.value).toBe(3);
  });

  it('inversión proyectada suma compact, ignora null', () => {
    const rows = [
      ap({ presupuesto_estimado: 8_000_000 }),
      ap({ presupuesto_estimado: 4_000_000 }),
      ap({ presupuesto_estimado: null }),
    ];
    expect(String(deriveKpis(rows)[2]?.value)).toContain('12');
  });

  it('inversión "—" cuando no hay rows', () => {
    expect(deriveKpis([])[2]?.value).toBe('—');
  });

  it('lotes proyectados suma sin decimales', () => {
    const rows = [
      ap({ lotes_proyectados: 40 }),
      ap({ lotes_proyectados: 80 }),
      ap({ lotes_proyectados: null }),
    ];
    expect(deriveKpis(rows)[3]?.value).toBe('120');
  });

  it('en decisión = count(estado="analisis")', () => {
    const rows = [
      ap({ estado: 'analisis' }),
      ap({ estado: 'analisis' }),
      ap({ estado: 'propuesta' }),
      ap({ estado: 'aprobado' }),
    ];
    expect(deriveKpis(rows)[4]?.value).toBe(2);
  });

  it('reactivity: filtrar por estado cambia activos y en decisión', () => {
    const todos = [
      ap({ estado: 'analisis', presupuesto_estimado: 6_000_000, lotes_proyectados: 30 }),
      ap({ estado: 'completado', presupuesto_estimado: 1_000_000, lotes_proyectados: 5 }),
    ];
    const soloAnalisis = todos.filter((r) => r.estado === 'analisis');
    const k = deriveKpis(soloAnalisis);
    expect(k[0]?.value).toBe(1);
    expect(k[1]?.value).toBe(1);
    expect(k[4]?.value).toBe(1);
  });
});

describe('deriveAnalisis (financiero derivado client-side)', () => {
  it('costo total suma las 4 partidas', () => {
    const a = deriveAnalisis(
      ap({
        costo_terreno: 2_000_000,
        costo_urbanizacion: 3_000_000,
        costo_construccion: 5_000_000,
        costo_comercializacion: 1_000_000,
      })
    );
    expect(a.costoTotal).toBe(11_000_000);
  });

  it('costo total es null cuando todas las partidas son null', () => {
    expect(deriveAnalisis(ap({})).costoTotal).toBeNull();
  });

  it('costo total trata null como 0 cuando al menos una partida está poblada', () => {
    const a = deriveAnalisis(
      ap({
        costo_terreno: 2_000_000,
        costo_urbanizacion: null,
        costo_construccion: null,
        costo_comercializacion: null,
      })
    );
    expect(a.costoTotal).toBe(2_000_000);
  });

  it('aprovechamiento = area_vendible / area_total', () => {
    const a = deriveAnalisis(ap({ area_m2: 10_000, area_vendible_m2: 7_500 }));
    expect(a.aprovechamiento).toBeCloseTo(0.75);
  });

  it('% áreas verdes = areas_verdes / area_total', () => {
    const a = deriveAnalisis(ap({ area_m2: 10_000, areas_verdes_m2: 1_500 }));
    expect(a.pctVerdes).toBeCloseTo(0.15);
  });

  it('costo por lote = costoTotal / lotes_proyectados', () => {
    const a = deriveAnalisis(
      ap({
        costo_terreno: 5_000_000,
        costo_urbanizacion: 5_000_000,
        costo_construccion: null,
        costo_comercializacion: null,
        lotes_proyectados: 50,
      })
    );
    expect(a.costoPorLote).toBe(200_000);
  });

  it('costo por m² vendible = costoTotal / area_vendible_m2', () => {
    const a = deriveAnalisis(
      ap({
        costo_terreno: 4_000_000,
        costo_urbanizacion: null,
        costo_construccion: null,
        costo_comercializacion: null,
        area_vendible_m2: 8_000,
      })
    );
    expect(a.costoPorM2Vendible).toBe(500);
  });

  it('delta presupuesto positivo = holgura, negativo = sobre-asignación', () => {
    const conHolgura = deriveAnalisis(
      ap({
        presupuesto_estimado: 12_000_000,
        costo_terreno: 10_000_000,
        costo_urbanizacion: null,
        costo_construccion: null,
        costo_comercializacion: null,
      })
    );
    expect(conHolgura.deltaPresupuesto).toBe(2_000_000);

    const sobreAsignado = deriveAnalisis(
      ap({
        presupuesto_estimado: 10_000_000,
        costo_terreno: 8_000_000,
        costo_urbanizacion: 5_000_000,
        costo_construccion: null,
        costo_comercializacion: null,
      })
    );
    expect(sobreAsignado.deltaPresupuesto).toBe(-3_000_000);
  });

  it('todos los derivados son null cuando faltan los insumos', () => {
    const a = deriveAnalisis(ap({}));
    expect(a.aprovechamiento).toBeNull();
    expect(a.pctVerdes).toBeNull();
    expect(a.costoPorLote).toBeNull();
    expect(a.costoPorM2Vendible).toBeNull();
    expect(a.deltaPresupuesto).toBeNull();
  });
});

describe('gatePromocion (Sprint 4A — autorización integrada)', () => {
  const T = (estado: string, obligatoriedad_snapshot: string | null = 'obligatoria') => ({
    estado,
    obligatoriedad_snapshot,
  });

  it('autorizado con todas las obligatorias completadas → puede', () => {
    const r = gatePromocion([T('completada'), T('completada')], {
      puedeAutorizar: true,
      yaConvertido: false,
    });
    expect(r.puede).toBe(true);
    expect(r.razon).toMatch(/listo/i);
  });

  it('autorizado con obligatoria pendiente → no puede', () => {
    const r = gatePromocion([T('completada'), T('en_curso')], {
      puedeAutorizar: true,
      yaConvertido: false,
    });
    expect(r.puede).toBe(false);
    expect(r.razon).toMatch(/faltan 1/i);
  });

  it('no-autorizado nunca puede (aunque todo esté completado)', () => {
    const r = gatePromocion([T('completada')], { puedeAutorizar: false, yaConvertido: false });
    expect(r.puede).toBe(false);
    expect(r.razon).toMatch(/dirección/i);
  });

  it('ya convertido → no puede aunque esté autorizado', () => {
    const r = gatePromocion([T('completada')], { puedeAutorizar: true, yaConvertido: true });
    expect(r.puede).toBe(false);
    expect(r.razon).toMatch(/ya fue convertido/i);
  });

  it('tareas opcionales pendientes no bloquean', () => {
    const r = gatePromocion(
      [T('completada', 'obligatoria'), T('pendiente', 'opcional'), T('pendiente', 'informativa')],
      { puedeAutorizar: true, yaConvertido: false }
    );
    expect(r.puede).toBe(true);
  });

  it('lista vacía con autorización → puede (caso anteproyecto sin plantilla aún)', () => {
    const r = gatePromocion([], { puedeAutorizar: true, yaConvertido: false });
    expect(r.puede).toBe(true);
  });
});
