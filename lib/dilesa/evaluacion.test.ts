import { describe, expect, it } from 'vitest';
import { diasSinRevision, promedioPrecioM2 } from './evaluacion';

describe('diasSinRevision', () => {
  it('cuenta desde la última revisión cuando existe', () => {
    expect(diasSinRevision('2026-07-02', '2026-06-02', '2026-01-01')).toBe(30);
  });

  it('cae al created_at (con timestamp) si nunca se revisó', () => {
    expect(diasSinRevision('2026-07-02', null, '2026-07-01T18:30:00Z')).toBe(1);
  });

  it('devuelve null sin ninguna fecha base y nunca negativo', () => {
    expect(diasSinRevision('2026-07-02', null, null)).toBeNull();
    expect(diasSinRevision('2026-07-02', '2026-07-10', null)).toBe(0);
  });
});

describe('promedioPrecioM2', () => {
  it('promedia ignorando null y ceros', () => {
    expect(promedioPrecioM2([100, null, 0, 200, undefined])).toBe(150);
  });

  it('null cuando no hay valores útiles', () => {
    expect(promedioPrecioM2([null, 0])).toBeNull();
  });
});
