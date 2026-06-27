import { describe, expect, it } from 'vitest';
import { matamorosFecha } from './fecha';

describe('daily-briefing · fecha', () => {
  it('formatea la fecha local de Matamoros (verano, CDT)', () => {
    // 27-jun-2026 13:00 UTC → 08:00 en Matamoros (CDT, UTC-5).
    const f = matamorosFecha(new Date('2026-06-27T13:00:00Z'));
    expect(f.iso).toBe('2026-06-27');
    expect(f.diaSemana).toBe('sábado');
    expect(f.larga).toContain('junio');
    expect(f.larga).toContain('2026');
  });

  it('respeta el cruce de día por TZ (madrugada UTC = día anterior local)', () => {
    // 27-jun 02:00 UTC → 26-jun 21:00 en Matamoros.
    const f = matamorosFecha(new Date('2026-06-27T02:00:00Z'));
    expect(f.iso).toBe('2026-06-26');
  });
});
