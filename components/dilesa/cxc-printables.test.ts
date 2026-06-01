import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level invariants for the CxC printables (iniciativa `cxc`,
 * ADR-021): <EstadoCuentaPrintable> y <ReciboCajaPrintable>.
 *
 * Por qué source-level y no render: el setup de este repo es env=node sin
 * jsdom ni @testing-library/react (ver detail-drawer.test.ts). Leer la
 * fuente y aseverar sobre strings críticos atrapa la regresión específica
 * que importa aquí: el AISLAMIENTO DE IMPRESIÓN. Ambos documentos viven
 * embebidos en una página llena de UI (el detalle de venta); si alguien
 * quita la regla `body * { visibility: hidden }` o el `hidden print:block`,
 * imprimir filtraría toda la página en vez de solo el documento.
 */

const estadoPath = path.resolve(__dirname, 'estado-cuenta-printable.tsx');
const reciboPath = path.resolve(__dirname, 'recibo-caja-printable.tsx');
const estadoSrc = readFileSync(estadoPath, 'utf8');
const reciboSrc = readFileSync(reciboPath, 'utf8');

describe('<EstadoCuentaPrintable> source invariants', () => {
  it('exports the component', () => {
    expect(estadoSrc).toContain('export function EstadoCuentaPrintable');
  });

  it('isola la impresión: oculta todo lo demás del DOM al imprimir', () => {
    // Sin esto, imprimir el estado de cuenta sacaría toda la página del
    // detalle de venta (5 secciones, pipeline, expediente).
    expect(estadoSrc).toContain('body * { visibility: hidden');
    expect(estadoSrc).toContain(
      '.estado-cuenta-print-root, .estado-cuenta-print-root * { visibility: visible'
    );
    expect(estadoSrc).toContain('position: absolute');
  });

  it('está oculto en pantalla y solo aparece al imprimir', () => {
    expect(estadoSrc).toMatch(/hidden[^"]*print:block/);
  });

  it('rinde el membrete y el pie de la empresa', () => {
    expect(estadoSrc).toContain('branding.logoPath');
    expect(estadoSrc).toContain('/footer-doc.png');
  });

  it('declara que no es comprobante fiscal (CFDI)', () => {
    expect(estadoSrc).toContain('CFDI');
  });
});

describe('<ReciboCajaPrintable> source invariants', () => {
  it('exports the component', () => {
    expect(reciboSrc).toContain('export function ReciboCajaPrintable');
  });

  it('isola la impresión igual que el estado de cuenta', () => {
    expect(reciboSrc).toContain('body * { visibility: hidden');
    expect(reciboSrc).toContain(
      '.recibo-caja-print-root, .recibo-caja-print-root * { visibility: visible'
    );
    expect(reciboSrc).toContain('position: absolute');
  });

  it('está oculto en pantalla y solo aparece al imprimir', () => {
    expect(reciboSrc).toMatch(/hidden[^"]*print:block/);
  });

  it('imprime el monto en letra (formato notarial MX)', () => {
    expect(reciboSrc).toContain('formatMontoEnLetras');
  });

  it('declara que no sustituye al CFDI', () => {
    expect(reciboSrc).toContain('CFDI');
  });
});
