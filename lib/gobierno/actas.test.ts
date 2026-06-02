import { describe, expect, it } from 'vitest';
import {
  quorumDerivado,
  tallyVotos,
  tallyLabel,
  parseOrdenDia,
  type Asistente,
  type Voto,
} from './actas';

const asis = (overrides: Partial<Asistente>): Asistente => ({
  id: 'a',
  acta_id: 'act',
  empresa_id: 'e',
  socio_id: null,
  presente: true,
  representado_por: null,
  porcentaje: null,
  ...overrides,
});

const voto = (sentido: Voto['sentido']): Voto => ({
  id: 'v',
  acuerdo_id: 'ac',
  empresa_id: 'e',
  socio_id: null,
  sentido,
  representado_por: null,
});

describe('quorumDerivado', () => {
  it('usa el snapshot porcentaje del asistente cuando existe', () => {
    expect(
      quorumDerivado([asis({ porcentaje: 33.33 }), asis({ porcentaje: 33.33 })], new Map())
    ).toBeCloseTo(66.66, 2);
  });
  it('cae al % del socio cuando no hay snapshot', () => {
    const map = new Map([['s1', 33.33]]);
    expect(quorumDerivado([asis({ socio_id: 's1' })], map)).toBeCloseTo(33.33, 2);
  });
  it('ignora ausentes', () => {
    expect(
      quorumDerivado(
        [asis({ porcentaje: 50, presente: false }), asis({ porcentaje: 50 })],
        new Map()
      )
    ).toBe(50);
  });
});

describe('tallyVotos', () => {
  it('cuenta por sentido', () => {
    expect(tallyVotos([voto('favor'), voto('favor'), voto('contra')])).toEqual({
      favor: 2,
      contra: 1,
      abstencion: 0,
    });
  });
});

describe('tallyLabel', () => {
  it('arma el resumen y omite ceros', () => {
    expect(tallyLabel({ favor: 2, contra: 1, abstencion: 0 })).toBe('2 a favor · 1 en contra');
  });
  it('sin votos', () => {
    expect(tallyLabel({ favor: 0, contra: 0, abstencion: 0 })).toBe('Sin votos');
  });
});

describe('parseOrdenDia', () => {
  it('una línea por punto, limpia vacíos', () => {
    expect(parseOrdenDia('1. Apertura\n\n2. Informe\n  ')).toEqual(['1. Apertura', '2. Informe']);
  });
});
