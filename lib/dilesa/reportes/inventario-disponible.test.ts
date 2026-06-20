import { describe, it, expect } from 'vitest';
import { construirInventarioDisponible } from './inventario-disponible';
import { PRECIO_VACIO, type PrecioDesglose, type UnidadDetalle } from './inventario-data';

function precio(total: number | null): PrecioDesglose {
  return { ...PRECIO_VACIO, total };
}

function u(p: Partial<UnidadDetalle>): UnidadDetalle {
  return {
    id: p.id ?? 'x',
    identificador: p.identificador ?? 'M1-L1',
    identificadorCompleto: p.identificadorCompleto ?? p.identificador ?? 'M1-L1-ISC',
    estado: p.estado ?? 'terminada',
    proyectoId: p.proyectoId ?? null,
    proyectoNombre: p.proyectoNombre ?? 'Delicias',
    prototipo: p.prototipo ?? 'ISC',
    areaM2: p.areaM2 ?? null,
    m2Construccion: p.m2Construccion ?? null,
    esEsquina: p.esEsquina ?? false,
    tieneFrenteVerde: p.tieneFrenteVerde ?? false,
    precio: p.precio ?? precio(null),
  };
}

const SIN_FILTRO = { proyecto: '', prototipo: '', caracteristica: '' as const };

describe('construirInventarioDisponible', () => {
  it('lista las unidades y totaliza disponibles/estado/valor', () => {
    const unidades = [
      u({ estado: 'terminada', precio: precio(100) }),
      u({ estado: 'en_construccion', precio: precio(200) }),
    ];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.totalDisponibles).toBe(2);
    expect(r.terminadas).toBe(1);
    expect(r.enConstruccion).toBe(1);
    expect(r.valorTotal).toBe(300);
  });

  it('trata precio total null como 0 en el valor', () => {
    const r = construirInventarioDisponible([u({ precio: precio(null) })], SIN_FILTRO);
    expect(r.valorTotal).toBe(0);
  });

  it('filtra por proyecto, prototipo y característica', () => {
    const unidades = [
      u({ proyectoNombre: 'Delicias', prototipo: 'ISC', esEsquina: true }),
      u({ proyectoNombre: 'Delicias', prototipo: 'BELO', tieneFrenteVerde: true }),
      u({ proyectoNombre: 'Ampliación', prototipo: 'ISC' }),
    ];
    expect(
      construirInventarioDisponible(unidades, { ...SIN_FILTRO, proyecto: 'Delicias' })
        .totalDisponibles
    ).toBe(2);
    expect(
      construirInventarioDisponible(unidades, { ...SIN_FILTRO, prototipo: 'ISC' }).totalDisponibles
    ).toBe(2);
    expect(
      construirInventarioDisponible(unidades, { ...SIN_FILTRO, caracteristica: 'esquina' })
        .totalDisponibles
    ).toBe(1);
    expect(
      construirInventarioDisponible(unidades, { ...SIN_FILTRO, caracteristica: 'frente_verde' })
        .totalDisponibles
    ).toBe(1);
  });

  it('ordena por proyecto y luego identificador', () => {
    const unidades = [
      u({ proyectoNombre: 'Zaragoza', identificadorCompleto: 'M1-L1-A' }),
      u({ proyectoNombre: 'Ampliación', identificadorCompleto: 'M2-L9-B' }),
      u({ proyectoNombre: 'Ampliación', identificadorCompleto: 'M1-L3-A' }),
    ];
    const r = construirInventarioDisponible(unidades, SIN_FILTRO);
    expect(r.unidades.map((x) => `${x.proyectoNombre}/${x.identificadorCompleto}`)).toEqual([
      'Ampliación/M1-L3-A',
      'Ampliación/M2-L9-B',
      'Zaragoza/M1-L1-A',
    ]);
  });
});
