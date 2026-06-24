import { describe, it, expect } from 'vitest';
import { FASES_VENTA, nombreFase, accionFase, proximaFase } from './fases';

describe('fases.ts — estado (participio) vs acción (infinitivo)', () => {
  it('las 17 fases tienen estado (nombre) y acción, en orden 1..17', () => {
    expect(FASES_VENTA).toHaveLength(17);
    expect(FASES_VENTA.map((f) => f.posicion)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    for (const f of FASES_VENTA) {
      expect(f.nombre.length).toBeGreaterThan(0);
      expect(f.accion.length).toBeGreaterThan(0);
    }
  });

  it('nombreFase = estado (participio); accionFase = acción (infinitivo)', () => {
    expect(nombreFase(11)).toBe('Escriturada');
    expect(accionFase(11)).toBe('Escriturar');
    expect(nombreFase(2)).toBe('Asignada');
    expect(accionFase(2)).toBe('Asignar unidad');
    // Fase 9 conserva el estado como nombre del documento.
    expect(nombreFase(9)).toBe('Validación Patronal');
    expect(accionFase(9)).toBe('Recabar validación patronal');
  });

  it('proximaFase = acción de la fase SIGUIENTE (posición + 1), sin desfase', () => {
    // Una venta Escriturada (11) → lo que sigue es Detonar crédito (12).
    expect(proximaFase(11)).toEqual({ posicion: 12, accion: 'Detonar crédito' });
    expect(proximaFase(2)).toEqual({ posicion: 3, accion: 'Formalizar promesa' });
  });

  it('proximaFase es null en la fase final (17) y sin posición', () => {
    expect(proximaFase(17)).toBeNull();
    expect(proximaFase(null)).toBeNull();
    expect(proximaFase(undefined)).toBeNull();
  });
});
