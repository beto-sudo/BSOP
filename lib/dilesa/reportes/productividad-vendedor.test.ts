import { describe, it, expect } from 'vitest';
import { construirProductividadVendedor } from './productividad-vendedor';
import type { VentaReporteRow } from './ventas-data';

function row(p: Partial<VentaReporteRow>): VentaReporteRow {
  return {
    id: p.id ?? 'x',
    estado: p.estado ?? 'activa',
    faseActual: null,
    fasePosicion: null,
    precio: p.precio ?? null,
    numeroEscritura: p.numeroEscritura ?? null,
    fechaEscritura: p.fechaEscritura ?? null,
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? '',
    unidadIdentificador: null,
    cliente: p.cliente ?? '',
    vendedor: p.vendedor ?? null,
    mesCreacion: '2026-01',
    mesEscritura: p.mesEscritura ?? null,
  };
}

const SIN_FILTRO = { proyecto: '' };

describe('construirProductividadVendedor', () => {
  it('agrupa por vendedor separando pipeline (en proceso) de escriturado', () => {
    const rows = [
      row({ vendedor: 'Ana', precio: 100 }), // en proceso
      row({ vendedor: 'Ana', precio: 200, numeroEscritura: 'E' }), // escriturada
      row({ vendedor: 'Beto', precio: 50 }),
    ];
    const r = construirProductividadVendedor(rows, SIN_FILTRO);
    const ana = r.filas.find((f) => f.vendedor === 'Ana')!;
    expect(ana.ventas).toBe(2);
    expect(ana.pipeline).toBe(100);
    expect(ana.escrituradas).toBe(1);
    expect(ana.montoEscriturado).toBe(200);
    expect(ana.pctEscrituradas).toBe(0.5);
  });

  it('excluye desasignadas y ventas sin vendedor', () => {
    const rows = [
      row({ vendedor: 'Ana', precio: 100 }),
      row({ vendedor: 'Ana', precio: 999, estado: 'desasignada' }),
      row({ vendedor: null, precio: 999 }),
    ];
    const r = construirProductividadVendedor(rows, SIN_FILTRO);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].ventas).toBe(1);
    expect(r.totalVentas).toBe(1);
  });

  it('ordena por monto escriturado desc', () => {
    const rows = [
      row({ vendedor: 'Ana', precio: 100, numeroEscritura: 'E' }),
      row({ vendedor: 'Beto', precio: 500, numeroEscritura: 'E' }),
      row({ vendedor: 'Cris', precio: 300, numeroEscritura: 'E' }),
    ];
    const r = construirProductividadVendedor(rows, SIN_FILTRO);
    expect(r.filas.map((f) => f.vendedor)).toEqual(['Beto', 'Cris', 'Ana']);
  });

  it('filtra por proyecto', () => {
    const rows = [
      row({ vendedor: 'Ana', precio: 100, proyectoId: 'p1' }),
      row({ vendedor: 'Ana', precio: 200, proyectoId: 'p2' }),
    ];
    const r = construirProductividadVendedor(rows, { proyecto: 'p1' });
    expect(r.filas[0].ventas).toBe(1);
    expect(r.filas[0].pipeline).toBe(100);
  });

  it('agrega los totales sobre todos los vendedores', () => {
    const rows = [
      row({ vendedor: 'Ana', precio: 100, numeroEscritura: 'E' }),
      row({ vendedor: 'Beto', precio: 50 }),
    ];
    const r = construirProductividadVendedor(rows, SIN_FILTRO);
    expect(r.totalVendedores).toBe(2);
    expect(r.totalVentas).toBe(2);
    expect(r.totalPipeline).toBe(50);
    expect(r.totalEscrituradas).toBe(1);
    expect(r.totalMontoEscriturado).toBe(100);
  });
});
