/**
 * Cálculo de costo estimado (iniciativa registro-ia, Sprint 2).
 */

import { describe, expect, it } from 'vitest';
import { estimarCostoUsd, PRICING } from './pricing';
import { AI_USOS, AI_USO_IDS } from './registry';

describe('registro-ia · pricing', () => {
  it('opus 4.8: 1M in + 1M out = 5 + 25 = 30 USD', () => {
    expect(estimarCostoUsd('claude-opus-4-8', 1_000_000, 1_000_000)).toBeCloseTo(30, 6);
  });

  it('embedding: solo input, sin output', () => {
    expect(estimarCostoUsd('text-embedding-3-large', 1_000_000, 0)).toBeCloseTo(0.13, 6);
    // Aunque pasen "output", el precio de output es 0.
    expect(estimarCostoUsd('text-embedding-3-large', 1_000_000, 5_000)).toBeCloseTo(0.13, 6);
  });

  it('modelo desconocido → 0 (los tokens igual se loggean)', () => {
    expect(estimarCostoUsd('modelo-que-no-existe', 1_000_000, 1_000_000)).toBe(0);
  });

  it('escala lineal con los tokens', () => {
    const uno = estimarCostoUsd('claude-opus-4-8', 1000, 1000);
    const diez = estimarCostoUsd('claude-opus-4-8', 10_000, 10_000);
    expect(diez).toBeCloseTo(uno * 10, 9);
  });

  it('todos los modelos default del registry tienen pricing', () => {
    for (const id of AI_USO_IDS) {
      const modelo = AI_USOS[id].modeloDefault;
      expect(PRICING[modelo], `falta pricing para ${modelo} (uso ${id})`).toBeDefined();
    }
  });
});
