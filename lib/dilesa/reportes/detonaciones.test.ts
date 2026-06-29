import { describe, expect, it } from 'vitest';
import { construirDetonaciones } from './detonaciones';
import {
  normalizarDepositos,
  normalizarFuente,
  etiquetaFuente,
  proyectosDepositos,
  type DepositoReporteRow,
  type DepositosRawBundle,
} from './detonaciones-data';

function row(overrides: Partial<DepositoReporteRow>): DepositoReporteRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    fecha: '2026-06-15',
    mes: '2026-06',
    monto: 100,
    fuente: 'cliente',
    formaPago: null,
    referencia: null,
    cuentaBancaria: null,
    uuidSat: null,
    ventaId: 'v1',
    cliente: 'Cliente X',
    proyectoId: 'p1',
    proyectoNombre: 'Proyecto 1',
    unidadIdentificador: 'A-1',
    tipoCredito: 'Infonavit',
    faseActual: 'Detonada',
    estadoVenta: 'activa',
    ventaDetonada: true,
    ...overrides,
    // mes deriva de fecha si no se pasa explícito
    ...(overrides.fecha && !overrides.mes ? { mes: overrides.fecha.slice(0, 7) } : {}),
  };
}

describe('normalizarFuente / etiquetaFuente', () => {
  it('mapea cliente / institucion y cae a otro', () => {
    expect(normalizarFuente('cliente')).toBe('cliente');
    expect(normalizarFuente('institucion')).toBe('institucion');
    expect(normalizarFuente('algo')).toBe('otro');
    expect(normalizarFuente(null)).toBe('otro');
  });
  it('etiqueta legible', () => {
    expect(etiquetaFuente('cliente')).toBe('Cliente');
    expect(etiquetaFuente('institucion')).toBe('Institución');
    expect(etiquetaFuente('otro')).toBe('Otro');
  });
});

describe('normalizarDepositos', () => {
  const bundle: DepositosRawBundle = {
    depositos: [
      {
        id: 'd1',
        fecha: '2026-06-10',
        monto_total: 500000,
        fuente: 'institucion',
        forma_pago: 'transferencia',
        referencia: 'REF-1',
        cuenta_bancaria_id: 'c1',
        uuid_sat: 'UUID-1',
        origen_id: 'v1',
      },
      // depósito sin venta ligada
      {
        id: 'd2',
        fecha: '2026-06-12',
        monto_total: 30000,
        fuente: 'cliente',
        forma_pago: null,
        referencia: null,
        cuenta_bancaria_id: null,
        uuid_sat: null,
        origen_id: null,
      },
    ],
    ventas: [
      {
        id: 'v1',
        persona_id: 'per1',
        unidad_id: 'u1',
        tipo_credito: 'Infonavit',
        fase_actual: 'Detonada',
        fase_posicion: 12,
        estado: 'activa',
      },
    ],
    unidades: [{ id: 'u1', identificador: 'A-1', proyecto_id: 'p1' }],
    proyectos: [{ id: 'p1', nombre: 'Lomas' }],
    personas: [
      { id: 'per1', nombre: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Gómez' },
    ],
    cuentas: [{ id: 'c1', nombre: 'BBVA Operativa' }],
  };

  it('liga venta → cliente/unidad/proyecto/cuenta y marca detonada', () => {
    const rows = normalizarDepositos(bundle);
    const d1 = rows.find((r) => r.id === 'd1')!;
    expect(d1.cliente).toBe('Juan Pérez Gómez');
    expect(d1.unidadIdentificador).toBe('A-1');
    expect(d1.proyectoNombre).toBe('Lomas');
    expect(d1.cuentaBancaria).toBe('BBVA Operativa');
    expect(d1.fuente).toBe('institucion');
    expect(d1.mes).toBe('2026-06');
    expect(d1.ventaDetonada).toBe(true);
  });

  it('depósito sin origen_id queda sin venta ligada', () => {
    const rows = normalizarDepositos(bundle);
    const d2 = rows.find((r) => r.id === 'd2')!;
    expect(d2.ventaId).toBeNull();
    expect(d2.cliente).toBe('(sin venta ligada)');
    expect(d2.ventaDetonada).toBe(false);
  });

  it('proyectosDepositos deriva únicos de los ligados', () => {
    const rows = normalizarDepositos(bundle);
    expect(proyectosDepositos(rows)).toEqual([{ id: 'p1', nombre: 'Lomas' }]);
  });
});

describe('construirDetonaciones', () => {
  const rows: DepositoReporteRow[] = [
    row({ id: 'a', fecha: '2026-05-20', monto: 400000, fuente: 'institucion' }),
    row({ id: 'b', fecha: '2026-06-05', monto: 30000, fuente: 'cliente' }),
    row({ id: 'c', fecha: '2026-06-18', monto: 500000, fuente: 'institucion' }),
    row({ id: 'd', fecha: '2026-06-25', monto: 12000, fuente: 'cliente', ventaId: null }),
  ];

  it('totales globales y split por origen', () => {
    const r = construirDetonaciones(rows, { desde: '', hasta: '', fuente: '', proyecto: '' });
    expect(r.totalDepositos).toBe(4);
    expect(r.totalMonto).toBe(942000);
    expect(r.totalInstitucion).toBe(900000);
    expect(r.totalCliente).toBe(42000);
    expect(r.detonaciones).toBe(2);
  });

  it('separa los depósitos sin ligar', () => {
    const r = construirDetonaciones(rows, { desde: '', hasta: '', fuente: '', proyecto: '' });
    expect(r.depositos.map((d) => d.id)).toEqual(['c', 'b', 'a']); // ligados, fecha desc
    expect(r.sinLigar.map((d) => d.id)).toEqual(['d']);
  });

  it('agrupa por mes con split y orden ascendente', () => {
    const r = construirDetonaciones(rows, { desde: '', hasta: '', fuente: '', proyecto: '' });
    expect(r.porMes.map((m) => m.mes)).toEqual(['2026-05', '2026-06']);
    const jun = r.porMes.find((m) => m.mes === '2026-06')!;
    expect(jun.depositos).toBe(3); // b, c, d
    expect(jun.montoInstitucion).toBe(500000);
    expect(jun.montoCliente).toBe(42000);
  });

  it('filtra por rango de fechas', () => {
    const r = construirDetonaciones(rows, {
      desde: '2026-06-01',
      hasta: '2026-06-30',
      fuente: '',
      proyecto: '',
    });
    expect(r.totalDepositos).toBe(3);
    expect(r.depositos.find((d) => d.id === 'a')).toBeUndefined();
  });

  it('filtra solo institución (las detonaciones)', () => {
    const r = construirDetonaciones(rows, {
      desde: '',
      hasta: '',
      fuente: 'institucion',
      proyecto: '',
    });
    expect(r.totalDepositos).toBe(2);
    expect(r.totalCliente).toBe(0);
    expect(r.sinLigar).toHaveLength(0);
  });

  it('al filtrar por proyecto omite los sin ligar', () => {
    const r = construirDetonaciones(rows, { desde: '', hasta: '', fuente: '', proyecto: 'p1' });
    expect(r.sinLigar).toHaveLength(0);
    expect(r.depositos.every((d) => d.proyectoId === 'p1')).toBe(true);
  });
});
