import { describe, it, expect } from 'vitest';
import { construirDesasignadas, clasificarMotivo } from './desasignadas';
import type { DesasignadaRow } from './desasignadas-data';

function row(p: Partial<DesasignadaRow>): DesasignadaRow {
  const fecha = p.fecha ?? '2026-05-01';
  return {
    id: p.id ?? 'x',
    cliente: p.cliente ?? '',
    unidadIdentificador: null,
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? '',
    vendedor: null,
    motivo: p.motivo ?? null,
    precio: p.precio ?? null,
    fecha,
    mes: fecha.slice(0, 7),
  };
}

const SIN_FILTRO = { desde: '', hasta: '', proyecto: '', categoria: '' as const };

describe('clasificarMotivo', () => {
  it('marca reubicación cuando el motivo habla de mover/reasignar a otra unidad', () => {
    expect(clasificarMotivo('Se reasignará en 4-25 para escrituración inmediata')).toBe(
      'reubicacion'
    );
    expect(clasificarMotivo('Se reubicará en 6-22')).toBe('reubicacion');
    expect(clasificarMotivo('Cliente cambia a la 10-10 para escrituración inmediata')).toBe(
      'reubicacion'
    );
  });

  it('marca baja en cancelación / desperfilado / sin capacidad / ilocalizable', () => {
    expect(clasificarMotivo('Cliente no cuenta con diferencia')).toBe('baja');
    expect(clasificarMotivo('Se desperfiló coacreditado.')).toBe('baja');
    expect(clasificarMotivo('Cliente ya no se pudo localizar.')).toBe('baja');
    expect(clasificarMotivo('Por motivos personales desea cancelar')).toBe('baja');
    expect(clasificarMotivo(null)).toBe('baja');
  });
});

describe('construirDesasignadas', () => {
  it('clasifica, ordena por fecha desc y totaliza por categoría', () => {
    const rows = [
      row({ id: 'a', motivo: 'Se reasignará en 4-25', fecha: '2026-05-10' }),
      row({ id: 'b', motivo: 'Cliente no cuenta con diferencia', fecha: '2026-06-01' }),
    ];
    const r = construirDesasignadas(rows, SIN_FILTRO);
    expect(r.total).toBe(2);
    expect(r.reubicaciones).toBe(1);
    expect(r.bajas).toBe(1);
    expect(r.filas.map((f) => f.id)).toEqual(['b', 'a']);
    expect(r.filas.find((f) => f.id === 'a')!.categoria).toBe('reubicacion');
  });

  it('filtra por categoría', () => {
    const rows = [row({ motivo: 'Se reubicará en 6-22' }), row({ motivo: 'Bajó el monto' })];
    expect(construirDesasignadas(rows, { ...SIN_FILTRO, categoria: 'baja' }).total).toBe(1);
    expect(construirDesasignadas(rows, { ...SIN_FILTRO, categoria: 'reubicacion' }).total).toBe(1);
  });

  it('filtra por rango de fecha y proyecto', () => {
    const rows = [
      row({ id: 'a', fecha: '2026-04-30', proyectoNombre: 'Delicias' }),
      row({ id: 'b', fecha: '2026-05-15', proyectoNombre: 'Delicias' }),
      row({ id: 'c', fecha: '2026-05-20', proyectoNombre: 'Ampliación' }),
    ];
    const r = construirDesasignadas(rows, {
      desde: '2026-05-01',
      hasta: '2026-05-31',
      proyecto: 'Delicias',
      categoria: '',
    });
    expect(r.filas.map((f) => f.id)).toEqual(['b']);
  });

  it('agrupa por mes con desglose de categorías', () => {
    const rows = [
      row({ motivo: 'Se reubicará', fecha: '2026-05-10' }),
      row({ motivo: 'Bajó monto', fecha: '2026-05-20' }),
      row({ motivo: 'Bajó monto', fecha: '2026-06-01' }),
    ];
    const r = construirDesasignadas(rows, SIN_FILTRO);
    expect(r.porMes).toEqual([
      { mes: '2026-05', total: 2, reubicaciones: 1, bajas: 1 },
      { mes: '2026-06', total: 1, reubicaciones: 0, bajas: 1 },
    ]);
  });
});
