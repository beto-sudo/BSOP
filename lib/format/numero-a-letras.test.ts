import { describe, it, expect } from 'vitest';
import { formatMontoEnLetras } from './numero-a-letras';

describe('formatMontoEnLetras', () => {
  it('formato canónico Coda — 3,405,530', () => {
    expect(formatMontoEnLetras(3405530)).toBe(
      'Tres Millones Cuatrocientos Cinco Mil Quinientos Treinta Pesos 00/100 M.N.'
    );
  });

  it('millón único usa "Un Millón"', () => {
    expect(formatMontoEnLetras(1000000)).toBe('Un Millón Pesos 00/100 M.N.');
  });

  it('mil único usa "Un Mil" (estilo notarial)', () => {
    expect(formatMontoEnLetras(1000)).toBe('Un Mil Pesos 00/100 M.N.');
  });

  it('cien exacto sin "Ciento"', () => {
    expect(formatMontoEnLetras(100)).toBe('Cien Pesos 00/100 M.N.');
  });

  it('ciento más resto usa "Ciento"', () => {
    expect(formatMontoEnLetras(150)).toBe('Ciento Cincuenta Pesos 00/100 M.N.');
  });

  it('centavos en 2 dígitos', () => {
    expect(formatMontoEnLetras(1234.56)).toBe(
      'Un Mil Doscientos Treinta y Cuatro Pesos 56/100 M.N.'
    );
  });

  it('redondeo de centavos a 2 decimales', () => {
    expect(formatMontoEnLetras(1.999)).toBe('Dos Pesos 00/100 M.N.');
  });

  it('cero', () => {
    expect(formatMontoEnLetras(0)).toBe('Cero Pesos 00/100 M.N.');
  });

  it('veintes contraídos (21–29)', () => {
    expect(formatMontoEnLetras(21)).toBe('Veintiuno Pesos 00/100 M.N.');
    expect(formatMontoEnLetras(25)).toBe('Veinticinco Pesos 00/100 M.N.');
  });

  it('decenas con "y" entre decena y unidad (≥31)', () => {
    expect(formatMontoEnLetras(31)).toBe('Treinta y Uno Pesos 00/100 M.N.');
    expect(formatMontoEnLetras(99)).toBe('Noventa y Nueve Pesos 00/100 M.N.');
  });

  it('NaN/Infinity tratado como cero', () => {
    expect(formatMontoEnLetras(NaN)).toBe('Cero Pesos 00/100 M.N.');
    expect(formatMontoEnLetras(Infinity)).toBe('Cero Pesos 00/100 M.N.');
  });

  it('negativo lanza Error visible (mejor que letra mala en contrato)', () => {
    expect(() => formatMontoEnLetras(-1)).toThrow(/negativo/);
  });

  it('mil millones o más lanza Error visible', () => {
    expect(() => formatMontoEnLetras(1_000_000_000)).toThrow(/mil millones/);
  });

  it('máximo soportado — 999,999,999.99', () => {
    expect(formatMontoEnLetras(999_999_999.99)).toBe(
      'Novecientos Noventa y Nueve Millones Novecientos Noventa y Nueve Mil Novecientos Noventa y Nueve Pesos 99/100 M.N.'
    );
  });

  it('caso piloto — 2,790,000 (valor comercial RMD-LDS)', () => {
    expect(formatMontoEnLetras(2790000)).toBe(
      'Dos Millones Setecientos Noventa Mil Pesos 00/100 M.N.'
    );
  });

  it('caso piloto — 3,000,000 (crédito Infonavit titular)', () => {
    expect(formatMontoEnLetras(3000000)).toBe('Tres Millones Pesos 00/100 M.N.');
  });

  it('100,000 — "Cien Mil"', () => {
    expect(formatMontoEnLetras(100000)).toBe('Cien Mil Pesos 00/100 M.N.');
  });

  it('200,001 — centena con resto', () => {
    expect(formatMontoEnLetras(200001)).toBe('Doscientos Mil Uno Pesos 00/100 M.N.');
  });
});
