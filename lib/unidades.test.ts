import { describe, expect, it } from 'vitest';
import {
  UNIDADES,
  UNIDAD_DEFAULT,
  unidadOptions,
  factorUniversal,
  factorRecetaAStock,
  rendimientoServir,
} from './unidades';

describe('UNIDADES', () => {
  it('no tiene values duplicados', () => {
    const values = UNIDADES.map((u) => u.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('usa values canónicos: minúsculas, sin acentos ni espacios', () => {
    for (const { value } of UNIDADES) {
      expect(value).toMatch(/^[a-z]+$/);
    }
  });

  it('incluye el default', () => {
    expect(UNIDADES.some((u) => u.value === UNIDAD_DEFAULT)).toBe(true);
  });
});

describe('unidadOptions', () => {
  it('devuelve el catálogo tal cual sin current', () => {
    expect(unidadOptions()).toEqual(UNIDADES);
    expect(unidadOptions(null)).toEqual(UNIDADES);
    expect(unidadOptions('')).toEqual(UNIDADES);
    expect(unidadOptions('  ')).toEqual(UNIDADES);
  });

  it('devuelve el catálogo tal cual si current ya es canónico', () => {
    expect(unidadOptions('pieza')).toEqual(UNIDADES);
  });

  it('agrega el valor legacy al final si no está en el catálogo', () => {
    const opts = unidadOptions('Pieza');
    expect(opts).toHaveLength(UNIDADES.length + 1);
    expect(opts.at(-1)).toEqual({ value: 'Pieza', label: 'Pieza' });
  });
});

describe('factorUniversal', () => {
  it('convierte dentro de la dimensión masa', () => {
    expect(factorUniversal('gramo', 'kilo')).toBe(0.001);
    expect(factorUniversal('kilo', 'gramo')).toBe(1000);
  });

  it('convierte dentro de la dimensión volumen', () => {
    expect(factorUniversal('litro', 'mililitro')).toBe(1000);
    expect(factorUniversal('mililitro', 'litro')).toBe(0.001);
  });

  it('misma unidad = 1', () => {
    expect(factorUniversal('mililitro', 'mililitro')).toBe(1);
  });

  it('es robusto a mayúsculas/espacios', () => {
    expect(factorUniversal(' Gramo ', 'KILO')).toBe(0.001);
  });

  it('convierte onza fluida ↔ mililitro', () => {
    expect(factorUniversal('onza', 'mililitro')).toBeCloseTo(29.5735, 4);
    expect(factorUniversal('mililitro', 'onza')).toBeCloseTo(1 / 29.5735, 10);
  });

  it('null entre onza (volumen) y gramo (masa)', () => {
    expect(factorUniversal('onza', 'gramo')).toBeNull();
  });

  it('null entre dimensiones distintas (masa vs volumen)', () => {
    expect(factorUniversal('gramo', 'litro')).toBeNull();
  });

  it('null si alguna unidad no es continua (pieza/botella)', () => {
    expect(factorUniversal('mililitro', 'pieza')).toBeNull();
    expect(factorUniversal('pieza', 'gramo')).toBeNull();
    expect(factorUniversal('botella', 'litro')).toBeNull();
  });

  it('copa = 1.5 onzas', () => {
    expect(factorUniversal('copa', 'onza')).toBeCloseTo(1.5, 6);
    expect(factorUniversal('onza', 'copa')).toBeCloseTo(1 / 1.5, 6);
  });
});

describe('rendimientoServir', () => {
  it('botella de 980 ml rinde ~33 oz y ~22 copas', () => {
    const r = rendimientoServir(980, 'mililitro');
    expect(r?.onzas).toBeCloseTo(33.14, 1);
    expect(r?.copas).toBeCloseTo(22.09, 1);
  });

  it('botella de 700 ml rinde ~24 oz y ~16 copas (redondeado)', () => {
    const r = rendimientoServir(700, 'mililitro');
    expect(Math.round(r!.onzas)).toBe(24);
    expect(Math.round(r!.copas)).toBe(16);
  });

  it('null para unidad de masa (no aplica oz/copas)', () => {
    expect(rendimientoServir(25000, 'gramo')).toBeNull();
  });

  it('null sin contenido', () => {
    expect(rendimientoServir(null, 'mililitro')).toBeNull();
    expect(rendimientoServir(0, 'mililitro')).toBeNull();
  });
});

describe('factorRecetaAStock', () => {
  const sinFraccion = { unidad: 'pieza', unidadBase: null, contenido: null };

  it('receta en la misma unidad de stock = factor 1 (vaso pieza→pieza)', () => {
    expect(factorRecetaAStock('pieza', sinFraccion)).toBe(1);
  });

  it('conversión universal cuando el stock es de la misma dimensión (kilo, receta en gramo)', () => {
    expect(factorRecetaAStock('gramo', { unidad: 'kilo', unidadBase: null, contenido: null })).toBe(
      0.001
    );
  });

  it('presentación discreta: botella de 980 ml, receta en ml → 1/980', () => {
    const bacardi = { unidad: 'pieza', unidadBase: 'mililitro', contenido: 980 };
    const f = factorRecetaAStock('mililitro', bacardi);
    expect(f).toBeCloseTo(1 / 980, 10);
    expect(20 * (f as number)).toBeCloseTo(0.020408, 5);
  });

  it('presentación: agua 2 L (2000 ml), receta en ml → 1/2000', () => {
    const agua = { unidad: 'pieza', unidadBase: 'mililitro', contenido: 2000 };
    expect(factorRecetaAStock('mililitro', agua)).toBeCloseTo(0.0005, 10);
  });

  it('receta en onza contra botella con contenido en ml (1 oz = 29.5735 ml)', () => {
    const tequila = { unidad: 'pieza', unidadBase: 'mililitro', contenido: 980 };
    const f = factorRecetaAStock('onza', tequila);
    expect(f).toBeCloseTo(29.5735 / 980, 10);
    // un trago de 1.5 oz descuenta ~0.045 botella
    expect(1.5 * (f as number)).toBeCloseTo(0.045265, 5);
  });

  it('receta en unidad distinta a unidad_base pero misma dimensión (litro vs ml base)', () => {
    // 1 presentación = 1000 ml; receta en litros → 1 litro = 1 presentación
    const garrafa = { unidad: 'pieza', unidadBase: 'mililitro', contenido: 1000 };
    expect(factorRecetaAStock('litro', garrafa)).toBe(1);
  });

  it('null sin contenido capturado (detiene el sangrado)', () => {
    expect(factorRecetaAStock('mililitro', sinFraccion)).toBeNull();
  });

  it('null si contenido es 0', () => {
    expect(
      factorRecetaAStock('mililitro', { unidad: 'pieza', unidadBase: 'mililitro', contenido: 0 })
    ).toBeNull();
  });

  it('null si la receta no es convertible a la unidad_base (gramo vs base ml)', () => {
    const liquido = { unidad: 'pieza', unidadBase: 'mililitro', contenido: 1000 };
    expect(factorRecetaAStock('gramo', liquido)).toBeNull();
  });
});
