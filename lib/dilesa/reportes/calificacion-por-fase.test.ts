import { describe, expect, it } from 'vitest';
import {
  agregarPorFase,
  construirCalificacion,
  bandaTone,
  N_MIN_FASE,
  type FaseBenchmark,
  type FaseCalificacionRaw,
} from './calificacion-por-fase';

const benchmark: FaseBenchmark[] = [
  { posicion: 3, fase: 'Formalizada', mediana: 4, p90: 120, n: 1000 },
  { posicion: 11, fase: 'Escriturada', mediana: 12, p90: 53, n: 1000 },
  { posicion: 13, fase: 'Facturada', mediana: 13, p90: 34, n: 600 },
];

function raw(
  p: number,
  fase: string,
  n: number,
  mediana: number,
  p90: number
): FaseCalificacionRaw {
  return { posicion: p, fase, n, mediana, p90 };
}

describe('construirCalificacion', () => {
  it('ordena por posición y arma una fila por fase del benchmark', () => {
    const r = construirCalificacion([], benchmark);
    expect(r.filas.map((f) => f.posicion)).toEqual([3, 11, 13]);
    expect(r.filas.map((f) => f.fase)).toEqual(['Formalizada', 'Escriturada', 'Facturada']);
  });

  it('banda relativa: verde ≈ vara, ámbar más lento, rojo mucho más lento', () => {
    const periodo = [
      raw(3, 'Formalizada', 50, 4, 120), // = vara → verde
      raw(11, 'Escriturada', 50, 15, 60), // 15/12 = 1.25 → ámbar
      raw(13, 'Facturada', 50, 30, 80), // 30/13 = 2.3 → rojo
    ];
    const r = construirCalificacion(periodo, benchmark);
    expect(r.filas.find((f) => f.posicion === 3)?.banda).toBe('verde');
    expect(r.filas.find((f) => f.posicion === 11)?.banda).toBe('ambar');
    expect(r.filas.find((f) => f.posicion === 13)?.banda).toBe('rojo');
    expect(r.fasesLentas).toBe(1);
  });

  it('n insuficiente ⇒ gris (no califica)', () => {
    const periodo = [raw(3, 'Formalizada', N_MIN_FASE - 1, 99, 200)];
    const r = construirCalificacion(periodo, benchmark);
    expect(r.filas.find((f) => f.posicion === 3)?.banda).toBe('gris');
  });

  it('sin dato del periodo ⇒ n=0, gris, mediana null', () => {
    const r = construirCalificacion([], benchmark);
    const f = r.filas.find((x) => x.posicion === 3)!;
    expect(f.n).toBe(0);
    expect(f.mediana).toBeNull();
    expect(f.banda).toBe('gris');
  });

  it('cuello = fase con mayor p90 y n suficiente', () => {
    const periodo = [
      raw(3, 'Formalizada', 50, 4, 120),
      raw(11, 'Escriturada', 50, 12, 53),
      raw(13, 'Facturada', 3, 13, 999), // p90 alto pero n insuficiente → no cuenta
    ];
    const r = construirCalificacion(periodo, benchmark);
    expect(r.cuello).toEqual({ fase: 'Formalizada', p90: 120 });
  });

  it('deltaPrevio = mediana periodo − mediana periodo anterior', () => {
    const periodo = [raw(11, 'Escriturada', 50, 18, 60)];
    const previo = [raw(11, 'Escriturada', 40, 12, 50)];
    const r = construirCalificacion(periodo, benchmark, previo);
    expect(r.filas.find((f) => f.posicion === 11)?.deltaPrevio).toBe(6);
  });

  it('tramosMedidos suma los n del periodo', () => {
    const periodo = [raw(3, 'Formalizada', 10, 4, 120), raw(11, 'Escriturada', 7, 12, 53)];
    expect(construirCalificacion(periodo, benchmark).tramosMedidos).toBe(17);
  });

  it('la meta de Dirección sustituye a la mediana como vara (S3)', () => {
    // Sin meta: periodo 12 vs mediana 4 → ratio 3 → rojo.
    const sinMeta = construirCalificacion([raw(3, 'Formalizada', 50, 12, 100)], benchmark);
    expect(sinMeta.filas.find((f) => f.posicion === 3)?.banda).toBe('rojo');
    // Con meta 10 (más holgada): 12/10 = 1.2 → ámbar. Se muestra la meta y la vara.
    const conMeta = construirCalificacion(
      [raw(3, 'Formalizada', 50, 12, 100)],
      [{ posicion: 3, fase: 'Formalizada', mediana: 4, p90: 120, n: 1000, meta: 10, vara: 10 }]
    );
    const fila = conMeta.filas.find((f) => f.posicion === 3)!;
    expect(fila.banda).toBe('ambar');
    expect(fila.meta).toBe(10);
    expect(fila.vara).toBe(10);
    expect(fila.baseline).toBe(4); // el histórico sigue visible
  });

  it('asigna responsable (tercero en Escriturada=notaría, interna en Facturada)', () => {
    const r = construirCalificacion([], benchmark);
    expect(r.filas.find((f) => f.posicion === 11)?.responsable).toBe('tercero');
    expect(r.filas.find((f) => f.posicion === 13)?.responsable).toBe('interna');
  });
});

describe('agregarPorFase', () => {
  it('agrupa por posición y calcula n/mediana/p90 (interpolado)', () => {
    const rows = [
      { posicion: 11, fase: 'Escriturada', dias: 10 },
      { posicion: 11, fase: 'Escriturada', dias: 20 },
      { posicion: 11, fase: 'Escriturada', dias: 30 },
      { posicion: 3, fase: 'Formalizada', dias: 5 },
    ];
    const out = agregarPorFase(rows);
    const esc = out.find((r) => r.posicion === 11)!;
    expect(esc.n).toBe(3);
    expect(esc.mediana).toBe(20);
    expect(esc.p90).toBe(28); // 0.9*(3-1)=1.8 → 20 + (30-20)*0.8 = 28
    expect(out.find((r) => r.posicion === 3)?.n).toBe(1);
  });
});

describe('bandaTone', () => {
  it('mapea bandas a tonos del design system', () => {
    expect(bandaTone('verde')).toBe('success');
    expect(bandaTone('ambar')).toBe('warning');
    expect(bandaTone('rojo')).toBe('danger');
    expect(bandaTone('gris')).toBe('neutral');
  });
});
