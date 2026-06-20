import { describe, it, expect } from 'vitest';
import { construirPorTipoCredito, SIN_TIPO_CREDITO } from './por-tipo-credito';
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
    proyectoNombre: '',
    unidadIdentificador: null,
    cliente: '',
    vendedor: null,
    tipoCredito: p.tipoCredito ?? null,
    fechaFirmaProgramada: null,
    horaFirmaProgramada: null,
    mesCreacion: '2026-01',
    mesEscritura: null,
  };
}

const SIN_FILTRO = { proyecto: '' };

describe('construirPorTipoCredito', () => {
  it('agrupa por tipo de crédito con conteo, monto y shares', () => {
    const rows = [
      row({ tipoCredito: 'INFONAVIT', precio: 100 }),
      row({ tipoCredito: 'INFONAVIT', precio: 300 }),
      row({ tipoCredito: 'FOVISSSTE', precio: 600 }),
    ];
    const r = construirPorTipoCredito(rows, SIN_FILTRO);
    const info = r.filas.find((f) => f.tipo === 'INFONAVIT')!;
    expect(info.ventas).toBe(2);
    expect(info.monto).toBe(400);
    expect(info.pctVentas).toBeCloseTo(2 / 3);
    expect(info.pctMonto).toBeCloseTo(0.4);
    expect(r.totalVentas).toBe(3);
    expect(r.totalMonto).toBe(1000);
  });

  it('agrupa las ventas sin tipo de crédito bajo "Sin especificar"', () => {
    const rows = [row({ tipoCredito: null, precio: 50 }), row({ tipoCredito: '  ', precio: 50 })];
    const r = construirPorTipoCredito(rows, SIN_FILTRO);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].tipo).toBe(SIN_TIPO_CREDITO);
    expect(r.filas[0].ventas).toBe(2);
  });

  it('excluye desasignadas y filtra por proyecto', () => {
    const rows = [
      row({ tipoCredito: 'INFONAVIT', precio: 100, proyectoId: 'p1' }),
      row({ tipoCredito: 'INFONAVIT', precio: 999, estado: 'desasignada', proyectoId: 'p1' }),
      row({ tipoCredito: 'INFONAVIT', precio: 200, proyectoId: 'p2' }),
    ];
    const r = construirPorTipoCredito(rows, { proyecto: 'p1' });
    expect(r.totalVentas).toBe(1);
    expect(r.totalMonto).toBe(100);
  });

  it('ordena por conteo descendente', () => {
    const rows = [
      row({ tipoCredito: 'Contado', precio: 1 }),
      row({ tipoCredito: 'INFONAVIT', precio: 1 }),
      row({ tipoCredito: 'INFONAVIT', precio: 1 }),
    ];
    const r = construirPorTipoCredito(rows, SIN_FILTRO);
    expect(r.filas.map((f) => f.tipo)).toEqual(['INFONAVIT', 'Contado']);
  });
});
