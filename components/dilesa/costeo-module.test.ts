import { describe, expect, it } from 'vitest';
import { deriveKpis, groupCosteo, type ContratoAgg, type CosteoRow } from './costeo-module';
import type { ConceptoResuelto } from '@/lib/dilesa/conceptos-catalogo';

function r(overrides: Partial<CosteoRow>): CosteoRow {
  return {
    id: 'id',
    proyecto_id: 'p1',
    proyectoNombre: 'Lomas',
    etapa: 'Urbanización',
    concepto: 'Drenaje',
    conceptoId: null,
    presupuestoPrevio: null,
    presupuestoActualizado: null,
    presupuesto: 0,
    gastoReal: 0,
    proveedorPersonaId: null,
    proveedor: null,
    fechaCompromiso: null,
    orden: 0,
    ratio: null,
    ...overrides,
  };
}

const NO_CONTRATOS: ContratoAgg = { contratado: 0, saldo: 0 };

describe('deriveKpis (Costeo DILESA — ADR-034)', () => {
  it('returns 5 KPIs en orden estable', () => {
    const k = deriveKpis([], NO_CONTRATOS);
    expect(k.map((x) => x.key)).toEqual([
      'presupuesto',
      'gasto',
      'ejecucion',
      'contratado',
      'saldo',
    ]);
  });

  it('"—" cuando no hay rows ni contratos', () => {
    const k = deriveKpis([], NO_CONTRATOS);
    expect(k[0]?.value).toBe('—');
    expect(k[1]?.value).toBe('—');
    expect(k[2]?.value).toBe('—');
  });

  it('suma presupuesto y gasto real (compact)', () => {
    const rows = [
      r({ presupuesto: 1_000_000, gastoReal: 500_000 }),
      r({ presupuesto: 2_000_000, gastoReal: 1_500_000 }),
    ];
    const k = deriveKpis(rows, NO_CONTRATOS);
    expect(String(k[0]?.value)).toContain('3'); // 3M presupuesto
    expect(String(k[1]?.value)).toContain('2'); // 2M gasto
  });

  it('% ejecución = gasto / presupuesto', () => {
    const rows = [r({ presupuesto: 1_000_000, gastoReal: 250_000 })];
    expect(String(deriveKpis(rows, NO_CONTRATOS)[2]?.value)).toContain('25');
  });

  it('ignora nulls al sumar (presupuesto/gasto null no rompe)', () => {
    const rows = [
      r({ presupuesto: null, gastoReal: 100 }),
      r({ presupuesto: 200, gastoReal: null }),
    ];
    const k = deriveKpis(rows, NO_CONTRATOS);
    // presupuesto Σ = 200, gasto Σ = 100, ratio = 0.5
    expect(String(k[2]?.value)).toContain('50');
  });

  it('% ejecución "—" si presupuesto = 0 (evita /0)', () => {
    const rows = [r({ presupuesto: 0, gastoReal: 500 })];
    expect(deriveKpis(rows, NO_CONTRATOS)[2]?.value).toBe('—');
  });

  it('contratado y saldo vienen del agregado de Capa B', () => {
    const k = deriveKpis([r({})], { contratado: 5_000_000, saldo: 1_200_000 });
    expect(String(k[3]?.value)).toContain('5'); // contratado
    expect(String(k[4]?.value)).toContain('1'); // saldo
  });
});

// Catálogo mínimo: 1 concepto en Urbanización › Agua potable, 1 en
// Anteproyecto › Topografía. Mismo shape que buildCatalogoConceptos.
function resuelto(over: Partial<ConceptoResuelto>): ConceptoResuelto {
  return {
    id: 'k',
    codigo: '2.03.01',
    nombre: 'Red de agua potable',
    capituloCodigo: '2.03',
    capituloNombre: 'Agua potable',
    etapaCodigo: '2',
    etapaNombre: 'Urbanización',
    ...over,
  };
}
const CATALOGO = new Map<string, ConceptoResuelto>([
  ['agua', resuelto({ id: 'agua', codigo: '2.03.01' })],
  [
    'topo',
    resuelto({
      id: 'topo',
      codigo: '1.01.01',
      nombre: 'Levantamiento',
      capituloCodigo: '1.01',
      capituloNombre: 'Topografía',
      etapaCodigo: '1',
      etapaNombre: 'Anteproyecto',
    }),
  ],
]);

describe('groupCosteo (Costeo DILESA — agrupado etapa›capítulo)', () => {
  it('agrupa por etapa y capítulo del catálogo, ordenado por código', () => {
    const grupos = groupCosteo([r({ conceptoId: 'agua' }), r({ conceptoId: 'topo' })], CATALOGO);
    // Anteproyecto (etapa 1) antes que Urbanización (etapa 2).
    expect(grupos.map((g) => g.nombre)).toEqual(['Anteproyecto', 'Urbanización']);
    expect(grupos[0]?.capitulos[0]?.nombre).toBe('Topografía');
    expect(grupos[1]?.capitulos[0]?.nombre).toBe('Agua potable');
  });

  it('manda las partidas sin concepto_id a "Sin clasificar" al final', () => {
    const grupos = groupCosteo(
      [r({ conceptoId: 'agua' }), r({ conceptoId: null, concepto: 'Huérfana' })],
      CATALOGO
    );
    expect(grupos.at(-1)?.nombre).toBe('Sin clasificar');
    expect(grupos.at(-1)?.capitulos[0]?.partidas[0]?.concepto).toBe('Huérfana');
  });

  it('un concepto_id que no resuelve en el catálogo cae en "Sin clasificar"', () => {
    const grupos = groupCosteo([r({ conceptoId: 'no-existe' })], CATALOGO);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.nombre).toBe('Sin clasificar');
  });

  it('suma subtotales por capítulo y por etapa (null-safe)', () => {
    const grupos = groupCosteo(
      [
        r({ conceptoId: 'agua', presupuesto: 1000, gastoReal: 400 }),
        r({ conceptoId: 'agua', presupuesto: null, gastoReal: 100 }),
      ],
      CATALOGO
    );
    const etapa = grupos[0];
    expect(etapa?.presupuesto).toBe(1000);
    expect(etapa?.gastoReal).toBe(500);
    expect(etapa?.capitulos[0]?.presupuesto).toBe(1000);
    expect(etapa?.capitulos[0]?.gastoReal).toBe(500);
  });

  it('ordena las partidas dentro del capítulo por código de concepto', () => {
    const cat = new Map<string, ConceptoResuelto>([
      ['a', resuelto({ id: 'a', codigo: '2.03.02', nombre: 'B' })],
      ['b', resuelto({ id: 'b', codigo: '2.03.01', nombre: 'A' })],
    ]);
    const grupos = groupCosteo(
      [r({ id: 'x', conceptoId: 'a' }), r({ id: 'y', conceptoId: 'b' })],
      cat
    );
    // y (2.03.01) antes que x (2.03.02).
    expect(grupos[0]?.capitulos[0]?.partidas.map((p) => p.id)).toEqual(['y', 'x']);
  });
});
