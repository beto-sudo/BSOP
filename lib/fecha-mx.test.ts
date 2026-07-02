import { describe, expect, it } from 'vitest';
import {
  fechaISOMatamoros,
  hoyISOMatamoros,
  inicioMesMatamoros,
  restarMesesISO,
  sumarDiasISO,
} from './fecha-mx';

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

describe('hoyISOMatamoros', () => {
  it('coincide con fechaISOMatamoros(ahora)', () => {
    expect(hoyISOMatamoros()).toBe(fechaISOMatamoros(new Date()));
  });
});

describe('sumarDiasISO', () => {
  it('suma días con rollover de mes y año', () => {
    expect(sumarDiasISO('2026-06-15', 30)).toBe('2026-07-15');
    expect(sumarDiasISO('2026-12-20', 15)).toBe('2027-01-04');
    expect(sumarDiasISO('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('es aritmética pura: no depende de TZ ni de la hora', () => {
    expect(sumarDiasISO('2026-07-01', 0)).toBe('2026-07-01');
  });
});

describe('restarMesesISO', () => {
  it('resta meses con rollover de año', () => {
    expect(restarMesesISO('2026-06-30', 3)).toBe('2026-03-30');
    expect(restarMesesISO('2026-01-15', 3)).toBe('2025-10-15');
  });

  it('día 31 hacia mes corto rueda al mes siguiente (comportamiento Date.UTC)', () => {
    // 31 de mayo − 1 mes → "31 de abril" no existe → 1 de mayo.
    expect(restarMesesISO('2026-05-31', 1)).toBe('2026-05-01');
  });
});
