import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('arma encabezados + filas separadas por CRLF', () => {
    const csv = toCsv(
      ['Folio', 'Total'],
      [
        ['OC-1', 100],
        ['OC-2', 250],
      ]
    );
    expect(csv).toBe('Folio,Total\r\nOC-1,100\r\nOC-2,250');
  });

  it('escapa celdas con coma, comilla o salto de línea', () => {
    const csv = toCsv(['Concepto'], [['Cemento, gris'], ['Varilla 3/8"'], ['línea\nrota']]);
    expect(csv).toBe('Concepto\r\n"Cemento, gris"\r\n"Varilla 3/8"""\r\n"línea\nrota"');
  });

  it('serializa null/undefined como celda vacía', () => {
    expect(toCsv(['A', 'B', 'C'], [[null, undefined, '']])).toBe('A,B,C\r\n,,');
  });

  it('serializa números y booleanos', () => {
    expect(toCsv(['N', 'B'], [[0, false]])).toBe('N,B\r\n0,false');
  });

  it('soporta cero filas (solo encabezado)', () => {
    expect(toCsv(['Folio'], [])).toBe('Folio');
  });
});
