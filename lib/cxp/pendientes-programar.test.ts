import { describe, expect, it } from 'vitest';
import { pendientesDeProgramar, type AplicacionViva } from './pendientes-programar';

type F = { id: string; saldo: number };

const f = (id: string, saldo: number): F => ({ id, saldo });
const app = (factura_id: string, monto_aplicado: number | null): AplicacionViva => ({
  factura_id,
  monto_aplicado,
});

describe('pendientesDeProgramar (CxP · Programación, hotfix 2026-06-11)', () => {
  it('sin pagos vivos, todo el saldo queda por programar', () => {
    const out = pendientesDeProgramar([f('a', 1000)], []);
    expect(out).toEqual([{ id: 'a', saldo: 1000, comprometido: 0, porProgramar: 1000 }]);
  });

  it('excluye facturas totalmente comprometidas en pagos vivos', () => {
    const out = pendientesDeProgramar([f('a', 1000), f('b', 500)], [app('a', 1000)]);
    expect(out.map((x) => x.id)).toEqual(['b']);
  });

  it('factura parcialmente comprometida queda con el resto por programar', () => {
    const out = pendientesDeProgramar([f('a', 1000)], [app('a', 400)]);
    expect(out).toEqual([{ id: 'a', saldo: 1000, comprometido: 400, porProgramar: 600 }]);
  });

  it('suma varias aplicaciones a la misma factura', () => {
    const out = pendientesDeProgramar([f('a', 1000)], [app('a', 300), app('a', 700)]);
    expect(out).toEqual([]);
  });

  it('tolera monto_aplicado null y aplicaciones de facturas fuera de la lista', () => {
    const out = pendientesDeProgramar([f('a', 1000)], [app('a', null), app('zzz', 999)]);
    expect(out).toEqual([{ id: 'a', saldo: 1000, comprometido: 0, porProgramar: 1000 }]);
  });

  it('redondea a centavos: residuo flotante no deja la factura viva', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — sin round quedaría porProgramar ≈ -4e-17 ≤ 0
    // pero un residuo POSITIVO (p.ej. 1e-13) la dejaría listada con $0.00.
    const out = pendientesDeProgramar([f('a', 0.3)], [app('a', 0.1), app('a', 0.2)]);
    expect(out).toEqual([]);
  });

  it('caso real del bug (A.S. Morado): 3 facturas con pagos programados/aprobados → lista vacía', () => {
    const facturas = [f('f-220', 220000), f('f-86', 86000), f('f-195', 195000)];
    const aplicaciones = [app('f-220', 220000), app('f-86', 86000), app('f-195', 195000)];
    expect(pendientesDeProgramar(facturas, aplicaciones)).toEqual([]);
  });

  it('preserva los campos extra de la factura (passthrough genérico)', () => {
    const out = pendientesDeProgramar([{ id: 'a', saldo: 100, proveedor: 'X' }], [app('a', 40)]);
    expect(out[0]).toMatchObject({ proveedor: 'X', comprometido: 40, porProgramar: 60 });
  });
});
