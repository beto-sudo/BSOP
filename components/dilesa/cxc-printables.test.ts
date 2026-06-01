import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level invariants for the CxC printables (iniciativa `cxc`, ADR-021):
 * <EstadoCuentaPrintable> y <ReciboCajaPrintable>.
 *
 * Por qué source-level y no render: el setup de este repo es env=node sin
 * jsdom ni @testing-library/react (ver detail-drawer.test.ts).
 *
 * Invariante clave: estos documentos son SOLO contenido y NO reimplementan el
 * aislamiento de impresión. Se montan dentro de un <DetailDrawer> y el
 * aislamiento lo provee la maquinaria del repo — `data-print-sheet-open`
 * (components/ui/sheet.tsx) + `@media print` (app/globals.css), igual que el
 * kardex. Un intento previo metió un truco propio (`visibility: hidden` en
 * todo el DOM + `position: absolute`) y los documentos salían EN BLANCO. Este
 * test guarda esa regresión.
 */

const estadoPath = path.resolve(__dirname, 'estado-cuenta-printable.tsx');
const reciboPath = path.resolve(__dirname, 'recibo-caja-printable.tsx');
const estadoSrc = readFileSync(estadoPath, 'utf8');
const reciboSrc = readFileSync(reciboPath, 'utf8');

describe('<EstadoCuentaPrintable> source invariants', () => {
  it('exports the component', () => {
    expect(estadoSrc).toContain('export function EstadoCuentaPrintable');
  });

  it('NO reimplementa el aislamiento de impresión (lo da el DetailDrawer)', () => {
    // Regresión "hoja en blanco": el documento NO debe traer su propio truco
    // de aislamiento. El DetailDrawer + globals.css se encargan.
    expect(estadoSrc).not.toContain('visibility: hidden');
    expect(estadoSrc).not.toContain('position: absolute');
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

  it('NO reimplementa el aislamiento de impresión (lo da el DetailDrawer)', () => {
    expect(reciboSrc).not.toContain('visibility: hidden');
    expect(reciboSrc).not.toContain('position: absolute');
  });

  it('imprime el monto en letra (formato notarial MX)', () => {
    expect(reciboSrc).toContain('formatMontoEnLetras');
  });

  it('declara que no sustituye al CFDI', () => {
    expect(reciboSrc).toContain('CFDI');
  });
});
