import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Invariantes source-level del template de contrato de obra de monto global
 * (iniciativa dilesa-contratos-obra · Fase 4). Source-level y no render: el
 * setup de este repo es env=node sin jsdom (ver cxc-printables.test.ts); el
 * render real se valida con el smoke del route handler en preview.
 *
 * Guarda dos cosas: (1) que el cuerpo legal está completo (las 18 cláusulas del
 * formato "servicios a precios unitarios"), y (2) que esta variante es de monto
 * global — sin tabla de lotes ni ANEXO 3, que son exclusivos de vivienda.
 */
const src = readFileSync(path.resolve(__dirname, 'contrato-obra-global.tsx'), 'utf8');

describe('contrato-obra-global (PDF de obra de monto global — Fase 4)', () => {
  it('declara las 18 cláusulas en orden (PRIMERA … DÉCIMA OCTAVA)', () => {
    const numeros = [...src.matchAll(/n="([^"]+)"/g)].map((m) => m[1]);
    expect(numeros).toEqual([
      'PRIMERA',
      'SEGUNDA',
      'TERCERA',
      'CUARTA',
      'QUINTA',
      'SEXTA',
      'SÉPTIMA',
      'OCTAVA',
      'NOVENA',
      'DÉCIMA',
      'DÉCIMA PRIMERA',
      'DÉCIMA SEGUNDA',
      'DÉCIMA TERCERA',
      'DÉCIMA CUARTA',
      'DÉCIMA QUINTA',
      'DÉCIMA SEXTA',
      'DÉCIMA SÉPTIMA',
      'DÉCIMA OCTAVA',
    ]);
  });

  it('reusa header/footer/folio y las constantes del cliente (no duplica branding/datos)', () => {
    expect(src).toMatch(/HeaderBand/);
    expect(src).toMatch(/FooterBand/);
    expect(src).toContain('EL_CLIENTE_OBRA');
    expect(src).toContain('TESTIGOS_OBRA');
    expect(src).toContain('JURISDICCION_OBRA');
  });

  it('es de monto global: una sola página, sin tabla de lotes ni datos de anexo', () => {
    // Vivienda monta una segunda <Page> para el ANEXO 3; el global es 1 sola.
    expect([...src.matchAll(/<Page\b/g)]).toHaveLength(1);
    expect(src).not.toContain('LotesTable');
    expect(src).not.toContain('Anexo3');
    expect(src).not.toMatch(/data\.lotes|data\.anexo3/);
  });

  it('no usa `gap` (gotcha de @react-pdf v4.5.x — usar margins)', () => {
    expect(src).not.toMatch(/\bgap:\s/);
  });

  it('fianza y anticipo son condicionales al pct (contratistas locales sin fianza/anticipo)', () => {
    // Si fianza_pct/anticipo_pct = 0, la cláusula no obliga lo que no se exige
    // (la garantía pasa a ser el fondo de retención de la cláusula OCTAVA).
    expect(src).toContain('data.fianzaPct > 0');
    expect(src).toContain('data.anticipoPct > 0');
  });

  it('parametriza los valores variables del contrato', () => {
    for (const campo of [
      'objeto',
      'montoTotal',
      'anticipoMonto',
      'retencionPct',
      'fianzaPct',
      'periodicidadDias',
    ]) {
      expect(src).toContain(campo);
    }
  });
});
