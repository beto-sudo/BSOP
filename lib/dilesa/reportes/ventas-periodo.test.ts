import { describe, it, expect } from 'vitest';
import { construirVentasPeriodo } from './ventas-periodo';
import type { VentaReporteRow } from './ventas-data';

function row(p: Partial<VentaReporteRow>): VentaReporteRow {
  return {
    id: p.id ?? 'x',
    estado: p.estado ?? 'activa',
    faseActual: p.faseActual ?? null,
    fasePosicion: p.fasePosicion ?? null,
    precio: p.precio ?? null,
    numeroEscritura: p.numeroEscritura ?? null,
    fechaEscritura: p.fechaEscritura ?? null,
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? '',
    unidadIdentificador: p.unidadIdentificador ?? null,
    cliente: p.cliente ?? '(sin comprador)',
    vendedor: p.vendedor ?? null,
    mesCreacion: p.mesCreacion ?? '2026-01',
    mesEscritura: p.mesEscritura ?? null,
  };
}

const SIN_FILTRO = { desde: '', hasta: '', proyecto: '', vendedor: '' };

describe('construirVentasPeriodo', () => {
  it('solo cuenta ventas escrituradas (número + fecha)', () => {
    const rows = [
      row({ id: 'a', numeroEscritura: 'E1', fechaEscritura: '2026-05-10', precio: 100 }),
      row({ id: 'b', numeroEscritura: null, fechaEscritura: null, precio: 999 }), // no escriturada
      row({ id: 'c', numeroEscritura: 'E2', fechaEscritura: null, precio: 999 }), // sin fecha → fuera
    ];
    const r = construirVentasPeriodo(rows, SIN_FILTRO);
    expect(r.totalVentas).toBe(1);
    expect(r.totalMonto).toBe(100);
    expect(r.ventas[0].id).toBe('a');
  });

  it('filtra por rango de fecha de escritura (inclusivo)', () => {
    const rows = [
      row({ id: 'a', numeroEscritura: 'E', fechaEscritura: '2026-04-30', precio: 1 }),
      row({ id: 'b', numeroEscritura: 'E', fechaEscritura: '2026-05-01', precio: 1 }),
      row({ id: 'c', numeroEscritura: 'E', fechaEscritura: '2026-05-31', precio: 1 }),
      row({ id: 'd', numeroEscritura: 'E', fechaEscritura: '2026-06-01', precio: 1 }),
    ];
    const r = construirVentasPeriodo(rows, {
      desde: '2026-05-01',
      hasta: '2026-05-31',
      proyecto: '',
      vendedor: '',
    });
    expect(r.ventas.map((v) => v.id).sort()).toEqual(['b', 'c']);
  });

  it('agrupa por mes y ordena las ventas por fecha desc', () => {
    const rows = [
      row({ id: 'a', numeroEscritura: 'E', fechaEscritura: '2026-05-10', precio: 100 }),
      row({ id: 'b', numeroEscritura: 'E', fechaEscritura: '2026-06-05', precio: 200 }),
      row({ id: 'c', numeroEscritura: 'E', fechaEscritura: '2026-05-20', precio: 300 }),
    ];
    const r = construirVentasPeriodo(rows, SIN_FILTRO);
    expect(r.ventas.map((v) => v.id)).toEqual(['b', 'c', 'a']); // fecha desc
    expect(r.porMes).toEqual([
      { mes: '2026-05', ventas: 2, monto: 400 },
      { mes: '2026-06', ventas: 1, monto: 200 },
    ]);
  });

  it('calcula ticket promedio y trata precio null como 0', () => {
    const rows = [
      row({ numeroEscritura: 'E', fechaEscritura: '2026-05-10', precio: 100 }),
      row({ numeroEscritura: 'E', fechaEscritura: '2026-05-11', precio: null }),
    ];
    const r = construirVentasPeriodo(rows, SIN_FILTRO);
    expect(r.totalMonto).toBe(100);
    expect(r.ticketPromedio).toBe(50);
  });

  it('sin ventas: ticket promedio 0, sin dividir por cero', () => {
    const r = construirVentasPeriodo([], SIN_FILTRO);
    expect(r.totalVentas).toBe(0);
    expect(r.ticketPromedio).toBe(0);
    expect(r.porMes).toEqual([]);
  });
});
