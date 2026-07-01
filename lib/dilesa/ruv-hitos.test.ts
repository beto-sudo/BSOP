import { describe, expect, it } from 'vitest';
import { HITO_RUV_OPTIONS, matchHitosRuv } from './ruv-hitos';

describe('matchHitosRuv (filtro multi-select de hitos RUV, semántica AND)', () => {
  it('selección vacía matchea todo', () => {
    expect(matchHitosRuv(null, null, [])).toBe(true);
    expect(matchHitosRuv('2026-05-10', '2026-06-01', [])).toBe(true);
  });

  it('con_dtu exige fecha_dtu; sin_dtu exige su ausencia', () => {
    expect(matchHitosRuv('2026-05-10', null, ['con_dtu'])).toBe(true);
    expect(matchHitosRuv(null, null, ['con_dtu'])).toBe(false);
    expect(matchHitosRuv(null, null, ['sin_dtu'])).toBe(true);
    expect(matchHitosRuv('2026-05-10', null, ['sin_dtu'])).toBe(false);
  });

  it('con_extraccion / sin_extraccion análogos', () => {
    expect(matchHitosRuv(null, '2026-06-01', ['con_extraccion'])).toBe(true);
    expect(matchHitosRuv(null, null, ['con_extraccion'])).toBe(false);
    expect(matchHitosRuv(null, null, ['sin_extraccion'])).toBe(true);
    expect(matchHitosRuv(null, '2026-06-01', ['sin_extraccion'])).toBe(false);
  });

  it('AND: todas las condiciones deben cumplirse a la vez', () => {
    // Con DTU pero sin extracción (el corte "falta destrabar extracción")
    expect(matchHitosRuv('2026-05-10', null, ['con_dtu', 'sin_extraccion'])).toBe(true);
    expect(matchHitosRuv('2026-05-10', '2026-06-01', ['con_dtu', 'sin_extraccion'])).toBe(false);
  });

  it('ids desconocidos se ignoran (mezclables con otras características)', () => {
    expect(matchHitosRuv(null, null, ['esquina', 'frente_verde'])).toBe(true);
  });

  it('el catálogo de opciones expone los 4 cortes', () => {
    expect(HITO_RUV_OPTIONS.map((o) => o.id)).toEqual([
      'con_dtu',
      'sin_dtu',
      'con_extraccion',
      'sin_extraccion',
    ]);
  });
});
