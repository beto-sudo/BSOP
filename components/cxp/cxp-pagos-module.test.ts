import { describe, expect, it } from 'vitest';
import { filtrarPagosPorEstado } from './cxp-pagos-module';

type EstadoPago = 'programado' | 'aprobado' | 'pagado' | 'rechazado' | 'cancelado';

const PAGOS: { id: string; estado: EstadoPago }[] = [
  { id: 'prog', estado: 'programado' },
  { id: 'aprob', estado: 'aprobado' },
  { id: 'pag', estado: 'pagado' },
  { id: 'canc', estado: 'cancelado' },
  { id: 'rech', estado: 'rechazado' },
];

describe('filtrarPagosPorEstado (CxP · Pagos)', () => {
  it("'pendientes' (default de la vista) incluye programados Y aprobados — un pago aprobado no se pierde", () => {
    expect(filtrarPagosPorEstado(PAGOS, 'pendientes').map((p) => p.id)).toEqual(['prog', 'aprob']);
  });

  it('cadena vacía = todos los estados', () => {
    expect(filtrarPagosPorEstado(PAGOS, '')).toHaveLength(PAGOS.length);
  });

  it('un estado concreto filtra exacto', () => {
    expect(filtrarPagosPorEstado(PAGOS, 'pagado').map((p) => p.id)).toEqual(['pag']);
    expect(filtrarPagosPorEstado(PAGOS, 'cancelado').map((p) => p.id)).toEqual(['canc']);
  });
});
