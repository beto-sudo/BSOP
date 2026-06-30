import { describe, expect, it } from 'vitest';
import {
  bandaFluidez,
  colorFluidez,
  labelFluidez,
  severidadFluidez,
  toneFluidez,
  tooltipFluidez,
} from './fluidez-venta';

const bench = { mediana: 4, p90: 102 };

describe('bandaFluidez', () => {
  it('verde si ≤ mediana, ámbar entre mediana y p90, rojo si > p90', () => {
    expect(bandaFluidez(3, bench)).toBe('verde');
    expect(bandaFluidez(4, bench)).toBe('verde');
    expect(bandaFluidez(5, bench)).toBe('ambar');
    expect(bandaFluidez(102, bench)).toBe('ambar');
    expect(bandaFluidez(103, bench)).toBe('rojo');
  });

  it('maneja fases express (mediana 0): 0 verde, dentro de p90 ámbar, fuera rojo', () => {
    const b = { mediana: 0, p90: 6 };
    expect(bandaFluidez(0, b)).toBe('verde');
    expect(bandaFluidez(3, b)).toBe('ambar');
    expect(bandaFluidez(7, b)).toBe('rojo');
  });

  it('null sin días o sin benchmark', () => {
    expect(bandaFluidez(null, bench)).toBeNull();
    expect(bandaFluidez(10, null)).toBeNull();
    expect(bandaFluidez(10, { mediana: null, p90: null })).toBeNull();
  });
});

describe('severidadFluidez', () => {
  it('ordena rojo > ámbar > verde > null', () => {
    expect(severidadFluidez('rojo')).toBeGreaterThan(severidadFluidez('ambar'));
    expect(severidadFluidez('ambar')).toBeGreaterThan(severidadFluidez('verde'));
    expect(severidadFluidez('verde')).toBeGreaterThan(severidadFluidez(null));
  });
});

describe('labels y tonos', () => {
  it('mapea etiqueta y tono', () => {
    expect(labelFluidez('verde')).toBe('Al día');
    expect(labelFluidez('ambar')).toBe('Lenta');
    expect(labelFluidez('rojo')).toBe('Crítica');
    expect(toneFluidez('rojo')).toBe('danger');
    expect(colorFluidez('ambar')).toContain('amber');
  });
});

describe('tooltipFluidez', () => {
  it('incluye lo típico cuando hay benchmark', () => {
    expect(tooltipFluidez(18, 'Formalizada', bench)).toBe(
      '18 días en Formalizada · típico: mediana 4 d, p90 102 d'
    );
  });
  it('solo los días si no hay benchmark', () => {
    expect(tooltipFluidez(1, 'Inscrita', null)).toBe('1 día en Inscrita');
  });
});
