import { describe, expect, it } from 'vitest';
import { buildPartidaIndex, SIN_CLASIFICAR, type PartidaIndexRow } from './partidas';
import type { ConceptoCompraRaw } from '@/lib/dilesa/conceptos-catalogo';

// Catálogo mínimo: 1 etapa › 1 capítulo › 1 concepto.
const CATALOGO: ConceptoCompraRaw[] = [
  { id: 'e1', padre_id: null, nivel: 'etapa', codigo: '2', nombre: 'Urbanización' },
  { id: 'c1', padre_id: 'e1', nivel: 'capitulo', codigo: '2.03', nombre: 'Agua potable' },
  { id: 'k1', padre_id: 'c1', nivel: 'concepto', codigo: '2.03.01', nombre: 'Red de agua' },
];

const partida = (over: Partial<PartidaIndexRow>): PartidaIndexRow => ({
  id: 'p',
  proyecto_id: 'PR1',
  concepto_id: 'k1',
  concepto_texto: 'Red de agua potable',
  ...over,
});

describe('buildPartidaIndex — labels y proyecto', () => {
  it('mapea id → concepto_texto y "(sin concepto)" cuando es null', () => {
    const { partidaLabel } = buildPartidaIndex(
      [partida({ id: 'a', concepto_texto: 'Cemento' }), partida({ id: 'b', concepto_texto: null })],
      CATALOGO
    );
    expect(partidaLabel.get('a')).toBe('Cemento');
    expect(partidaLabel.get('b')).toBe('(sin concepto)');
  });

  it('partidaProyecto solo incluye partidas con proyecto; label las incluye a todas', () => {
    const { partidaLabel, partidaProyecto } = buildPartidaIndex(
      [
        partida({ id: 'con', proyecto_id: 'PR1' }),
        partida({ id: 'sin', proyecto_id: null, concepto_texto: 'Gasto suelto' }),
      ],
      CATALOGO
    );
    expect(partidaProyecto.get('con')).toBe('PR1');
    expect(partidaProyecto.has('sin')).toBe(false);
    // El label está disponible aunque no tenga proyecto.
    expect(partidaLabel.get('sin')).toBe('Gasto suelto');
  });
});

describe('buildPartidaIndex — grupos por etapa›capítulo', () => {
  it('clasifica la partida bajo su capítulo con label compuesto', () => {
    const { gruposByProyecto } = buildPartidaIndex([partida({ id: 'a' })], CATALOGO);
    const grupos = gruposByProyecto.get('PR1')!;
    expect(grupos).toHaveLength(1);
    expect(grupos[0].key).toBe('2.03');
    expect(grupos[0].label).toBe('Urbanización › Agua potable');
    expect(grupos[0].partidas.map((p) => p.id)).toEqual(['a']);
  });

  it('partida sin concepto_id (o sin catálogo) cae en "Sin clasificar"', () => {
    const { gruposByProyecto } = buildPartidaIndex(
      [partida({ id: 'a', concepto_id: null, concepto_texto: 'Imprevisto' })],
      CATALOGO
    );
    const grupos = gruposByProyecto.get('PR1')!;
    expect(grupos[0].key).toBe(SIN_CLASIFICAR);
    expect(grupos[0].label).toBe('Sin clasificar');
  });

  it('ordena grupos por código de capítulo y "Sin clasificar" al final; partidas por label', () => {
    const cat: ConceptoCompraRaw[] = [
      ...CATALOGO,
      { id: 'c2', padre_id: 'e1', nivel: 'capitulo', codigo: '2.01', nombre: 'Terracerías' },
      { id: 'k2', padre_id: 'c2', nivel: 'concepto', codigo: '2.01.01', nombre: 'Despalme' },
    ];
    const { gruposByProyecto } = buildPartidaIndex(
      [
        partida({ id: 'z', concepto_id: 'k1', concepto_texto: 'Zeta agua' }),
        partida({ id: 'a', concepto_id: 'k1', concepto_texto: 'Alfa agua' }),
        partida({ id: 't', concepto_id: 'k2', concepto_texto: 'Despalme' }),
        partida({ id: 's', concepto_id: null, concepto_texto: 'Sin clasif' }),
      ],
      cat
    );
    const grupos = gruposByProyecto.get('PR1')!;
    // 2.01 (Terracerías) < 2.03 (Agua) < __sin__ (Sin clasificar)
    expect(grupos.map((g) => g.key)).toEqual(['2.01', '2.03', SIN_CLASIFICAR]);
    // Dentro de Agua potable las partidas van por label: Alfa antes que Zeta.
    expect(grupos[1].partidas.map((p) => p.label)).toEqual(['Alfa agua', 'Zeta agua']);
  });

  it('separa partidas por proyecto', () => {
    const { gruposByProyecto } = buildPartidaIndex(
      [partida({ id: 'a', proyecto_id: 'PR1' }), partida({ id: 'b', proyecto_id: 'PR2' })],
      CATALOGO
    );
    expect([...gruposByProyecto.keys()].sort()).toEqual(['PR1', 'PR2']);
    expect(gruposByProyecto.get('PR1')![0].partidas[0].id).toBe('a');
    expect(gruposByProyecto.get('PR2')![0].partidas[0].id).toBe('b');
  });
});
