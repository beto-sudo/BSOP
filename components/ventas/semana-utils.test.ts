import { describe, it, expect } from 'vitest';
import {
  fechaEnTz,
  hoyEnTz,
  inicioMes,
  indiceSemana,
  isoSemana,
  lunesDe,
  etiquetaCorta,
  etiquetaMes,
  ventanaSemanas,
} from './semana-utils';

// Toda la suite usa TZ America/Matamoros (UTC-5 fijo, default del módulo).

describe('isoSemana', () => {
  it('jueves 1-ene-2026 cae en la semana ISO 1', () => {
    expect(isoSemana('2026-01-01')).toBe(1);
  });

  it('lunes 11-may-2026 es semana ISO 20 (coincide con la hoja de RDB)', () => {
    expect(isoSemana('2026-05-11')).toBe(20);
  });

  it('domingo 17-may-2026 sigue en la semana 20 (la semana ISO termina en domingo)', () => {
    expect(isoSemana('2026-05-17')).toBe(20);
  });

  it('lunes 18-may-2026 ya es semana 21', () => {
    expect(isoSemana('2026-05-18')).toBe(21);
  });
});

describe('lunesDe', () => {
  it('mapea cualquier día de la semana a su lunes ISO', () => {
    expect(lunesDe('2026-05-11')).toBe('2026-05-11'); // ya es lunes
    expect(lunesDe('2026-05-14')).toBe('2026-05-11'); // jueves
    expect(lunesDe('2026-05-17')).toBe('2026-05-11'); // domingo
    expect(lunesDe('2026-05-18')).toBe('2026-05-18'); // lunes siguiente
  });
});

describe('ventanaSemanas', () => {
  // Miércoles 20-may-2026 12:00Z → 07:00 en Matamoros, sigue siendo el día 20,
  // que cae en la semana ISO 21 (18–24 may).
  const now = new Date('2026-05-20T12:00:00Z');
  const semanas = ventanaSemanas(now, 6);

  it('devuelve 6 semanas, más vieja primero', () => {
    expect(semanas).toHaveLength(6);
    expect(semanas.map((s) => s.isoSemana)).toEqual([16, 17, 18, 19, 20, 21]);
  });

  it('la última es la semana en curso y las demás no', () => {
    expect(semanas[5]).toMatchObject({ isoSemana: 21, inicio: '2026-05-18', enCurso: true });
    expect(semanas.slice(0, 5).every((s) => !s.enCurso)).toBe(true);
  });

  it('cada bucket va de lunes a domingo', () => {
    expect(semanas[4]).toMatchObject({ inicio: '2026-05-11', fin: '2026-05-17' });
  });
});

describe('indiceSemana', () => {
  const semanas = ventanaSemanas(new Date('2026-05-20T12:00:00Z'), 6);

  it('ubica una fecha dentro de su bucket', () => {
    expect(indiceSemana('2026-05-11', semanas)).toBe(4); // semana 20
    expect(indiceSemana('2026-05-20', semanas)).toBe(5); // semana en curso
    expect(indiceSemana('2026-04-13', semanas)).toBe(0); // semana 16
  });

  it('devuelve -1 para fechas fuera de la ventana', () => {
    expect(indiceSemana('2026-04-12', semanas)).toBe(-1); // un día antes
    expect(indiceSemana('2026-05-25', semanas)).toBe(-1); // un día después
  });
});

describe('fechaEnTz', () => {
  it('un timestamp de noche UTC cae en el día anterior en Matamoros', () => {
    // 02:00Z del 12 = 21:00 del 11 en UTC-5.
    expect(fechaEnTz('2026-05-12T02:00:00+00:00')).toBe('2026-05-11');
  });

  it('un timestamp de tarde se queda en el mismo día', () => {
    expect(fechaEnTz('2026-05-11T18:30:00+00:00')).toBe('2026-05-11');
  });
});

describe('hoyEnTz', () => {
  it('formatea la fecha local en la TZ del club', () => {
    expect(hoyEnTz(new Date('2026-05-20T12:00:00Z'))).toBe('2026-05-20');
  });
});

describe('inicioMes / etiquetas', () => {
  it('inicioMes devuelve el primer día del mes', () => {
    expect(inicioMes('2026-05-20')).toBe('2026-05-01');
  });

  it('etiquetaMes y etiquetaCorta formatean en español corto', () => {
    expect(etiquetaMes('2026-05-11')).toBe('may 2026');
    expect(etiquetaCorta('2026-05-11')).toBe('11 may');
    expect(etiquetaCorta('2026-01-04')).toBe('4 ene');
  });
});
