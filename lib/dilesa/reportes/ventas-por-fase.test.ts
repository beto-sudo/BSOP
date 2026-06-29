import { describe, expect, it } from 'vitest';
import { construirVentasPorFase, POSICION_DEFAULT, POSICION_TODAS } from './ventas-por-fase';
import {
  normalizarVentasPorFase,
  proyectosVentasPorFase,
  type VentaFaseReporteRow,
  type VentasPorFaseRawBundle,
} from './ventas-por-fase-data';

function row(overrides: Partial<VentaFaseReporteRow>): VentaFaseReporteRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    ventaId: 'v1',
    fecha: '2026-06-15',
    mes: '2026-06',
    posicion: 12,
    faseNombre: 'Detonada',
    cliente: 'Cliente X',
    proyectoId: 'p1',
    proyectoNombre: 'Proyecto 1',
    unidadIdentificador: 'A-1',
    tipoCredito: 'Infonavit',
    vendedor: 'Vendedor Y',
    faseActualVenta: 'Detonada',
    estadoVenta: 'activa',
    valor: 900000,
    ...overrides,
    ...(overrides.fecha && !overrides.mes ? { mes: overrides.fecha.slice(0, 7) } : {}),
  };
}

describe('normalizarVentasPorFase', () => {
  const bundle: VentasPorFaseRawBundle = {
    fases: [
      { id: 'f1', venta_id: 'v1', posicion: 12, fecha: '2026-06-10' },
      { id: 'f2', venta_id: 'v1', posicion: 11, fecha: '2026-05-30' },
      // descartado: sin fecha
      { id: 'f3', venta_id: 'v1', posicion: 13, fecha: null },
      // descartado: venta inexistente
      { id: 'f4', venta_id: 'zzz', posicion: 12, fecha: '2026-06-11' },
    ],
    ventas: [
      {
        id: 'v1',
        persona_id: 'per1',
        unidad_id: 'u1',
        tipo_credito: 'Infonavit',
        vendedor: 'Ana',
        fase_actual: 'Detonada',
        estado: 'activa',
        valor_comercial: 800000,
        precio_asignacion: 950000,
      },
    ],
    unidades: [{ id: 'u1', identificador: 'MZ1-L2', proyecto_id: 'p1' }],
    proyectos: [{ id: 'p1', nombre: 'Las Lomas' }],
    personas: [
      { id: 'per1', nombre: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Gómez' },
    ],
  };

  it('descarta sin fecha y sin venta; usa precio_asignacion como valor', () => {
    const filas = normalizarVentasPorFase(bundle);
    expect(filas).toHaveLength(2);
    const det = filas.find((f) => f.posicion === 12)!;
    expect(det.cliente).toBe('Juan Pérez Gómez');
    expect(det.unidadIdentificador).toBe('MZ1-L2');
    expect(det.proyectoNombre).toBe('Las Lomas');
    expect(det.valor).toBe(950000);
    expect(det.faseNombre).toBe('Detonada');
  });

  it('cae a valor_comercial si no hay precio_asignacion', () => {
    const filas = normalizarVentasPorFase({
      ...bundle,
      ventas: [{ ...bundle.ventas[0], precio_asignacion: null }],
    });
    expect(filas.find((f) => f.posicion === 12)!.valor).toBe(800000);
  });
});

describe('construirVentasPorFase', () => {
  const filas = [
    row({ id: 'a', posicion: 12, fecha: '2026-06-05', valor: 900000 }),
    row({ id: 'b', posicion: 12, fecha: '2026-06-20', valor: 800000 }),
    row({ id: 'c', posicion: 12, fecha: '2026-05-15', valor: 700000 }),
    row({ id: 'd', posicion: 11, fecha: '2026-06-10', valor: 600000, faseNombre: 'Escriturada' }),
  ];

  it('filtra por fase y rango; cuenta y suma valor', () => {
    const r = construirVentasPorFase(filas, {
      posicion: 12,
      desde: '2026-06-01',
      hasta: '2026-06-30',
      proyecto: '',
    });
    expect(r.totalVentas).toBe(2);
    expect(r.totalValor).toBe(1700000);
    expect(r.multiFase).toBe(false);
    // orden por fecha desc
    expect(r.filas.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('posicion 0 = todas las fases (multiFase)', () => {
    const r = construirVentasPorFase(filas, {
      posicion: POSICION_TODAS,
      desde: '2026-06-01',
      hasta: '2026-06-30',
      proyecto: '',
    });
    expect(r.totalVentas).toBe(3); // a, b (fase 12) + d (fase 11)
    expect(r.multiFase).toBe(true);
  });

  it('desglose por mes ascendente', () => {
    const r = construirVentasPorFase(filas, {
      posicion: 12,
      desde: '',
      hasta: '',
      proyecto: '',
    });
    expect(r.porMes.map((m) => m.mes)).toEqual(['2026-05', '2026-06']);
    expect(r.porMes[1]).toMatchObject({ mes: '2026-06', ventas: 2, valor: 1700000 });
  });

  it('filtra por proyecto', () => {
    const conProyecto = [
      row({ id: 'x', posicion: 12, fecha: '2026-06-05', proyectoId: 'p1' }),
      row({ id: 'y', posicion: 12, fecha: '2026-06-06', proyectoId: 'p2' }),
    ];
    const r = construirVentasPorFase(conProyecto, {
      posicion: 12,
      desde: '',
      hasta: '',
      proyecto: 'p2',
    });
    expect(r.filas.map((f) => f.id)).toEqual(['y']);
  });

  it('POSICION_DEFAULT es Detonada (12)', () => {
    expect(POSICION_DEFAULT).toBe(12);
  });
});

describe('proyectosVentasPorFase', () => {
  it('únicos por id, ordenados por nombre', () => {
    const ps = proyectosVentasPorFase([
      row({ proyectoId: 'p2', proyectoNombre: 'Bosques' }),
      row({ proyectoId: 'p1', proyectoNombre: 'Alamedas' }),
      row({ proyectoId: 'p2', proyectoNombre: 'Bosques' }),
    ]);
    expect(ps).toEqual([
      { id: 'p1', nombre: 'Alamedas' },
      { id: 'p2', nombre: 'Bosques' },
    ]);
  });
});
