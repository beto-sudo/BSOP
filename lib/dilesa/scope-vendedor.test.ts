import { describe, expect, it } from 'vitest';
import { esSoloVendedor } from './scope-vendedor';

describe('esSoloVendedor', () => {
  it('vendedor puro → scoped a sus ventas', () => {
    expect(esSoloVendedor(['Vendedor'])).toBe(true);
  });

  it('vendedor que además es Gerencia/Dirección → ve todo', () => {
    expect(esSoloVendedor(['Vendedor', 'Gerencia Ventas'])).toBe(false);
    expect(esSoloVendedor(['Vendedor', 'Dirección'])).toBe(false);
  });

  it('roles amplios sin Vendedor → sin scope', () => {
    expect(esSoloVendedor(['Dirección'])).toBe(false);
    expect(esSoloVendedor(['Contabilidad'])).toBe(false);
    expect(esSoloVendedor([])).toBe(false);
  });

  it('tolera acentos y mayúsculas distintas', () => {
    expect(esSoloVendedor(['VENDEDOR'])).toBe(true);
    expect(esSoloVendedor(['vendedor', 'direccion'])).toBe(false);
    expect(esSoloVendedor(['Vendedor', 'Dirección'])).toBe(false);
  });
});
