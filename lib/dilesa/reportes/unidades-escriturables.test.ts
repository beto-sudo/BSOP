import { describe, expect, it } from 'vitest';
import {
  normalizarEscriturables,
  type EscriturablesBundle,
  type UnidadEscriturableRaw,
  type UnidadEscriturableRow,
} from './escriturables-data';
import {
  construirUnidadesEscriturables,
  estatusEscriturable,
  FILTROS_ESCRITURABLES_DEFAULT,
} from './unidades-escriturables';

function unidad(overrides: Partial<UnidadEscriturableRaw>): UnidadEscriturableRaw {
  return {
    id: 'u1',
    identificador: 'M1-L1',
    estado: 'terminada',
    proyecto_id: 'p1',
    producto_id: null,
    fecha_dtu: null,
    fecha_extraccion: null,
    activo_id: null,
    ...overrides,
  };
}

function bundle(overrides: Partial<EscriturablesBundle>): EscriturablesBundle {
  return {
    unidades: [],
    ventas: [],
    obras: [],
    proyectos: [{ id: 'p1', nombre: 'Lomas' }],
    productos: [{ id: 'prod1', nombre: 'LDLE-ISC' }],
    clientes: new Map([['per1', 'Ana García']]),
    vendedores: new Map([['usr1', 'Pedro Vendedor']]),
    diasEnFase: new Map([['v1', 42]]),
    ...overrides,
  };
}

const venta = (overrides: Partial<EscriturablesBundle['ventas'][number]>) => ({
  id: 'v1',
  unidad_id: 'a',
  persona_id: 'per1',
  fase_actual: null,
  vendedor: null,
  vendedor_usuario_id: null,
  ...overrides,
});

describe('normalizarEscriturables (universo candidato)', () => {
  it('inventario: en_construccion/terminada sin activo_id entran; planeada/lote no', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [
          unidad({ id: 'a', estado: 'terminada' }),
          unidad({ id: 'b', estado: 'en_construccion' }),
          unidad({ id: 'c', estado: 'planeada' }),
          unidad({ id: 'd', estado: 'lote_urbanizado' }),
        ],
      })
    );
    expect(rows.map((r) => r.unidadId).sort()).toEqual(['a', 'b']);
    expect(rows.every((r) => r.situacion === 'inventario')).toBe(true);
  });

  it('liberadas al portafolio (activo_id) quedan fuera del inventario', () => {
    const rows = normalizarEscriturables(bundle({ unidades: [unidad({ activo_id: 'act1' })] }));
    expect(rows).toHaveLength(0);
  });

  it('venta activa sin escriturar convierte la unidad en asignada, con cliente, fase y días', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [unidad({ id: 'a', estado: 'vendida' })],
        ventas: [venta({ fase_actual: 'Detonada' })],
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.situacion).toBe('asignada');
    expect(rows[0]?.cliente).toBe('Ana García');
    expect(rows[0]?.faseActual).toBe('Detonada');
    expect(rows[0]?.diasEnFase).toBe(42);
  });

  it('vendedor: FK a core.usuarios con fallback al texto legacy', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [unidad({ id: 'a', estado: 'vendida' }), unidad({ id: 'b', estado: 'vendida' })],
        ventas: [
          venta({ id: 'v1', unidad_id: 'a', vendedor_usuario_id: 'usr1', vendedor: 'Legacy P.' }),
          venta({ id: 'v2', unidad_id: 'b', vendedor: 'María Legacy' }),
        ],
      })
    );
    const por = new Map(rows.map((r) => [r.unidadId, r]));
    expect(por.get('a')?.vendedor).toBe('Pedro Vendedor'); // FK gana
    expect(por.get('b')?.vendedor).toBe('María Legacy'); // sin FK → legacy
  });

  it('unidad vendida SIN venta activa (ya escriturada) queda fuera', () => {
    const rows = normalizarEscriturables(bundle({ unidades: [unidad({ estado: 'vendida' })] }));
    expect(rows).toHaveLength(0);
  });

  it('escriturable = obra terminada + extracción capturada', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [
          unidad({ id: 'a', estado: 'terminada', fecha_extraccion: '2026-06-01' }),
          unidad({ id: 'b', estado: 'terminada', fecha_extraccion: null }),
          unidad({ id: 'c', estado: 'en_construccion', fecha_extraccion: '2026-06-01' }),
        ],
      })
    );
    const por = new Map(rows.map((r) => [r.unidadId, r]));
    expect(por.get('a')?.escriturable).toBe(true);
    expect(por.get('b')?.escriturable).toBe(false); // falta extracción
    expect(por.get('c')?.escriturable).toBe(false); // obra en proceso
  });

  it('asignada con estado comercial: la obra terminada sale de dilesa.construccion', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [unidad({ id: 'a', estado: 'vendida', fecha_extraccion: '2026-06-01' })],
        ventas: [venta({})],
        obras: [{ unidad_id: 'a', fecha_terminada: '2026-03-15', estado: 'terminada' }],
      })
    );
    expect(rows[0]?.obraTerminada).toBe(true);
    expect(rows[0]?.fechaObraTerminada).toBe('2026-03-15');
    expect(rows[0]?.escriturable).toBe(true);
  });

  it('varias construcciones: gana la fecha_terminada más reciente', () => {
    const rows = normalizarEscriturables(
      bundle({
        unidades: [unidad({ id: 'a', estado: 'terminada' })],
        obras: [
          { unidad_id: 'a', fecha_terminada: '2025-01-01', estado: 'terminada' },
          { unidad_id: 'a', fecha_terminada: '2026-02-02', estado: 'terminada' },
        ],
      })
    );
    expect(rows[0]?.fechaObraTerminada).toBe('2026-02-02');
  });

  it('identificador completo lleva el sufijo del prototipo', () => {
    const rows = normalizarEscriturables(bundle({ unidades: [unidad({ producto_id: 'prod1' })] }));
    expect(rows[0]?.identificadorCompleto).toBe('M1-L1-ISC');
    expect(rows[0]?.prototipo).toBe('LDLE-ISC');
  });
});

