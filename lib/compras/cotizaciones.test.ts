import { describe, expect, it } from 'vitest';
import {
  adjudicaA,
  deriveCotizacionKpis,
  mejorProveedorLinea,
  precioCelda,
  puedeAdjudicar,
  rankingProveedores,
  tieneRespuestas,
  totalProveedor,
  totalProveedorMatriz,
  type CotLinea,
  type CotPrecio,
  type CotProveedor,
  type CotizacionRow,
} from './cotizaciones';

function linea(over: Partial<CotLinea>): CotLinea {
  return {
    id: 'l1',
    partidaId: 'p1',
    partidaLabel: 'Concreto premezclado',
    descripcion: '',
    unidad: 'm3',
    cantidad: 1,
    ...over,
  };
}

function proveedor(over: Partial<CotProveedor>): CotProveedor {
  return {
    id: 'cp1',
    proveedorId: 'pv1',
    proveedorNombre: 'Cemex',
    estado: 'respondida',
    montoTotal: null,
    tiempoEntrega: null,
    condiciones: null,
    notas: null,
    ...over,
  };
}

function precio(over: Partial<CotPrecio>): CotPrecio {
  return { cotProveedorId: 'cp1', lineaId: 'l1', precioUnitario: 0, ...over };
}

function cotizacion(over: Partial<CotizacionRow>): CotizacionRow {
  return {
    id: 'c1',
    codigo: 'RFQ-1',
    tipo: 'compra',
    estado: 'abierta',
    descripcion: '',
    fechaLimite: null,
    proyectoNombre: 'Lomas del Sol',
    adjudicadoProveedorId: null,
    lineas: [],
    proveedores: [],
    precios: [],
    ...over,
  };
}

describe('adjudicaA', () => {
  it('obra → contrato, compra → oc', () => {
    expect(adjudicaA('obra')).toBe('contrato');
    expect(adjudicaA('compra')).toBe('oc');
  });
});

describe('precioCelda / totalProveedorMatriz', () => {
  const precios = [
    precio({ cotProveedorId: 'cpA', lineaId: 'l1', precioUnitario: 100 }),
    precio({ cotProveedorId: 'cpA', lineaId: 'l2', precioUnitario: 50 }),
    precio({ cotProveedorId: 'cpB', lineaId: 'l1', precioUnitario: 90 }),
  ];

  it('precioCelda devuelve el precio o 0 si no cotizó', () => {
    expect(precioCelda(precios, 'cpA', 'l1')).toBe(100);
    expect(precioCelda(precios, 'cpB', 'l2')).toBe(0); // cpB no cotizó l2
  });

  it('total de matriz = Σ cantidad × precio de celda', () => {
    const lineas = [linea({ id: 'l1', cantidad: 2 }), linea({ id: 'l2', cantidad: 3 })];
    // cpA: 2×100 + 3×50 = 350
    expect(totalProveedorMatriz(lineas, precios, 'cpA')).toBe(350);
    // cpB: 2×90 + 3×0 = 180
    expect(totalProveedorMatriz(lineas, precios, 'cpB')).toBe(180);
  });
});

describe('totalProveedor', () => {
  it('usa montoTotal declarado si existe', () => {
    const c = cotizacion({
      lineas: [linea({ id: 'l1', cantidad: 2 })],
      proveedores: [proveedor({ id: 'cpA', montoTotal: 999 })],
      precios: [precio({ cotProveedorId: 'cpA', lineaId: 'l1', precioUnitario: 100 })],
    });
    expect(totalProveedor(c, 'cpA')).toBe(999); // declarado gana sobre la matriz (200)
  });

  it('cae a la matriz cuando montoTotal es null', () => {
    const c = cotizacion({
      lineas: [linea({ id: 'l1', cantidad: 2 })],
      proveedores: [proveedor({ id: 'cpA', montoTotal: null })],
      precios: [precio({ cotProveedorId: 'cpA', lineaId: 'l1', precioUnitario: 100 })],
    });
    expect(totalProveedor(c, 'cpA')).toBe(200);
  });
});

