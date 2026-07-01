import { describe, expect, it } from 'vitest';
import { fechaISOMatamoros, inicioMesMatamoros } from './fecha-mx';

describe('fechaISOMatamoros', () => {
  it('invierno (CST, UTC-6): a las 20:00 locales el día UTC ya avanzó, pero la fecha local es la de hoy', () => {
    // 2026-01-15 02:30 UTC = 2026-01-14 20:30 en Matamoros (CST).
    expect(fechaISOMatamoros(new Date('2026-01-15T02:30:00Z'))).toBe('2026-01-14');
  });

  it('verano (CDT, UTC-5): mismo cruce de medianoche con el offset de verano', () => {
    // 2026-07-15 01:30 UTC = 2026-07-14 20:30 en Matamoros (CDT).
    expect(fechaISOMatamoros(new Date('2026-07-15T01:30:00Z'))).toBe('2026-07-14');
  });

  it('media tarde resuelve al día correcto en verano', () => {
    // 2026-06-26 18:00 UTC = 2026-06-26 13:00 en Matamoros (CDT, UTC-5).
    expect(fechaISOMatamoros(new Date('2026-06-26T18:00:00Z'))).toBe('2026-06-26');
  });

  it('justo antes de medianoche local (invierno) cae en el día correcto', () => {
    // 2026-02-10 05:30 UTC = 2026-02-09 23:30 en Matamoros (CST, UTC-6).
    expect(fechaISOMatamoros(new Date('2026-02-10T05:30:00Z'))).toBe('2026-02-09');
  });
});

describe('inicioMesMatamoros', () => {
  it('cierre de mes a las 20:00 locales: el mes UTC ya es el siguiente, el local no (bug 30-jun-2026)', () => {
    // 2026-07-01 01:00 UTC = 2026-06-30 20:00 en Matamoros (CDT) — el instante
    // exacto en que el resumen al consejo salió con el acumulado del mes en cero.
    expect(inicioMesMatamoros(new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-01');
  });

  it('mismo cruce en invierno (CST, UTC-6)', () => {
    // 2026-02-01 02:00 UTC = 2026-01-31 20:00 en Matamoros (CST).
    expect(inicioMesMatamoros(new Date('2026-02-01T02:00:00Z'))).toBe('2026-01-01');
  });

  it('media tarde a mitad de mes → primer día del mes local', () => {
    expect(inicioMesMatamoros(new Date('2026-06-15T18:00:00Z'))).toBe('2026-06-01');
  });
});
