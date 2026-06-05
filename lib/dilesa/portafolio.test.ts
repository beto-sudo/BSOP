import { describe, it, expect } from 'vitest';

import {
  inferActivoTipo,
  puedeLiberarse,
  isActivoTipo,
  isActivoModalidad,
  ACTIVO_TIPOS,
  ACTIVO_MODALIDADES,
} from './portafolio';

describe('inferActivoTipo', () => {
  it('comercial → lote', () => {
    expect(inferActivoTipo('Comercial')).toBe('lote');
    expect(inferActivoTipo('comercial')).toBe('lote');
  });

  it('vivienda residencial → casa', () => {
    expect(inferActivoTipo('Interes Social')).toBe('casa');
    expect(inferActivoTipo('Interés Social')).toBe('casa');
    expect(inferActivoTipo('Residencial Medio')).toBe('casa');
    expect(inferActivoTipo('Residencial')).toBe('casa');
    expect(inferActivoTipo('habitacional')).toBe('casa');
  });

  it('sin tipo / no reconocido → lote', () => {
    expect(inferActivoTipo(null)).toBe('lote');
    expect(inferActivoTipo(undefined)).toBe('lote');
    expect(inferActivoTipo('Equipamiento')).toBe('lote');
    expect(inferActivoTipo('Area Verde (Donación Municipal)')).toBe('lote');
  });
});

describe('puedeLiberarse', () => {
  it('permite estados con pieza física', () => {
    for (const e of [
      'lote_urbanizado',
      'terminada',
      'asignada',
      'vendida',
      'escriturada',
      'entregada',
    ]) {
      expect(puedeLiberarse(e)).toBe(true);
    }
  });

  it('bloquea estados sin pieza física', () => {
    expect(puedeLiberarse('planeada')).toBe(false);
    expect(puedeLiberarse('en_construccion')).toBe(false);
  });
});

describe('guards de catálogo', () => {
  it('isActivoTipo valida contra el catálogo', () => {
    for (const t of ACTIVO_TIPOS) expect(isActivoTipo(t)).toBe(true);
    expect(isActivoTipo('plaza_gigante')).toBe(false);
    expect(isActivoTipo('')).toBe(false);
  });

  it('isActivoModalidad valida contra el catálogo', () => {
    for (const m of ACTIVO_MODALIDADES) expect(isActivoModalidad(m)).toBe(true);
    expect(isActivoModalidad('regalo')).toBe(false);
    expect(isActivoModalidad('')).toBe(false);
  });
});
