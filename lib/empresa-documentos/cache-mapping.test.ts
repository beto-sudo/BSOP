import { describe, it, expect } from 'vitest';

import {
  buildEscrituraCacheFromSubtipoMeta,
  EMPRESA_DOCUMENTOS_ROLES,
  ROL_TO_CACHE_COLUMN,
} from './cache-mapping';

describe('buildEscrituraCacheFromSubtipoMeta', () => {
  it('null/undefined input → null', () => {
    expect(buildEscrituraCacheFromSubtipoMeta(null)).toBeNull();
    expect(buildEscrituraCacheFromSubtipoMeta(undefined)).toBeNull();
  });

  it('objeto vacío → null (todos los campos null)', () => {
    expect(buildEscrituraCacheFromSubtipoMeta({})).toBeNull();
  });

  it('extracción con convención `numero_escritura` / `fecha_escritura`', () => {
    const meta = {
      numero_escritura: '12345',
      fecha_escritura: '2010-05-15',
      notario_nombre: 'JUAN PÉREZ',
      notaria_numero: '5',
      distrito_notarial: 'PIEDRAS NEGRAS',
    };
    expect(buildEscrituraCacheFromSubtipoMeta(meta)).toEqual({
      numero: '12345',
      fecha: '2010-05-15',
      fecha_texto: null,
      notario: 'JUAN PÉREZ',
      notaria_numero: '5',
      distrito: 'PIEDRAS NEGRAS',
    });
  });

  it('extracción con convención corta `numero` / `fecha` / `notario` / `distrito`', () => {
    const meta = {
      numero: '6789',
      fecha: '2021-03-03',
      notario: 'MARÍA LÓPEZ',
      notaria_numero: '12',
      distrito: 'COAHUILA',
    };
    expect(buildEscrituraCacheFromSubtipoMeta(meta)).toEqual({
      numero: '6789',
      fecha: '2021-03-03',
      fecha_texto: null,
      notario: 'MARÍA LÓPEZ',
      notaria_numero: '12',
      distrito: 'COAHUILA',
    });
  });

  it('si vienen ambas convenciones, prefiere la "larga" (`numero_escritura`)', () => {
    const meta = {
      numero_escritura: '12345',
      numero: 'OTRO',
      fecha_escritura: '2010-05-15',
      fecha: '2099-12-31',
    };
    const result = buildEscrituraCacheFromSubtipoMeta(meta);
    expect(result?.numero).toBe('12345');
    expect(result?.fecha).toBe('2010-05-15');
  });

  it('preserva fecha_texto cuando viene', () => {
    const meta = {
      numero: '1',
      fecha_texto: 'quince de mayo del dos mil diez',
    };
    const result = buildEscrituraCacheFromSubtipoMeta(meta);
    expect(result?.fecha_texto).toBe('quince de mayo del dos mil diez');
    expect(result?.fecha).toBeNull();
  });

  it('cadena vacía y solo whitespace cuentan como null', () => {
    const meta = {
      numero: '  ',
      fecha: '',
      notario: '   ',
      notaria_numero: '5',
    };
    const result = buildEscrituraCacheFromSubtipoMeta(meta);
    expect(result?.numero).toBeNull();
    expect(result?.fecha).toBeNull();
    expect(result?.notario).toBeNull();
    expect(result?.notaria_numero).toBe('5');
  });

  it('valores no-string (números, objetos) los descarta como null', () => {
    const meta = {
      numero: 123 as unknown as string,
      fecha: { iso: '2020-01-01' } as unknown as string,
      notario: 'JUAN',
    };
    const result = buildEscrituraCacheFromSubtipoMeta(meta);
    expect(result?.numero).toBeNull();
    expect(result?.fecha).toBeNull();
    expect(result?.notario).toBe('JUAN');
  });

  it('parcial (solo algunos campos) llena lo disponible y deja el resto null', () => {
    const meta = { numero_escritura: '999' };
    expect(buildEscrituraCacheFromSubtipoMeta(meta)).toEqual({
      numero: '999',
      fecha: null,
      fecha_texto: null,
      notario: null,
      notaria_numero: null,
      distrito: null,
    });
  });
});

describe('ROL_TO_CACHE_COLUMN', () => {
  it('mapea acta_constitutiva → escritura_constitutiva', () => {
    expect(ROL_TO_CACHE_COLUMN.acta_constitutiva).toBe('escritura_constitutiva');
  });

  it('mapea poder_general_administracion → escritura_poder', () => {
    expect(ROL_TO_CACHE_COLUMN.poder_general_administracion).toBe('escritura_poder');
  });

  it('roles que NO disparan sync no aparecen en el mapeo', () => {
    expect(ROL_TO_CACHE_COLUMN.acta_reforma).toBeUndefined();
    expect(ROL_TO_CACHE_COLUMN.poder_actos_dominio).toBeUndefined();
    expect(ROL_TO_CACHE_COLUMN.poder_bancario).toBeUndefined();
    expect(ROL_TO_CACHE_COLUMN.representante_legal_imss).toBeUndefined();
  });
});

describe('EMPRESA_DOCUMENTOS_ROLES', () => {
  it('contiene los 7 roles iniciales decididos en B1', () => {
    expect(EMPRESA_DOCUMENTOS_ROLES).toEqual([
      'acta_constitutiva',
      'acta_reforma',
      'poder_general_administracion',
      'poder_actos_dominio',
      'poder_pleitos_cobranzas',
      'poder_bancario',
      'representante_legal_imss',
    ]);
  });
});
