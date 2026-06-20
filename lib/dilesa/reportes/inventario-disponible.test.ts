import { describe, it, expect } from 'vitest';
import { construirInventarioDisponible } from './inventario-disponible';
import type { UnidadDisponible } from './inventario-data';

function u(p: Partial<UnidadDisponible>): UnidadDisponible {
  return {
    id: p.id ?? 'x',
    estado: p.estado ?? 'terminada',
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? 'Delicias',
    prototipo: p.prototipo === undefined ? 'ISC' : p.prototipo,
  };
}

const SIN_FILTRO = { proyecto: '', prototipo: '' };

describe('construirInventarioDisponible', () => {
  it('agrupa por proyecto + prototipo con desglose de estado', () => {
    const unidades = [
      u({ proyectoNombre: 'Delicias', prototipo: 'ISC', estado: 'terminada' }),
      u({ proyectoNombre: 'Delicias', prototipo: 'ISC', estado: 'en_construccion' }),
      u({ proyectoNombre: 'Delicias', prototipo: 'BELO', estado: 'terminada' }),
    ];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.grupos).toHaveLength(2);
    const isc = r.grupos.find((g) => g.prototipo === 'ISC')!;
    expect(isc.disponibles).toBe(2);
    expect(isc.enConstruccion).toBe(1);
    expect(isc.terminadas).toBe(1);
  });

  it('totaliza disponibles, en construcción, terminadas y proyectos', () => {
    const unidades = [
      u({ proyectoNombre: 'Delicias', estado: 'terminada' }),
      u({ proyectoNombre: 'Delicias', estado: 'en_construccion' }),
      u({ proyectoNombre: 'Ampliación', estado: 'terminada' }),
    ];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.totalDisponibles).toBe(3);
    expect(r.totalEnConstruccion).toBe(1);
    expect(r.totalTerminadas).toBe(2);
    expect(r.totalProyectos).toBe(2);
  });

  it('filtra por proyecto y por prototipo', () => {
    const unidades = [
      u({ proyectoNombre: 'Delicias', prototipo: 'ISC' }),
      u({ proyectoNombre: 'Delicias', prototipo: 'BELO' }),
      u({ proyectoNombre: 'Ampliación', prototipo: 'ISC' }),
    ];
    expect(
      construirInventarioDisponible(unidades, { proyecto: 'Delicias', prototipo: '' })
        .totalDisponibles
    ).toBe(2);
    expect(
      construirInventarioDisponible(unidades, { proyecto: '', prototipo: 'ISC' }).totalDisponibles
    ).toBe(2);
    expect(
      construirInventarioDisponible(unidades, { proyecto: 'Delicias', prototipo: 'ISC' })
        .totalDisponibles
    ).toBe(1);
  });

  it('agrupa unidades sin prototipo bajo una etiqueta', () => {
    const unidades = [u({ prototipo: null, estado: 'terminada' })];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.grupos[0].prototipo).toBe('(sin prototipo)');
    expect(r.grupos[0].disponibles).toBe(1);
  });

  it('ordena por proyecto y luego prototipo', () => {
    const unidades = [
      u({ proyectoNombre: 'Zaragoza', prototipo: 'B' }),
      u({ proyectoNombre: 'Ampliación', prototipo: 'Z' }),
      u({ proyectoNombre: 'Ampliación', prototipo: 'A' }),
    ];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.grupos.map((g) => `${g.proyecto}/${g.prototipo}`)).toEqual([
      'Ampliación/A',
      'Ampliación/Z',
      'Zaragoza/B',
    ]);
  });
});