function row(overrides: Partial<UnidadEscriturableRow>): UnidadEscriturableRow {
  return {
    unidadId: 'u1',
    identificadorCompleto: 'M1-L1',
    proyectoNombre: 'Lomas',
    prototipo: null,
    situacion: 'inventario',
    cliente: null,
    faseActual: null,
    diasEnFase: null,
    vendedor: null,
    obraTerminada: true,
    fechaObraTerminada: null,
    fechaDtu: '2026-05-01',
    fechaExtraccion: '2026-06-01',
    escriturable: true,
    ...overrides,
  };
}

describe('construirUnidadesEscriturables (motor del reporte)', () => {
  const dataset = [
    row({ unidadId: 'a', situacion: 'inventario' }), // escriturable inventario
    row({ unidadId: 'b', situacion: 'asignada', cliente: 'Ana' }), // escriturable asignada
    row({ unidadId: 'c', fechaExtraccion: null, escriturable: false }), // falta EXT
    row({ unidadId: 'd', obraTerminada: false, escriturable: false }), // obra en proceso
    row({ unidadId: 'e', proyectoNombre: 'Bosques' }), // otro proyecto
  ];

  it('default (solo escriturables): la lista excluye las que no están listas', () => {
    const r = construirUnidadesEscriturables(dataset, FILTROS_ESCRITURABLES_DEFAULT);
    expect(r.unidades.map((u) => u.unidadId).sort()).toEqual(['a', 'b', 'e']);
    expect(r.totalCandidatas).toBe(5);
    expect(r.escriturables).toBe(3);
  });

  it('mostrar=todas incluye el universo candidato completo', () => {
    const r = construirUnidadesEscriturables(dataset, {
      ...FILTROS_ESCRITURABLES_DEFAULT,
      mostrar: 'todas',
    });
    expect(r.unidades).toHaveLength(5);
  });

  it('KPIs: desglose inventario/asignadas y qué detiene al resto', () => {
    const r = construirUnidadesEscriturables(dataset, {
      ...FILTROS_ESCRITURABLES_DEFAULT,
      mostrar: 'todas',
    });
    expect(r.enInventario).toBe(2); // a + e
    expect(r.asignadas).toBe(1); // b
    expect(r.faltaExtraccion).toBe(1); // c
    expect(r.obraEnProceso).toBe(1); // d
  });

  it('filtro por proyecto y situación recorta candidatas y KPIs', () => {
    const r = construirUnidadesEscriturables(dataset, {
      proyecto: 'Lomas',
      situacion: 'asignada',
      mostrar: 'todas',
    });
    expect(r.totalCandidatas).toBe(1);
    expect(r.unidades[0]?.unidadId).toBe('b');
  });

  it('ordena por proyecto y luego identificador', () => {
    const r = construirUnidadesEscriturables(dataset, FILTROS_ESCRITURABLES_DEFAULT);
    expect(r.unidades[0]?.proyectoNombre).toBe('Bosques');
  });
});

describe('estatusEscriturable', () => {
  it('escriturable / falta extracción / obra en proceso', () => {
    expect(estatusEscriturable(row({}))).toBe('Escriturable');
    expect(
      estatusEscriturable(row({ escriturable: false, obraTerminada: true, fechaExtraccion: null }))
    ).toBe('Falta extracción');
    expect(estatusEscriturable(row({ escriturable: false, obraTerminada: false }))).toBe(
      'Obra en proceso'
    );
  });
});
