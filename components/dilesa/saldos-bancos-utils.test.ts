import { describe, it, expect } from 'vitest';

import { monedaDeCuenta, computeAntiguedadDias } from './saldos-bancos-utils';

describe('monedaDeCuenta', () => {
  it('detecta USD para la cuenta de dólares (con acento)', () => {
    expect(monedaDeCuenta('BBVA Bancomer Dólares', 'BBVA Bancomer')).toBe('USD');
  });

  it('detecta USD sin acento y case-insensitive', () => {
    expect(monedaDeCuenta('cuenta dolares')).toBe('USD');
    expect(monedaDeCuenta('USD Operativa')).toBe('USD');
  });

  it('default MXN para las cuentas en pesos', () => {
    expect(monedaDeCuenta('BBVA Bancomer', 'BBVA Bancomer')).toBe('MXN');
    expect(monedaDeCuenta('Casa de Bolsa Finamex', 'Finamex')).toBe('MXN');
    expect(monedaDeCuenta('Monex Grupo Financiero', 'Monex')).toBe('MXN');
  });

  it('maneja null/undefined sin romper', () => {
    expect(monedaDeCuenta(null)).toBe('MXN');
    expect(monedaDeCuenta(null, null)).toBe('MXN');
  });

  it('no confunde substrings que contienen "usd" embebido', () => {
    // "usd" como palabra suelta → USD; pero no debe disparar por azar en
    // nombres MXN comunes.
    expect(monedaDeCuenta('Inversión a plazo')).toBe('MXN');
  });
});

describe('computeAntiguedadDias', () => {
  // Fijamos "ahora" para tests determinísticos. 2026-06-07 12:00 UTC cae el
  // mismo día calendar en Matamoros (UTC-5).
  const now = new Date('2026-06-07T12:00:00Z');

  it('null cuando no hay fecha', () => {
    expect(computeAntiguedadDias(null, now)).toBeNull();
    expect(computeAntiguedadDias(undefined, now)).toBeNull();
    expect(computeAntiguedadDias('', now)).toBeNull();
  });

  it('0 cuando el saldo es de hoy', () => {
    expect(computeAntiguedadDias('2026-06-07', now)).toBe(0);
  });

  it('cuenta días civiles hacia atrás', () => {
    expect(computeAntiguedadDias('2026-06-06', now)).toBe(1);
    expect(computeAntiguedadDias('2026-05-24', now)).toBe(14);
    expect(computeAntiguedadDias('2026-05-23', now)).toBe(15);
  });

  it('acepta timestamps ISO completos (toma el componente date)', () => {
    expect(computeAntiguedadDias('2026-06-06T23:59:59Z', now)).toBe(1);
  });

  it('clampa fechas futuras a 0', () => {
    expect(computeAntiguedadDias('2026-06-10', now)).toBe(0);
  });

  it('devuelve null para fechas malformadas', () => {
    expect(computeAntiguedadDias('not-a-date', now)).toBeNull();
    expect(computeAntiguedadDias('2026-13', now)).toBeNull();
  });
});
