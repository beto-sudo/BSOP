import { describe, it, expect } from 'vitest';
import { construirEstancadas } from './estancadas';
import type { EstancadaRow } from './estancadas-data';

function row(p: Partial<EstancadaRow>): EstancadaRow {
  return {
    ventaId: p.ventaId ?? 'x',
    faseActual: p.faseActual ?? 'Cerrar avalúo',
    fasePosicion: p.fasePosicion ?? 5,
    fechaFaseActual: p.fechaFaseActual ?? '2026-06-01',
    diasEnFase: p.diasEnFase ?? 0,
    unidadIdentificador: null,
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? 'Delicias',
    cliente: p.cliente ?? '',
    vendedor: null,
    precio: p.precio ?? null,
  };
}

const SIN_FILTRO = { proyecto: '', minDias: '' };

describe('construirEstancadas', () => {
  it('ordena por días en fase descendente', () => {
    const rows = [
      row({ ventaId: 'a', diasEnFase: 3 }),
      row({ ventaId: 'b', diasEnFase: 40 }),
      row({ ventaId: 'c', diasEnFase: 12 }),
    ];
    const r = construirEstancadas(rows, SIN_FILTRO);
    expect(r.filas.map((f) => f.ventaId)).toEqual(['b', 'c', 'a']);
  });

  it('cuenta estancadas según el umbral y calcula max/promedio', () => {
    const rows = [row({ diasEnFase: 10 }), row({ diasEnFase: 40 }), row({ diasEnFase: 50 })];
    const r = construirEstancadas(rows, SIN_FILTRO, 30);
    expect(r.totalPipeline).toBe(3);
    expect(r.estancadas).toBe(2);
    expect(r.maxDias).toBe(50);
    expect(r.promedioDias).toBe(Math.round((10 + 40 + 50) / 3));
  });

  it('filtra por minDias', () => {
    const rows = [row({ diasEnFase: 5 }), row({ diasEnFase: 35 })];
    const r = construirEstancadas(rows, { proyecto: '', minDias: '30' });
    expect(r.totalPipeline).toBe(1);
    expect(r.filas[0].diasEnFase).toBe(35);
  });

  it('filtra por proyecto', () => {
    const rows = [
      row({ proyectoNombre: 'Delicias', diasEnFase: 10 }),
      row({ proyectoNombre: 'Ampliación', diasEnFase: 20 }),
    ];
    const r = construirEstancadas(rows, { proyecto: 'Delicias', minDias: '' });
    expect(r.totalPipeline).toBe(1);
  });

  it('sin ventas: promedio 0, sin dividir por cero', () => {
    const r = construirEstancadas([], SIN_FILTRO);
    expect(r.totalPipeline).toBe(0);
    expect(r.promedioDias).toBe(0);
    expect(r.maxDias).toBe(0);
  });
});
