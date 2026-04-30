import { describe, it, expect } from 'vitest';
import {
  isValidClabe,
  hasCuentaIdentificador,
  hasBancoIdentificado,
  validateCuentaBancaria,
  formatCuentaCompact,
  formatDireccionLine,
} from './satellites';

describe('isValidClabe', () => {
  it('acepta NULL y string vacío (campo opcional)', () => {
    expect(isValidClabe(null)).toBe(true);
    expect(isValidClabe(undefined)).toBe(true);
    expect(isValidClabe('')).toBe(true);
    expect(isValidClabe('   ')).toBe(true);
  });

  it('acepta exactamente 18 dígitos', () => {
    expect(isValidClabe('012345678901234567')).toBe(true);
    expect(isValidClabe('072075004205176879')).toBe(true);
  });

  it('rechaza longitudes distintas a 18', () => {
    expect(isValidClabe('1234567890123456')).toBe(false); // 16
    expect(isValidClabe('1234567890123456789')).toBe(false); // 19
  });

  it('rechaza no dígitos', () => {
    expect(isValidClabe('01234567890123456a')).toBe(false);
    expect(isValidClabe('012-456-789-012-345')).toBe(false);
  });
});

describe('hasCuentaIdentificador', () => {
  it('rechaza ambos vacíos', () => {
    expect(hasCuentaIdentificador(null, null)).toBe(false);
    expect(hasCuentaIdentificador('', '')).toBe(false);
    expect(hasCuentaIdentificador('   ', '   ')).toBe(false);
  });

  it('acepta solo número de cuenta', () => {
    expect(hasCuentaIdentificador('472056674', null)).toBe(true);
  });

  it('acepta solo CLABE', () => {
    expect(hasCuentaIdentificador(null, '012345678901234567')).toBe(true);
  });

  it('acepta ambos', () => {
    expect(hasCuentaIdentificador('472056674', '012345678901234567')).toBe(true);
  });
});

describe('hasBancoIdentificado', () => {
  it('rechaza ambos vacíos', () => {
    expect(hasBancoIdentificado(null, null)).toBe(false);
    expect(hasBancoIdentificado('', '')).toBe(false);
  });

  it('acepta banco_id solo', () => {
    expect(hasBancoIdentificado('uuid-banorte', null)).toBe(true);
  });

  it('acepta banco_nombre solo', () => {
    expect(hasBancoIdentificado(null, 'Banco Extranjero')).toBe(true);
  });
});

describe('validateCuentaBancaria', () => {
  it('rechaza falta de banco', () => {
    expect(
      validateCuentaBancaria({
        banco_id: null,
        banco_nombre: null,
        numero_cuenta: '472056674',
        clabe: null,
      })
    ).toMatch(/Falta banco/);
  });

  it('rechaza falta de identificador', () => {
    expect(
      validateCuentaBancaria({
        banco_id: 'uuid-x',
        banco_nombre: null,
        numero_cuenta: null,
        clabe: null,
      })
    ).toMatch(/Falta identificador/);
  });

  it('rechaza CLABE inválida', () => {
    expect(
      validateCuentaBancaria({
        banco_id: 'uuid-x',
        banco_nombre: null,
        numero_cuenta: null,
        clabe: '12345',
      })
    ).toMatch(/CLABE inválida/);
  });

  it('acepta entrada válida con catálogo + cuenta', () => {
    expect(
      validateCuentaBancaria({
        banco_id: 'uuid-banorte',
        banco_nombre: null,
        numero_cuenta: '472056674',
        clabe: null,
      })
    ).toBeNull();
  });

  it('acepta entrada válida con nombre libre + CLABE', () => {
    expect(
      validateCuentaBancaria({
        banco_id: null,
        banco_nombre: 'Banco Extranjero',
        numero_cuenta: null,
        clabe: '072075004205176879',
      })
    ).toBeNull();
  });
});

describe('formatCuentaCompact', () => {
  it('muestra banco + cuenta enmascarada + CLABE truncada', () => {
    expect(
      formatCuentaCompact({
        banco_label: 'BANORTE',
        numero_cuenta: '11391018105',
        clabe: '072075004205176879',
      })
    ).toBe('BANORTE · ****8105 · CLABE …6879');
  });

  it('omite partes vacías', () => {
    expect(
      formatCuentaCompact({
        banco_label: 'BBVA',
        numero_cuenta: '472056674',
        clabe: null,
      })
    ).toBe('BBVA · ****6674');
  });

  it('devuelve em-dash si nada', () => {
    expect(
      formatCuentaCompact({
        banco_label: null,
        numero_cuenta: null,
        clabe: null,
      })
    ).toBe('—');
  });
});

describe('formatDireccionLine', () => {
  it('formato canónico completo', () => {
    expect(
      formatDireccionLine({
        calle: 'Calle Saltillo',
        num_ext: '202',
        num_int: 'A',
        colonia: 'Nísperos',
        cp: '26020',
        municipio: 'Piedras Negras',
        estado: 'Coahuila',
        pais: 'México',
      })
    ).toBe('Calle Saltillo #202 int A · Col. Nísperos · CP 26020 · Piedras Negras, Coahuila');
  });

  it('omite partes nulas', () => {
    expect(
      formatDireccionLine({
        calle: 'Calle X',
        num_ext: null,
        num_int: null,
        colonia: null,
        cp: '26000',
        municipio: 'PN',
        estado: null,
        pais: 'México',
      })
    ).toBe('Calle X · CP 26000 · PN');
  });

  it('em-dash si todo nulo (excepto pais que tiene default)', () => {
    expect(
      formatDireccionLine({
        calle: null,
        num_ext: null,
        num_int: null,
        colonia: null,
        cp: null,
        municipio: null,
        estado: null,
        pais: 'México',
      })
    ).toBe('—');
  });
});
