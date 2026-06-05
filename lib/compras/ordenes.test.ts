import { describe, expect, it } from 'vitest';
import {
  comprometeOc,
  deriveOcKpis,
  lineaPendiente,
  lineaTotal,
  ocTienePendiente,
  ocTotal,
  type OcLinea,
  type OcRow,
} from './ordenes';

function linea(over: Partial<OcLinea>): OcLinea {
  return {
    id: 'l',
    partidaId: 'p',
    partidaLabel: 'Red de agua potable',
    descripcion: '',
    unidad: null,
    cantidad: 1,
    cantidadRecibida: 0,
    cantidadCancelada: 0,
    precioUnitario: 0,
    ...over,
  };
}

function oc(over: Partial<OcRow>): OcRow {
  return {
    id: 'o',
    codigo: 'OC-1',
    proyectoId: 'pr',
    proyectoNombre: 'Lomas',
    proveedorId: 'pv',
    proveedorNombre: 'Electrogaza',
    estado: 'borrador',
    fecha: null,
    lineas: [],
    ...over,
  };
}

describe('lineaTotal / ocTotal', () => {
  it('línea = cantidad × precio', () => {
    expect(lineaTotal(linea({ cantidad: 3, precioUnitario: 100 }))).toBe(300);
  });
  it('OC = Σ líneas', () => {
    const o = oc({
      lineas: [
        linea({ cantidad: 2, precioUnitario: 50 }),
        linea({ cantidad: 1, precioUnitario: 100 }),
      ],
    });
    expect(ocTotal(o)).toBe(200);
  });
  it('null-safe en cantidad/precio', () => {
    expect(
      lineaTotal(linea({ cantidad: undefined as unknown as number, precioUnitario: 10 }))
    ).toBe(0);
  });
});

describe('lineaPendiente / ocTienePendiente', () => {
  it('pendiente = pedida − recibida − cancelada', () => {
    expect(lineaPendiente(linea({ cantidad: 10, cantidadRecibida: 3, cantidadCancelada: 2 }))).toBe(
      5
    );
  });
  it('nunca negativo', () => {
    expect(lineaPendiente(linea({ cantidad: 5, cantidadRecibida: 5, cantidadCancelada: 1 }))).toBe(
      0
    );
  });
  it('ocTienePendiente true si alguna línea tiene pendiente', () => {
    const o = oc({
      lineas: [
        linea({ cantidad: 2, cantidadRecibida: 2 }),
        linea({ cantidad: 3, cantidadRecibida: 1 }),
      ],
    });
    expect(ocTienePendiente(o)).toBe(true);
  });
  it('ocTienePendiente false si todo recibido/cancelado', () => {
    const o = oc({ lineas: [linea({ cantidad: 2, cantidadRecibida: 2 })] });
    expect(ocTienePendiente(o)).toBe(false);
  });
});

describe('comprometeOc', () => {
  it('enviada/parcial/cerrada comprometen', () => {
    expect(comprometeOc('enviada')).toBe(true);
    expect(comprometeOc('parcial')).toBe(true);
    expect(comprometeOc('cerrada')).toBe(true);
  });
  it('borrador/cancelada NO comprometen', () => {
    expect(comprometeOc('borrador')).toBe(false);
    expect(comprometeOc('cancelada')).toBe(false);
  });
});

describe('deriveOcKpis', () => {
  it('cuenta por estado y suma comprometido solo de las que comprometen', () => {
    const rows = [
      oc({ estado: 'borrador', lineas: [linea({ cantidad: 1, precioUnitario: 1000 })] }),
      oc({ estado: 'enviada', lineas: [linea({ cantidad: 1, precioUnitario: 2000 })] }),
      oc({ estado: 'parcial', lineas: [linea({ cantidad: 1, precioUnitario: 500 })] }),
      oc({ estado: 'cerrada', lineas: [linea({ cantidad: 1, precioUnitario: 300 })] }),
      oc({ estado: 'cancelada', lineas: [linea({ cantidad: 1, precioUnitario: 9999 })] }),
    ];
    const k = deriveOcKpis(rows);
    expect(k.total).toBe(5);
    expect(k.borrador).toBe(1);
    expect(k.activas).toBe(2); // enviada + parcial
    expect(k.cerradas).toBe(1);
    // comprometido = 2000 + 500 + 300 (borrador y cancelada excluidas)
    expect(k.comprometido).toBe(2800);
  });

  it('vacío → todo en cero', () => {
    expect(deriveOcKpis([])).toEqual({
      total: 0,
      borrador: 0,
      activas: 0,
      cerradas: 0,
      comprometido: 0,
    });
  });
});
