import { describe, expect, it } from 'vitest';
import {
  bandaDiasFase,
  colorDiasFase,
  diasEnFase,
  UMBRAL_DIAS_FASE_AMBAR,
  UMBRAL_DIAS_FASE_ROJO,
} from './dias-en-fase';

describe('diasEnFase', () => {
  const hoy = new Date('2026-06-28T15:00:00Z');

  it('cuenta los días desde la fecha de entrada hasta hoy (UTC)', () => {
    expect(diasEnFase('2026-06-28', hoy)).toBe(0);
    expect(diasEnFase('2026-06-18', hoy)).toBe(10);
    expect(diasEnFase('2026-05-29', hoy)).toBe(30);
  });

  it('ignora la parte de hora de un timestamp y usa solo la fecha', () => {
    expect(diasEnFase('2026-06-18T09:30:00+00:00', hoy)).toBe(10);
  });

  it('clampa negativos a 0 (fechas inconsistentes de migración)', () => {
    expect(diasEnFase('2026-07-10', hoy)).toBe(0);
  });

  it('devuelve null sin fecha o con fecha inválida', () => {
    expect(diasEnFase(null, hoy)).toBeNull();
    expect(diasEnFase(undefined, hoy)).toBeNull();
    expect(diasEnFase('no-es-fecha', hoy)).toBeNull();
  });
});

describe('bandaDiasFase', () => {
  it('clasifica por umbral', () => {
    expect(bandaDiasFase(0)).toBe('normal');
    expect(bandaDiasFase(UMBRAL_DIAS_FASE_AMBAR - 1)).toBe('normal');
    expect(bandaDiasFase(UMBRAL_DIAS_FASE_AMBAR)).toBe('ambar');
    expect(bandaDiasFase(UMBRAL_DIAS_FASE_ROJO - 1)).toBe('ambar');
    expect(bandaDiasFase(UMBRAL_DIAS_FASE_ROJO)).toBe('rojo');
    expect(bandaDiasFase(500)).toBe('rojo');
  });

  it('null cuando no hay dato', () => {
    expect(bandaDiasFase(null)).toBeNull();
    expect(bandaDiasFase(undefined)).toBeNull();
  });
});

describe('colorDiasFase', () => {
  it('atenúa lo normal y resalta ámbar/rojo', () => {
    expect(colorDiasFase(3)).toContain('var(--text)');
    expect(colorDiasFase(20)).toBe('text-amber-500');
    expect(colorDiasFase(40)).toBe('text-red-500');
  });
});
