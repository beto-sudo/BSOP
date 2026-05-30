import { describe, it, expect } from 'vitest';
import { PlanoAiAnalisisSchema, normalizarAnalisis } from './schema';

const minimal = {
  area_total_m2: 0,
  area_vendible_m2: 0,
  areas_verdes_m2: 0,
  area_vialidades_m2: 0,
  lotes_proyectados: 0,
  tamano_lote_promedio_m2: 0,
  tipologia_principal: '',
  observaciones: '',
  recomendaciones: [],
  confianza: 'media' as const,
};

describe('PlanoAiAnalisisSchema (Sprint 4E)', () => {
  it('acepta payload mínimo con todos los 0/empty', () => {
    const r = PlanoAiAnalisisSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it('rechaza confianza fuera del enum', () => {
    const r = PlanoAiAnalisisSchema.safeParse({ ...minimal, confianza: 'super-alta' });
    expect(r.success).toBe(false);
  });

  it('aplica defaults cuando faltan campos', () => {
    const r = PlanoAiAnalisisSchema.safeParse({ confianza: 'alta' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.area_total_m2).toBe(0);
      expect(r.data.tipologia_principal).toBe('');
      expect(r.data.recomendaciones).toEqual([]);
    }
  });
});

describe('normalizarAnalisis (0 → null, "" → null)', () => {
  it('todo 0 / "" → todos null', () => {
    const out = normalizarAnalisis(minimal);
    expect(out.area_total_m2).toBeNull();
    expect(out.area_vendible_m2).toBeNull();
    expect(out.areas_verdes_m2).toBeNull();
    expect(out.area_vialidades_m2).toBeNull();
    expect(out.lotes_proyectados).toBeNull();
    expect(out.tamano_lote_promedio_m2).toBeNull();
    expect(out.tipologia_principal).toBeNull();
    expect(out.observaciones).toBeNull();
    expect(out.recomendaciones).toEqual([]);
    expect(out.confianza).toBe('media');
  });

  it('valores > 0 se preservan', () => {
    const out = normalizarAnalisis({
      ...minimal,
      area_total_m2: 50_000,
      lotes_proyectados: 163,
      confianza: 'alta',
    });
    expect(out.area_total_m2).toBe(50_000);
    expect(out.lotes_proyectados).toBe(163);
    expect(out.confianza).toBe('alta');
  });

  it('strings con whitespace solo se vuelven null', () => {
    const out = normalizarAnalisis({
      ...minimal,
      tipologia_principal: '   ',
      observaciones: '\t\n  ',
    });
    expect(out.tipologia_principal).toBeNull();
    expect(out.observaciones).toBeNull();
  });

  it('recomendaciones filtra vacíos y limita a 6', () => {
    const out = normalizarAnalisis({
      ...minimal,
      recomendaciones: ['', '  ', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'],
    });
    expect(out.recomendaciones).toHaveLength(6);
    expect(out.recomendaciones[0]).toBe('R1');
  });

  it('preserva exactamente las 3 confianzas válidas', () => {
    expect(normalizarAnalisis({ ...minimal, confianza: 'alta' }).confianza).toBe('alta');
    expect(normalizarAnalisis({ ...minimal, confianza: 'media' }).confianza).toBe('media');
    expect(normalizarAnalisis({ ...minimal, confianza: 'baja' }).confianza).toBe('baja');
  });
});
