import { describe, it, expect } from 'vitest';
import {
  construirPipelinePorFase,
  filtrarVentas,
  type FaseCatalogo,
  type VentaPipeline,
  type VentaReporte,
} from './pipeline-por-fase';

const FASES: FaseCatalogo[] = [
  // A propósito desordenadas para verificar el sort por posición.
  { posicion: 2, nombre: 'Asignada', rol: 'Gerencia General' },
  { posicion: 1, nombre: 'Asignación Solicitada', rol: 'Todos' },
  { posicion: 3, nombre: 'Formalizada', rol: 'Gerencia General' },
];

describe('construirPipelinePorFase', () => {
  it('ordena por posición e incluye las fases con 0 ventas', () => {
    const res = construirPipelinePorFase(FASES, []);
    expect(res.filas.map((f) => f.posicion)).toEqual([1, 2, 3]);
    expect(res.filas.every((f) => f.ventas === 0 && f.monto === 0)).toBe(true);
    expect(res.totalVentas).toBe(0);
    expect(res.totalMonto).toBe(0);
    expect(res.faseCuello).toBeNull();
  });

  it('cuenta y suma monto solo de ventas activas, por fase', () => {
    const ventas: VentaPipeline[] = [
      { estado: 'activa', fase_actual: 'Asignada', precio: 100 },
      { estado: 'activa', fase_actual: 'Asignada', precio: 200 },
      { estado: 'activa', fase_actual: 'Formalizada', precio: 50 },
      { estado: 'desasignada', fase_actual: 'Asignada', precio: 999 }, // excluida
    ];
    const res = construirPipelinePorFase(FASES, ventas);
    const asignada = res.filas.find((f) => f.fase === 'Asignada')!;
    expect(asignada.ventas).toBe(2);
    expect(asignada.monto).toBe(300);
    expect(res.totalVentas).toBe(3);
    expect(res.totalMonto).toBe(350);
    expect(res.faseCuello).toBe('Asignada');
  });

  it('trata precio null como 0 en el monto pero cuenta la venta', () => {
    const ventas: VentaPipeline[] = [
      { estado: 'activa', fase_actual: 'Formalizada', precio: null },
    ];
    const res = construirPipelinePorFase(FASES, ventas);
    const f = res.filas.find((x) => x.fase === 'Formalizada')!;
    expect(f.ventas).toBe(1);
    expect(f.monto).toBe(0);
  });

  it('calcula los shares (pctVentas/pctMonto) sobre los totales', () => {
    const ventas: VentaPipeline[] = [
      { estado: 'activa', fase_actual: 'Asignada', precio: 75 },
      { estado: 'activa', fase_actual: 'Formalizada', precio: 25 },
    ];
    const res = construirPipelinePorFase(FASES, ventas);
    const asignada = res.filas.find((f) => f.fase === 'Asignada')!;
    expect(asignada.pctVentas).toBeCloseTo(0.5);
    expect(asignada.pctMonto).toBeCloseTo(0.75);
  });

  it('ignora ventas sin fase_actual (no rompe ni cuenta)', () => {
    const ventas: VentaPipeline[] = [{ estado: 'activa', fase_actual: null, precio: 500 }];
    const res = construirPipelinePorFase(FASES, ventas);
    expect(res.totalVentas).toBe(0);
    expect(res.totalMonto).toBe(0);
    expect(res.faseCuello).toBeNull();
  });
});

describe('filtrarVentas', () => {
  const base: VentaReporte[] = [
    {
      estado: 'activa',
      fase_actual: 'Asignada',
      precio: 100,
      proyectoId: 'p1',
      vendedor: 'Ana',
      mes: '2026-05',
    },
    {
      estado: 'activa',
      fase_actual: 'Formalizada',
      precio: 200,
      proyectoId: 'p2',
      vendedor: 'Beto',
      mes: '2026-06',
    },
    {
      estado: 'activa',
      fase_actual: 'Asignada',
      precio: 300,
      proyectoId: 'p1',
      vendedor: 'Beto',
      mes: '2026-06',
    },
  ];

  it('sin filtros devuelve todo', () => {
    expect(filtrarVentas(base, { proyecto: '', vendedor: '', mes: '' })).toHaveLength(3);
  });

  it('filtra por proyecto', () => {
    const r = filtrarVentas(base, { proyecto: 'p1', vendedor: '', mes: '' });
    expect(r).toHaveLength(2);
    expect(r.every((v) => v.proyectoId === 'p1')).toBe(true);
  });

  it('combina filtros (vendedor + mes) en AND', () => {
    const r = filtrarVentas(base, { proyecto: '', vendedor: 'Beto', mes: '2026-06' });
    expect(r).toHaveLength(2);
    expect(r.every((v) => v.vendedor === 'Beto' && v.mes === '2026-06')).toBe(true);
  });

  it('el resultado filtrado alimenta el motor sin cambios de shape', () => {
    const filtradas = filtrarVentas(base, { proyecto: 'p1', vendedor: 'Beto', mes: '' });
    const res = construirPipelinePorFase(FASES, filtradas);
    expect(res.totalVentas).toBe(1);
    expect(res.totalMonto).toBe(300);
  });
});
