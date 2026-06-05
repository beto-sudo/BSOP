import { describe, expect, it } from 'vitest';
import { buildCatalogoConceptos, type ConceptoCompraRaw } from './conceptos-catalogo';

// Mini catálogo de 2 etapas para los tests. Mismo shape que el seed ADR-040:
// codigo con padding 2-díg, padre = código sin el último segmento.
const ROWS: ConceptoCompraRaw[] = [
  { id: 'e1', padre_id: null, nivel: 'etapa', codigo: '1', nombre: 'Anteproyecto' },
  { id: 'c1', padre_id: 'e1', nivel: 'capitulo', codigo: '1.01', nombre: 'Topografía' },
  { id: 'k1', padre_id: 'c1', nivel: 'concepto', codigo: '1.01.02', nombre: 'Mecánica de suelos' },
  { id: 'k2', padre_id: 'c1', nivel: 'concepto', codigo: '1.01.01', nombre: 'Levantamiento' },
  { id: 'e2', padre_id: null, nivel: 'etapa', codigo: '2', nombre: 'Urbanización' },
  { id: 'c2', padre_id: 'e2', nivel: 'capitulo', codigo: '2.03', nombre: 'Agua potable' },
  { id: 'k3', padre_id: 'c2', nivel: 'concepto', codigo: '2.03.01', nombre: 'Red de agua potable' },
];

describe('buildCatalogoConceptos (ADR-040)', () => {
  it('resuelve la jerarquía completa de un concepto hoja', () => {
    const { byConcepto } = buildCatalogoConceptos(ROWS);
    const res = byConcepto.get('k3');
    expect(res).toMatchObject({
      codigo: '2.03.01',
      nombre: 'Red de agua potable',
      capituloCodigo: '2.03',
      capituloNombre: 'Agua potable',
      etapaCodigo: '2',
      etapaNombre: 'Urbanización',
    });
  });

  it('solo indexa conceptos hoja (no etapas ni capítulos)', () => {
    const { byConcepto } = buildCatalogoConceptos(ROWS);
    expect(byConcepto.has('e1')).toBe(false);
    expect(byConcepto.has('c1')).toBe(false);
    expect(byConcepto.size).toBe(3);
  });

  it('arma un optgroup por capítulo, ordenados por código', () => {
    const { optgroups } = buildCatalogoConceptos(ROWS);
    expect(optgroups.map((g) => g.capituloCodigo)).toEqual(['1.01', '2.03']);
    expect(optgroups[0]?.label).toBe('Anteproyecto › Topografía');
  });

  it('ordena los conceptos dentro del optgroup por código (no por inserción)', () => {
    const { optgroups } = buildCatalogoConceptos(ROWS);
    // k2 (1.01.01) antes que k1 (1.01.02) aunque k1 venga primero en el array.
    expect(optgroups[0]?.conceptos.map((c) => c.codigo)).toEqual(['1.01.01', '1.01.02']);
  });

  it('omite conceptos huérfanos (capítulo o etapa ausente)', () => {
    const huerfano: ConceptoCompraRaw[] = [
      { id: 'x', padre_id: 'no-existe', nivel: 'concepto', codigo: '9.99.99', nombre: 'Huérfano' },
    ];
    const { byConcepto, optgroups } = buildCatalogoConceptos(huerfano);
    expect(byConcepto.size).toBe(0);
    expect(optgroups).toHaveLength(0);
  });
});
