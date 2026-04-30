import { describe, it, expect } from 'vitest';

import { esMunicipioFrontera, getSalarioMinimoZona, labelZona } from './salario-minimo-zona';

/**
 * Tests del helper de salario mínimo por zona.
 *
 * El helper alimenta el default del campo "Salario mínimo diario" en
 * `<EmpleadoFiniquitoModule>` y por extensión el tope de la prima de
 * antigüedad (Art. 162-II LFT). Cualquier cambio aquí afecta cálculos
 * de finiquito reales — los tests fijan los invariantes:
 *
 *   1. Piedras Negras, Coahuila → frontera ($374.89).
 *   2. Otro municipio de Coahuila no fronterizo → general ($248.93).
 *   3. CDMX → general.
 *   4. Comparación tolera acentos, mayúsculas y espacios.
 *   5. Datos faltantes → general (default conservador).
 */

describe('esMunicipioFrontera', () => {
  it('reconoce Piedras Negras, Coahuila como ZLFN', () => {
    expect(esMunicipioFrontera('Piedras Negras', 'Coahuila')).toBe(true);
  });

  it('reconoce Tijuana, Baja California como ZLFN', () => {
    expect(esMunicipioFrontera('Tijuana', 'Baja California')).toBe(true);
  });

  it('reconoce Ciudad Acuña con tolerancia a acentos', () => {
    expect(esMunicipioFrontera('Acuña', 'Coahuila')).toBe(true);
    expect(esMunicipioFrontera('ACUNA', 'COAHUILA')).toBe(true);
  });

  it('reconoce Nuevo Laredo, Tamaulipas', () => {
    expect(esMunicipioFrontera('Nuevo Laredo', 'Tamaulipas')).toBe(true);
  });

  it('rechaza Saltillo, Coahuila (no fronterizo)', () => {
    expect(esMunicipioFrontera('Saltillo', 'Coahuila')).toBe(false);
  });

  it('rechaza CDMX (no fronterizo)', () => {
    expect(esMunicipioFrontera('Iztapalapa', 'Ciudad de México')).toBe(false);
  });

  it('rechaza datos faltantes', () => {
    expect(esMunicipioFrontera(null, null)).toBe(false);
    expect(esMunicipioFrontera('', '')).toBe(false);
    expect(esMunicipioFrontera('Piedras Negras', null)).toBe(false);
    expect(esMunicipioFrontera(null, 'Coahuila')).toBe(false);
  });

  it('tolera espacios en bordes', () => {
    expect(esMunicipioFrontera('  Piedras Negras  ', '  Coahuila  ')).toBe(true);
  });
});

describe('getSalarioMinimoZona', () => {
  it('Piedras Negras 2026 → frontera $374.89', () => {
    const r = getSalarioMinimoZona({
      municipio: 'Piedras Negras',
      estado: 'Coahuila',
      anio: 2026,
    });
    expect(r.zona).toBe('frontera');
    expect(r.valor).toBe(374.89);
    expect(r.anio).toBe(2026);
  });

  it('Saltillo 2026 → general $248.93', () => {
    const r = getSalarioMinimoZona({
      municipio: 'Saltillo',
      estado: 'Coahuila',
    });
    expect(r.zona).toBe('general');
    expect(r.valor).toBe(248.93);
  });

  it('datos faltantes → general (conservador)', () => {
    const r = getSalarioMinimoZona({ municipio: null, estado: null });
    expect(r.zona).toBe('general');
    expect(r.valor).toBe(248.93);
  });

  it('año futuro sin entrada en tabla → fallback al año default', () => {
    const r = getSalarioMinimoZona({
      municipio: 'Piedras Negras',
      estado: 'Coahuila',
      anio: 2099,
    });
    // Al no estar 2099 en la tabla, cae al default ($374.89 frontera 2026).
    expect(r.valor).toBe(374.89);
    expect(r.zona).toBe('frontera');
  });
});

describe('labelZona', () => {
  it('frontera → "Zona Libre Frontera Norte"', () => {
    expect(labelZona('frontera')).toBe('Zona Libre Frontera Norte');
  });
  it('general → "Zona General"', () => {
    expect(labelZona('general')).toBe('Zona General');
  });
});