describe('mejorProveedorLinea', () => {
  it('elige el menor precio > 0 e ignora celdas sin cotizar', () => {
    const precios = [
      precio({ cotProveedorId: 'cpA', lineaId: 'l1', precioUnitario: 100 }),
      precio({ cotProveedorId: 'cpB', lineaId: 'l1', precioUnitario: 90 }),
      precio({ cotProveedorId: 'cpC', lineaId: 'l1', precioUnitario: 0 }), // no cotizó
    ];
    expect(mejorProveedorLinea(precios, 'l1')).toBe('cpB');
  });

  it('null si nadie cotizó la línea', () => {
    expect(mejorProveedorLinea([precio({ lineaId: 'l9', precioUnitario: 0 })], 'l1')).toBe(null);
  });
});

describe('rankingProveedores', () => {
  it('ordena por total ascendente y excluye a los que no respondieron', () => {
    const c = cotizacion({
      lineas: [linea({ id: 'l1', cantidad: 1 })],
      proveedores: [
        proveedor({ id: 'cpA', proveedorNombre: 'A', estado: 'respondida' }),
        proveedor({ id: 'cpB', proveedorNombre: 'B', estado: 'respondida' }),
        proveedor({ id: 'cpC', proveedorNombre: 'C', estado: 'invitado' }), // sin responder
      ],
      precios: [
        precio({ cotProveedorId: 'cpA', lineaId: 'l1', precioUnitario: 100 }),
        precio({ cotProveedorId: 'cpB', lineaId: 'l1', precioUnitario: 80 }),
      ],
    });
    const r = rankingProveedores(c);
    expect(r.map((x) => x.cotProveedorId)).toEqual(['cpB', 'cpA']);
    expect(r[0].total).toBe(80);
  });
});

describe('tieneRespuestas / puedeAdjudicar', () => {
  it('tieneRespuestas true con al menos una respondida/elegida', () => {
    expect(tieneRespuestas({ proveedores: [proveedor({ estado: 'invitado' })] })).toBe(false);
    expect(tieneRespuestas({ proveedores: [proveedor({ estado: 'respondida' })] })).toBe(true);
  });

  it('puedeAdjudicar solo si está viva (abierta/comparada) y hay respuestas', () => {
    expect(
      puedeAdjudicar({ estado: 'abierta', proveedores: [proveedor({ estado: 'respondida' })] })
    ).toBe(true);
    expect(
      puedeAdjudicar({ estado: 'comparada', proveedores: [proveedor({ estado: 'elegida' })] })
    ).toBe(true);
    expect(
      puedeAdjudicar({ estado: 'abierta', proveedores: [proveedor({ estado: 'invitado' })] })
    ).toBe(false);
    expect(
      puedeAdjudicar({ estado: 'adjudicada', proveedores: [proveedor({ estado: 'elegida' })] })
    ).toBe(false);
    expect(
      puedeAdjudicar({ estado: 'cancelada', proveedores: [proveedor({ estado: 'respondida' })] })
    ).toBe(false);
  });
});

describe('deriveCotizacionKpis', () => {
  it('cuenta por estado y suma el monto adjudicado del proveedor elegido', () => {
    const adjudicada = cotizacion({
      estado: 'adjudicada',
      lineas: [linea({ id: 'l1', cantidad: 2 })],
      proveedores: [
        proveedor({ id: 'cpA', estado: 'descartada' }),
        proveedor({ id: 'cpB', estado: 'elegida', montoTotal: 500 }),
      ],
      precios: [],
    });
    const rows = [
      cotizacion({ estado: 'abierta' }),
      cotizacion({ estado: 'comparada' }),
      adjudicada,
      cotizacion({ estado: 'cancelada' }),
    ];
    const k = deriveCotizacionKpis(rows);
    expect(k.total).toBe(4);
    expect(k.abiertas).toBe(1);
    expect(k.comparadas).toBe(1);
    expect(k.adjudicadas).toBe(1);
    expect(k.canceladas).toBe(1);
    expect(k.montoAdjudicado).toBe(500); // total del proveedor elegido (cpB)
  });

  it('vacío → todo en cero', () => {
    expect(deriveCotizacionKpis([])).toEqual({
      total: 0,
      abiertas: 0,
      comparadas: 0,
      adjudicadas: 0,
      canceladas: 0,
      montoAdjudicado: 0,
    });
  });
});
