import { describe, it, expect } from 'vitest';
import { normalizarVentas, proyectosPresentes, type VentasRawBundle } from './ventas-data';

const baseBundle: VentasRawBundle = {
  ventas: [],
  unidades: [{ id: 'u1', identificador: 'M1-L1', proyecto_id: 'p1' }],
  proyectos: [{ id: 'p1', nombre: 'Delicias' }],
  personas: [{ id: 'per1', nombre: 'Juan', apellido_paterno: 'Pérez', apellido_materno: null }],
  usuarios: [{ id: 'us1', first_name: 'Ana', last_name: 'López', email: 'ana@dilesa.mx' }],
};

function ventaRaw(p: Partial<VentasRawBundle['ventas'][number]>) {
  return {
    id: p.id ?? 'v1',
    estado: p.estado ?? 'activa',
    fase_actual: p.fase_actual ?? null,
    fase_posicion: p.fase_posicion ?? null,
    valor_escrituracion: p.valor_escrituracion ?? null,
    valor_comercial: p.valor_comercial ?? null,
    unidad_id: p.unidad_id ?? null,
    persona_id: p.persona_id ?? 'per1',
    numero_escritura: p.numero_escritura ?? null,
    fecha_escritura: p.fecha_escritura ?? null,
    vendedor: p.vendedor ?? null,
    vendedor_usuario_id: p.vendedor_usuario_id ?? null,
    tipo_credito: p.tipo_credito ?? null,
    fecha_firma_programada: p.fecha_firma_programada ?? null,
    hora_firma_programada: p.hora_firma_programada ?? null,
    created_at: p.created_at ?? '2026-03-15T10:00:00Z',
  };
}

describe('normalizarVentas', () => {
  it('resuelve precio efectivo: escrituración con prioridad sobre comercial', () => {
    const r = normalizarVentas({
      ...baseBundle,
      ventas: [
        ventaRaw({ id: 'a', valor_escrituracion: 900, valor_comercial: 800 }),
        ventaRaw({ id: 'b', valor_escrituracion: null, valor_comercial: 800 }),
      ],
    });
    expect(r.find((x) => x.id === 'a')!.precio).toBe(900);
    expect(r.find((x) => x.id === 'b')!.precio).toBe(800);
  });

  it('resuelve vendedor por FK a usuarios, con fallback al texto legacy', () => {
    const r = normalizarVentas({
      ...baseBundle,
      ventas: [
        ventaRaw({ id: 'a', vendedor_usuario_id: 'us1', vendedor: 'IGNORAR' }),
        ventaRaw({ id: 'b', vendedor_usuario_id: null, vendedor: 'Legacy Coda' }),
      ],
    });
    expect(r.find((x) => x.id === 'a')!.vendedor).toBe('Ana López');
    expect(r.find((x) => x.id === 'b')!.vendedor).toBe('Legacy Coda');
  });

  it('resuelve cliente, proyecto y unidad vía los catálogos', () => {
    const r = normalizarVentas({
      ...baseBundle,
      ventas: [ventaRaw({ unidad_id: 'u1', persona_id: 'per1' })],
    });
    expect(r[0].cliente).toBe('Juan Pérez');
    expect(r[0].proyectoNombre).toBe('Delicias');
    expect(r[0].proyectoId).toBe('p1');
    expect(r[0].unidadIdentificador).toBe('M1-L1');
  });

  it('deriva mes de creación y de escritura (null si no escritura)', () => {
    const r = normalizarVentas({
      ...baseBundle,
      ventas: [
        ventaRaw({ id: 'a', created_at: '2026-03-15T10:00:00Z', fecha_escritura: '2026-05-20' }),
        ventaRaw({ id: 'b', created_at: '2026-04-01T00:00:00Z', fecha_escritura: null }),
      ],
    });
    expect(r.find((x) => x.id === 'a')!.mesCreacion).toBe('2026-03');
    expect(r.find((x) => x.id === 'a')!.mesEscritura).toBe('2026-05');
    expect(r.find((x) => x.id === 'b')!.mesEscritura).toBeNull();
  });
});

describe('proyectosPresentes', () => {
  // El catálogo `dilesa.proyectos` trae nombres duplicados (cascarones de import
  // sin ventas): p1 y p2 se llaman ambos "Delicias", pero solo p1 tiene ventas.
  const bundle: VentasRawBundle = {
    proyectos: [
      { id: 'p1', nombre: 'Delicias' },
      { id: 'p2', nombre: 'Delicias' }, // duplicado de nombre, sin ventas
      { id: 'p3', nombre: 'Encinos' },
    ],
    unidades: [
      { id: 'u1', identificador: 'M1-L1', proyecto_id: 'p1' },
      { id: 'u3', identificador: 'M3-L3', proyecto_id: 'p3' },
    ],
    personas: [{ id: 'per1', nombre: 'Juan', apellido_paterno: 'Pérez', apellido_materno: null }],
    usuarios: [],
    ventas: [
      ventaRaw({ id: 'a', unidad_id: 'u1' }), // p1 Delicias
      ventaRaw({ id: 'b', unidad_id: 'u1' }), // p1 Delicias (mismo proyecto)
      ventaRaw({ id: 'c', unidad_id: 'u3' }), // p3 Encinos
      ventaRaw({ id: 'd', unidad_id: null }), // sin proyecto
    ],
  };

  it('deriva proyectos de las ventas, únicos por id y ordenados por nombre', () => {
    const r = proyectosPresentes(normalizarVentas(bundle));
    expect(r.map((p) => p.nombre)).toEqual(['Delicias', 'Encinos']);
    expect(r.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('excluye el nombre duplicado del catálogo que no tiene ventas (p2)', () => {
    const r = proyectosPresentes(normalizarVentas(bundle));
    expect(r).toHaveLength(2);
    expect(r.some((p) => p.id === 'p2')).toBe(false);
  });

  it('omite ventas sin proyecto y no rompe con dataset vacío', () => {
    expect(proyectosPresentes([])).toEqual([]);
  });
});
