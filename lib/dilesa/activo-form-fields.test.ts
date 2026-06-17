import { describe, it, expect } from 'vitest';

import {
  MASTER_FIELDS,
  SATELITE_FIELDS,
  getSateliteFields,
  groupBySection,
  TIPOS_ACTIVO,
} from './activo-form-fields';

describe('getSateliteFields', () => {
  it('devuelve los campos del satélite para tipos soportados', () => {
    expect(getSateliteFields('terreno').length).toBeGreaterThan(0);
    expect(getSateliteFields('espectacular').some((f) => f.key === 'renta_mensual')).toBe(true);
    expect(getSateliteFields('terreno').some((f) => f.key === 'precio_solicitado_m2')).toBe(true);
  });

  it('devuelve [] para tipos sin form rico', () => {
    expect(getSateliteFields('edificio')).toEqual([]);
    expect(getSateliteFields('inexistente')).toEqual([]);
  });
});

describe('groupBySection', () => {
  it('agrupa preservando el orden de aparición', () => {
    const groups = groupBySection(MASTER_FIELDS);
    const titles = groups.map(([s]) => s);
    expect(titles[0]).toBe('Identificación');
    expect(titles).toContain('Ubicación');
    // cada campo cae en exactamente un grupo
    const total = groups.reduce((n, [, fs]) => n + fs.length, 0);
    expect(total).toBe(MASTER_FIELDS.length);
  });
});

describe('consistencia de catálogos', () => {
  it('todo tipo con satélite está en TIPOS_ACTIVO', () => {
    const tipos = new Set<string>(TIPOS_ACTIVO.map((t) => t.value));
    for (const tipo of Object.keys(SATELITE_FIELDS)) {
      expect(tipos.has(tipo)).toBe(true);
    }
  });

  it('ningún campo de satélite colisiona con una key del master', () => {
    const masterKeys = new Set(MASTER_FIELDS.map((f) => f.key));
    for (const fields of Object.values(SATELITE_FIELDS)) {
      for (const f of fields) {
        // 'notas' es intencional en master; el satélite no lo redefine
        if (f.key === 'notas') continue;
        expect(masterKeys.has(f.key)).toBe(false);
      }
    }
  });
});
