import { describe, expect, it } from 'vitest';
import {
  deriveAnalisisFinanciero,
  fmtM2,
  fmtMoney,
  fmtMoneyCents,
  fmtNumber,
  fmtPct,
  normalizarPrototiposReferencia,
  parseMoneyInput,
  validarCampoAnalisis,
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

describe('validarCampoAnalisis (Sprint 4B server action whitelist)', () => {
  it('campo numeric con valor válido → ok', () => {
    expect(validarCampoAnalisis('costo_urbanizacion', 1_000_000)).toEqual({ ok: true });
  });

  it('campo int con valor entero → ok', () => {
    expect(validarCampoAnalisis('lotes_proyectados', 42)).toEqual({ ok: true });
  });

  it('valor=null siempre es ok (limpia el campo)', () => {
    expect(validarCampoAnalisis('costo_urbanizacion', null)).toEqual({ ok: true });
    expect(validarCampoAnalisis('lotes_proyectados', null)).toEqual({ ok: true });
  });

  it('rechaza campo fuera de whitelist', () => {
    const r = validarCampoAnalisis('rol_secreto', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Campo inválido/);
  });

  it('rechaza valor negativo', () => {
    const r = validarCampoAnalisis('costo_urbanizacion', -50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/≥ 0/);
  });

  it('rechaza NaN / Infinity', () => {
    const nan = validarCampoAnalisis('costo_urbanizacion', NaN);
    expect(nan.ok).toBe(false);
    const inf = validarCampoAnalisis('costo_urbanizacion', Infinity);
    expect(inf.ok).toBe(false);
  });

  it('campo int rechaza decimales', () => {
    const r = validarCampoAnalisis('lotes_proyectados', 42.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/entero/);
  });

  it('campo numeric acepta decimales', () => {
    expect(validarCampoAnalisis('costo_urbanizacion', 1234.56)).toEqual({ ok: true });
  });
});

describe('normalizarPrototiposReferencia (Sprint 4B chips)', () => {
  it('trim + filtra vacíos', () => {
    expect(normalizarPrototiposReferencia(['  Casa A  ', '', '   ', 'Casa B'])).toEqual([
      'Casa A',
      'Casa B',
    ]);
  });

  it('dedup case-sensitive', () => {
    expect(normalizarPrototiposReferencia(['Casa A', 'Casa A', 'Casa a'])).toEqual([
      'Casa A',
      'Casa a',
    ]);
  });

  it('limita a 16 elementos', () => {
    const muchos = Array.from({ length: 25 }, (_, i) => `Proto ${i}`);
    const norm = normalizarPrototiposReferencia(muchos);
    expect(norm).toHaveLength(16);
    expect(norm[0]).toBe('Proto 0');
    expect(norm[15]).toBe('Proto 15');
  });

  it('descarta nombres > 80 chars', () => {
    const corto = 'Proto X';
    const largo = 'X'.repeat(81);
    expect(normalizarPrototiposReferencia([corto, largo])).toEqual([corto]);
  });

  it('acepta nombre de exactamente 80 chars', () => {
    const exacto = 'X'.repeat(80);
    expect(normalizarPrototiposReferencia([exacto])).toEqual([exacto]);
  });

  it('array vacío → array vacío', () => {
    expect(normalizarPrototiposReferencia([])).toEqual([]);
  });

  it('preserva orden de inserción', () => {
    expect(normalizarPrototiposReferencia(['Z', 'A', 'M'])).toEqual(['Z', 'A', 'M']);
  });

  it('limita exactamente a 16 cuando hay duplicados que se eliminan', () => {
    // 18 elementos pero 2 son duplicados → 16 únicos
    const items = ['Casa A', 'Casa B', ...Array.from({ length: 16 }, (_, i) => `Proto ${i}`)];
    const norm = normalizarPrototiposReferencia(items);
    expect(norm).toHaveLength(16);
    expect(norm.includes('Casa A')).toBe(true);
    expect(norm.includes('Casa B')).toBe(true);
  });
});

describe('Formatters (compartidos entre componente + PDF)', () => {
  it('fmtMoney: null → em-dash; número → MXN sin decimales', () => {
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined)).toBe('—');
    expect(fmtMoney(1234)).toContain('1,234');
    expect(fmtMoney(0)).toContain('0');
  });

  it('fmtMoneyCents: dos decimales', () => {
    expect(fmtMoneyCents(null)).toBe('—');
    expect(fmtMoneyCents(123.45)).toContain('.45');
  });

  it('fmtPct: porcentaje con 1 decimal max', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(0.65)).toContain('65');
    expect(fmtPct(0)).toContain('0');
  });

  it('fmtNumber: locale es-MX, sin moneda', () => {
    expect(fmtNumber(null)).toBe('—');
    expect(fmtNumber(50000)).toBe('50,000');
  });

  it('fmtM2: número + sufijo m²', () => {
    expect(fmtM2(null)).toBe('—');
    expect(fmtM2(1234)).toBe('1,234 m²');
  });
});

describe('parseMoneyInput (input crudo del cell editable)', () => {
  it('string vacío → null', () => {
    expect(parseMoneyInput('')).toBeNull();
  });

  it('solo guión → null', () => {
    expect(parseMoneyInput('-')).toBeNull();
  });

  it('número simple', () => {
    expect(parseMoneyInput('12345')).toBe(12345);
  });

  it('strip currency symbols', () => {
    expect(parseMoneyInput('$1,234.56')).toBe(1234.56);
  });

  it('strip espacios', () => {
    expect(parseMoneyInput('  1 234 ')).toBe(1234);
  });

  it('strip letras / símbolos no numéricos', () => {
    expect(parseMoneyInput('MXN 5000')).toBe(5000);
  });

  it('basura no parseable → null', () => {
    expect(parseMoneyInput('abc')).toBeNull();
  });

  it('decimales', () => {
    expect(parseMoneyInput('1234.56')).toBe(1234.56);
  });

  it('cero', () => {
    expect(parseMoneyInput('0')).toBe(0);
  });
});

describe('validarCampoAnalisis — coverage de ramas adicionales', () => {
  it('cada campo de ANALISIS_FILAS_COSTOS es legal', () => {
    const FILAS_COSTOS_FIELDS = [
      'valor_comercial_referencia',
      'valor_comercial_proyecto',
      'costo_urbanizacion_referencia',
      'costo_urbanizacion',
      'costo_materiales_referencia',
      'costo_materiales_proyecto',
      'costo_mo_referencia',
      'costo_mo',
      'registro_ruv_referencia',
      'registro_ruv_proyecto',
      'seguro_calidad_referencia',
      'seguro_calidad_proyecto',
      'costo_comercializacion_referencia',
      'costo_comercializacion',
    ];
    for (const campo of FILAS_COSTOS_FIELDS) {
      expect(validarCampoAnalisis(campo, 100)).toEqual({ ok: true });
    }
  });

  it('campos derivados de ficha física pasan', () => {
    expect(validarCampoAnalisis('area_m2', 50_000)).toEqual({ ok: true });
    expect(validarCampoAnalisis('area_vendible_m2', 30_000)).toEqual({ ok: true });
    expect(validarCampoAnalisis('areas_verdes_m2', 5_000)).toEqual({ ok: true });
    expect(validarCampoAnalisis('area_vialidades_m2', 10_000)).toEqual({ ok: true });
    expect(validarCampoAnalisis('tamano_lote_promedio', 250)).toEqual({ ok: true });
  });
});
