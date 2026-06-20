import { describe, it, expect } from 'vitest';
import { construirEscrituracionProgramada } from './escrituracion-programada';
import type { VentaReporteRow } from './ventas-data';

function row(p: Partial<VentaReporteRow>): VentaReporteRow {
  return {
    id: p.id ?? 'x',
    estado: p.estado ?? 'activa',
    faseActual: null,
    fasePosicion: null,
    precio: p.precio ?? null,
    numeroEscritura: p.numeroEscritura ?? null,
    fechaEscritura: null,
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: '',
    unidadIdentificador: null,
    cliente: p.cliente ?? '',
    vendedor: null,
    tipoCredito: null,
    fechaFirmaProgramada: p.fechaFirmaProgramada ?? null,
    horaFirmaProgramada: p.horaFirmaProgramada ?? null,
    mesCreacion: '2026-01',
    mesEscritura: null,
  };
}

const SIN_FILTRO = { desde: '', hasta: '', proyecto: '' };

describe('construirEscrituracionProgramada', () => {
  it('solo cuenta agendadas (fecha) que aún no escrituraron', () => {
    const rows = [
      row({ id: 'a', fechaFirmaProgramada: '2026-07-01', precio: 100 }),
      row({ id: 'b', fechaFirmaProgramada: null, precio: 999 }), // sin agenda
      row({ id: 'c', fechaFirmaProgramada: '2026-07-02', numeroEscritura: 'E', precio: 999 }), // ya escrituró
    ];
    const r = construirEscrituracionProgramada(rows, SIN_FILTRO);
    expect(r.totalFirmas).toBe(1);
    expect(r.firmas[0].id).toBe('a');
    expect(r.totalMonto).toBe(100);
  });

  it('ordena por fecha y luego por hora', () => {
    const rows = [
      row({ id: 'a', fechaFirmaProgramada: '2026-07-02', horaFirmaProgramada: '10:00' }),
      row({ id: 'b', fechaFirmaProgramada: '2026-07-01', horaFirmaProgramada: '15:00' }),
      row({ id: 'c', fechaFirmaProgramada: '2026-07-01', horaFirmaProgramada: '09:00' }),
    ];
    const r = construirEscrituracionProgramada(rows, SIN_FILTRO);
    expect(r.firmas.map((f) => f.id)).toEqual(['c', 'b', 'a']);
  });

  it('agrupa por fecha', () => {
    const rows = [
      row({ fechaFirmaProgramada: '2026-07-01', precio: 100 }),
      row({ fechaFirmaProgramada: '2026-07-01', precio: 200 }),
      row({ fechaFirmaProgramada: '2026-07-05', precio: 300 }),
    ];
    const r = construirEscrituracionProgramada(rows, SIN_FILTRO);
    expect(r.porFecha).toEqual([
      { fecha: '2026-07-01', firmas: 2, monto: 300 },
      { fecha: '2026-07-05', firmas: 1, monto: 300 },
    ]);
  });

  it('filtra por rango de fecha (inclusivo) y por proyecto', () => {
    const rows = [
      row({ id: 'a', fechaFirmaProgramada: '2026-06-30', proyectoId: 'p1' }),
      row({ id: 'b', fechaFirmaProgramada: '2026-07-01', proyectoId: 'p1' }),
      row({ id: 'c', fechaFirmaProgramada: '2026-07-15', proyectoId: 'p2' }),
    ];
    const r = construirEscrituracionProgramada(rows, {
      desde: '2026-07-01',
      hasta: '2026-07-31',
      proyecto: 'p1',
    });
    expect(r.firmas.map((f) => f.id)).toEqual(['b']);
  });
});
