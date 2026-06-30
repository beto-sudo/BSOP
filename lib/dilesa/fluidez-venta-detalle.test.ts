import { describe, expect, it } from 'vitest';
import { fluidezDeVenta, type FaseAlcanzada, type VaraRef } from './fluidez-venta-detalle';

const hoy = new Date('2026-06-29T12:00:00Z');
const vara = new Map<number, VaraRef>([
  [1, { vara: 0, p90: 3 }],
  [2, { vara: 1, p90: 5 }],
  [3, { vara: 4, p90: 100 }],
]);

describe('fluidezDeVenta', () => {
  it('mide tramos cerrados entre fases alcanzadas consecutivas', () => {
    const alcanzadas: FaseAlcanzada[] = [
      { posicion: 1, fase: 'Asignación Solicitada', fecha: '2026-06-01' },
      { posicion: 2, fase: 'Asignada', fecha: '2026-06-02' }, // fase 1 duró 1 día
      { posicion: 3, fase: 'Formalizada', fecha: '2026-06-10' }, // fase 2 duró 8 días
    ];
    const r = fluidezDeVenta(alcanzadas, vara, { hoy, faseActualPos: 3 });
    expect(r.filas.find((f) => f.posicion === 1)?.dias).toBe(1);
    expect(r.filas.find((f) => f.posicion === 2)?.dias).toBe(8);
  });

  it('la fase actual cuenta permanencia abierta (hoy − entrada) y marca enCurso', () => {
    const alcanzadas: FaseAlcanzada[] = [
      { posicion: 3, fase: 'Formalizada', fecha: '2026-06-09' }, // 20 días a hoy
    ];
    const r = fluidezDeVenta(alcanzadas, vara, { hoy, faseActualPos: 3 });
    const f3 = r.filas.find((f) => f.posicion === 3)!;
    expect(f3.enCurso).toBe(true);
    expect(f3.dias).toBe(20);
    expect(f3.vara).toBe(4);
    // 20 > p90 100? no → 20 > mediana(vara) 4 → ámbar
    expect(f3.banda).toBe('ambar');
    expect(r.actual?.posicion).toBe(3);
  });

  it('siempre devuelve 14 filas; las no alcanzadas van sin días ni banda', () => {
    const r = fluidezDeVenta([{ posicion: 1, fase: 'X', fecha: '2026-06-01' }], vara, {
      hoy,
      faseActualPos: 1,
    });
    expect(r.filas).toHaveLength(14);
    const f10 = r.filas.find((f) => f.posicion === 10)!;
    expect(f10.alcanzada).toBe(false);
    expect(f10.dias).toBeNull();
    expect(f10.banda).toBeNull();
  });

  it('resume medibles / en objetivo / críticas', () => {
    const alcanzadas: FaseAlcanzada[] = [
      { posicion: 1, fase: 'A', fecha: '2026-06-01' }, // 0 días → verde (≤ vara 0)
      { posicion: 2, fase: 'B', fecha: '2026-06-01' }, // dura hasta fase 3 = 14 días
      { posicion: 3, fase: 'C', fecha: '2026-06-15' }, // fase 2 = 14 días > p90 5 → rojo; fase 3 en curso 14 d
    ];
    const r = fluidezDeVenta(alcanzadas, vara, { hoy, faseActualPos: 3 });
    expect(r.medibles).toBe(3); // fases 1 y 2 cerradas + 3 en curso
    expect(r.filas.find((f) => f.posicion === 1)?.banda).toBe('verde');
    expect(r.filas.find((f) => f.posicion === 2)?.banda).toBe('rojo');
    expect(r.enObjetivo).toBe(1);
    expect(r.criticas).toBe(1);
  });
});
