import { describe, expect, it } from 'vitest';
import {
  deriveAnalisisFinanciero,
  type AnalisisFinancieroSnapshot,
} from './analisis-financiero-types';

function snap(overrides: Partial<AnalisisFinancieroSnapshot>): AnalisisFinancieroSnapshot {
  return {
    id: 'ap-1',
    area_m2: null,
    area_vendible_m2: null,
    areas_verdes_m2: null,
    area_vialidades_m2: null,
    lotes_proyectados: null,
    tamano_lote_promedio: null,
    clasificacion_inmobiliaria: null,
    costo_terreno: null,
    valor_predio: null,
    infraestructura_cabecera_necesaria: false,
    prototipos_referencia: [],
    presupuesto_estimado: null,
    valor_comercial_referencia: null,
    costo_urbanizacion_referencia: null,
    costo_materiales_referencia: null,
    costo_mo_referencia: null,
    registro_ruv_referencia: null,
    seguro_calidad_referencia: null,
    costo_comercializacion_referencia: null,
    valor_comercial_proyecto: null,
    costo_urbanizacion: null,
    costo_materiales_proyecto: null,
    costo_mo: null,
    registro_ruv_proyecto: null,
    seguro_calidad_proyecto: null,
    costo_comercializacion: null,
    ...overrides,
  };
}

describe('deriveAnalisisFinanciero (Sprint 4B)', () => {
  it('all-null snapshot → all-null derivados', () => {
    const d = deriveAnalisisFinanciero(snap({}));
    expect(d.aprovechamiento).toBeNull();
    expect(d.pctVerdes).toBeNull();
    expect(d.precioM2Aprovechable).toBeNull();
    expect(d.costoTotalReferencia).toBeNull();
    expect(d.costoTotalProyecto).toBeNull();
    expect(d.delta).toBeNull();
    expect(d.utilidadProyecto).toBeNull();
    expect(d.margenUtilidad).toBeNull();
  });

  it('aprovechamiento = vendible / total', () => {
    const d = deriveAnalisisFinanciero(snap({ area_m2: 100_000, area_vendible_m2: 65_000 }));
    expect(d.aprovechamiento).toBeCloseTo(0.65);
  });

  it('% verdes = verdes / total', () => {
    const d = deriveAnalisisFinanciero(snap({ area_m2: 100_000, areas_verdes_m2: 10_000 }));
    expect(d.pctVerdes).toBeCloseTo(0.1);
  });

  it('precio m² aprovechable usa valor_predio si está, si no costo_terreno', () => {
    const conPredio = deriveAnalisisFinanciero(
      snap({ valor_predio: 13_000_000, costo_terreno: 10_000_000, area_vendible_m2: 50_000 })
    );
    expect(conPredio.precioM2Aprovechable).toBe(260);

    const soloTerreno = deriveAnalisisFinanciero(
      snap({ costo_terreno: 10_000_000, area_vendible_m2: 50_000 })
    );
    expect(soloTerreno.precioM2Aprovechable).toBe(200);
  });

  it('costoTotalReferencia suma los 6 conceptos de referencia', () => {
    const d = deriveAnalisisFinanciero(
      snap({
        costo_urbanizacion_referencia: 100,
        costo_materiales_referencia: 200,
        costo_mo_referencia: 300,
        registro_ruv_referencia: 50,
        seguro_calidad_referencia: 75,
        costo_comercializacion_referencia: 125,
      })
    );
    expect(d.costoTotalReferencia).toBe(850);
  });

  it('costoTotalProyecto suma los 6 conceptos del proyecto', () => {
    const d = deriveAnalisisFinanciero(
      snap({
        costo_urbanizacion: 110,
        costo_materiales_proyecto: 210,
        costo_mo: 320,
        registro_ruv_proyecto: 55,
        seguro_calidad_proyecto: 80,
        costo_comercializacion: 135,
      })
    );
    expect(d.costoTotalProyecto).toBe(910);
  });

  it('delta = total proyecto - total referencia (positivo = sobrecosto)', () => {
    const d = deriveAnalisisFinanciero(
      snap({
        costo_urbanizacion_referencia: 100,
        costo_urbanizacion: 130,
      })
    );
    expect(d.costoTotalReferencia).toBe(100);
    expect(d.costoTotalProyecto).toBe(130);
    expect(d.delta).toBe(30);
  });

  it('utilidad proyecto = valor_comercial_proyecto - (costo total proyecto + terreno)', () => {
    const d = deriveAnalisisFinanciero(
      snap({
        valor_comercial_proyecto: 50_000_000,
        costo_urbanizacion: 10_000_000,
        costo_mo: 5_000_000,
        valor_predio: 15_000_000,
      })
    );
    // total proyecto = 15M, inversion = 30M, utilidad = 20M
    expect(d.costoTotalProyecto).toBe(15_000_000);
    expect(d.utilidadProyecto).toBe(20_000_000);
    expect(d.margenUtilidad).toBeCloseTo(0.4);
  });

  it('utilidad null cuando falta valor comercial proyecto', () => {
    const d = deriveAnalisisFinanciero(
      snap({
        costo_urbanizacion: 10_000_000,
        valor_predio: 15_000_000,
      })
    );
    expect(d.utilidadProyecto).toBeNull();
    expect(d.margenUtilidad).toBeNull();
  });

  it('costos parciales: si solo 1 concepto tiene valor, el total es ese valor', () => {
    const d = deriveAnalisisFinanciero(snap({ costo_urbanizacion: 500 }));
    expect(d.costoTotalProyecto).toBe(500);
  });
});
