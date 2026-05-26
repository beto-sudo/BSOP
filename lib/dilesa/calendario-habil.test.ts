import { describe, expect, it } from 'vitest';
import {
  esDiaHabil,
  esFestivoMX,
  esFinDeSemana,
  fromIsoDate,
  siguienteDiaHabil,
  sumarDiasHabiles,
  toIsoDate,
  ultimoAnioConFestivos,
} from './calendario-habil';

describe('calendario-habil MX', () => {
  describe('utilidades de fechas', () => {
    it('toIsoDate / fromIsoDate round-trip', () => {
      const d = fromIsoDate('2026-05-26');
      expect(toIsoDate(d)).toBe('2026-05-26');
    });

    it('esFinDeSemana detecta sáb y dom', () => {
      expect(esFinDeSemana(fromIsoDate('2026-05-23'))).toBe(true); // sábado
      expect(esFinDeSemana(fromIsoDate('2026-05-24'))).toBe(true); // domingo
      expect(esFinDeSemana(fromIsoDate('2026-05-26'))).toBe(false); // martes
    });

    it('esFestivoMX detecta los 7 nacionales 2026', () => {
      expect(esFestivoMX(fromIsoDate('2026-01-01'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-02-02'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-03-16'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-05-01'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-09-16'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-11-16'))).toBe(true);
      expect(esFestivoMX(fromIsoDate('2026-12-25'))).toBe(true);
    });

    it('esDiaHabil = NOT fin de semana AND NOT festivo', () => {
      expect(esDiaHabil(fromIsoDate('2026-05-26'))).toBe(true); // martes
      expect(esDiaHabil(fromIsoDate('2026-05-23'))).toBe(false); // sábado
      expect(esDiaHabil(fromIsoDate('2026-12-25'))).toBe(false); // viernes pero festivo
    });
  });

  describe('sumarDiasHabiles', () => {
    it('duración 1 desde un día hábil = mismo día', () => {
      const r = sumarDiasHabiles(fromIsoDate('2026-05-26'), 1);
      expect(toIsoDate(r)).toBe('2026-05-26');
    });

    it('duración 5 desde un martes = lunes siguiente', () => {
      // mar 26 → mié 27 → jue 28 → vie 29 → lun 1 jun (5 hábiles)
      const r = sumarDiasHabiles(fromIsoDate('2026-05-26'), 5);
      expect(toIsoDate(r)).toBe('2026-06-01');
    });

    it('salta fin de semana', () => {
      // vie 29 may → lun 1 jun → mar 2 (2 hábiles)
      const r = sumarDiasHabiles(fromIsoDate('2026-05-29'), 2);
      expect(toIsoDate(r)).toBe('2026-06-01');
    });

    it('salta festivos', () => {
      // jue 1 ene 2026 es festivo → arranca vie 02, 5 hábiles = 02, 05, 06, 07, 08, 09
      const r = sumarDiasHabiles(fromIsoDate('2026-01-01'), 5);
      expect(toIsoDate(r)).toBe('2026-01-08');
    });

    it('dias=0 lanza error sería inesperado — debe retornar el primer hábil', () => {
      // Spec: dias debe ser >= 0; pasamos 0 → retorna el día (cero días = no avanza)
      const r = sumarDiasHabiles(fromIsoDate('2026-05-26'), 0);
      // Con dias=0, restantes = max(0, -1) = 0 → no avanza. Resultado = primer hábil >= desde.
      expect(toIsoDate(r)).toBe('2026-05-26');
    });

    it('rechaza días negativos', () => {
      expect(() => sumarDiasHabiles(fromIsoDate('2026-05-26'), -1)).toThrow();
    });

    it('arranca-en-domingo se ajusta al lunes', () => {
      // dom 24 may, 1 día hábil → arranca lun 25
      const r = sumarDiasHabiles(fromIsoDate('2026-05-24'), 1);
      expect(toIsoDate(r)).toBe('2026-05-25');
    });
  });

  describe('siguienteDiaHabil', () => {
    it('lunes a martes', () => {
      expect(toIsoDate(siguienteDiaHabil(fromIsoDate('2026-05-25')))).toBe('2026-05-26');
    });

    it('viernes salta a lunes', () => {
      expect(toIsoDate(siguienteDiaHabil(fromIsoDate('2026-05-29')))).toBe('2026-06-01');
    });

    it('víspera de festivo salta el festivo', () => {
      // mié 31 dic 2026 → 1 ene 2027 festivo → 2 ene es viernes → siguiente hábil = vie 2 ene
      expect(toIsoDate(siguienteDiaHabil(fromIsoDate('2026-12-31')))).toBe('2027-01-04');
      // Verifico paso a paso: 31-dic-26 mié → 01-ene-27 vie pero festivo → 02-ene-27 sáb → 03-ene-27 dom → 04-ene-27 lun
    });
  });

  describe('cobertura de años', () => {
    it('ultimoAnioConFestivos devuelve año máximo cubierto', () => {
      const y = ultimoAnioConFestivos();
      expect(y).toBeGreaterThanOrEqual(2030);
    });
  });
});
