import { describe, expect, it } from 'vitest';
import { UNIDADES, UNIDAD_DEFAULT, unidadOptions } from './unidades';

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
