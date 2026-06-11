import { describe, expect, it } from 'vitest';

import {
  checksumDiff,
  checksumOk,
  continuidadCheck,
  cuentaMatchExtraccion,
  mesAnterior,
  periodoDia1,
  periodoLabel,
  saldoTotalAlCorte,
  snapshotCheck,
} from './estados-cuenta-utils';

// Carátulas reales de mayo 2026 (verificadas al centavo contra los PDFs).
const AFIRME = {
  saldoInicial: 4535.6,
  depositos: 2632480.0,
  retiros: 2627480.0,
  saldoFinal: 9535.6,
};
const BBVA = {
  saldoInicial: 1698583.82,
  depositos: 34446026.4,
  retiros: 34094806.99,
  saldoFinal: 2049803.23,
};
const MONEX = {
  saldoInicial: 97.44,
  depositos: 2271772211.19,
  retiros: 2270772250.97,
  saldoFinal: 1000057.66,
};

describe('checksum interno de carátula', () => {
  it('cuadra con las carátulas reales de mayo 2026', () => {
    expect(checksumOk(AFIRME)).toBe(true);
    expect(checksumOk(BBVA)).toBe(true);
    expect(checksumOk(MONEX)).toBe(true);
  });

  it('detecta un descuadre y reporta el monto exacto', () => {
    const malo = { ...BBVA, saldoFinal: BBVA.saldoFinal + 100 };
    expect(checksumOk(malo)).toBe(false);
    expect(checksumDiff(malo)).toBe(-100);
  });

  it('tolera residuos de float menores a un centavo', () => {
    // 0.1 + 0.2 !== 0.3 en float — el redondeo a centavos lo absorbe.
    expect(checksumOk({ saldoInicial: 0.1, depositos: 0.2, retiros: 0, saldoFinal: 0.3 })).toBe(
      true
    );
  });
});

describe('saldoTotalAlCorte', () => {
  it('suma vista + posición en inversiones (caso Monex)', () => {
    expect(saldoTotalAlCorte({ saldoFinal: 1000057.66, saldoInversiones: 117013570.19 })).toBe(
      118013627.85
    );
  });

  it('sin inversiones devuelve el saldo vista', () => {
    expect(saldoTotalAlCorte({ saldoFinal: 9535.6, saldoInversiones: 0 })).toBe(9535.6);
  });
});

describe('helpers de periodo (date-only, sin TZ)', () => {
  it('mesAnterior cruza años', () => {
    expect(mesAnterior('2026-05-01')).toBe('2026-04-01');
    expect(mesAnterior('2026-01-01')).toBe('2025-12-01');
  });

  it('periodoDia1 normaliza YYYY-MM y fechas completas', () => {
    expect(periodoDia1('2026-05')).toBe('2026-05-01');
    expect(periodoDia1('2026-05-31')).toBe('2026-05-01');
  });

  it('periodoLabel en español', () => {
    expect(periodoLabel('2026-05-01')).toBe('Mayo 2026');
    expect(periodoLabel('2025-12-01')).toBe('Diciembre 2025');
  });
});

describe('continuidadCheck', () => {
  const mayo = { cuentaId: 'c1', periodo: '2026-05-01', saldoInicial: 4535.6 };

  it('ok cuando el saldo final de abril = saldo inicial de mayo', () => {
    const estados = [{ cuentaId: 'c1', periodo: '2026-04-01', saldoFinal: 4535.6 }];
    expect(continuidadCheck(mayo, estados)).toEqual({ status: 'ok' });
  });

  it('descuadre con el monto de la diferencia', () => {
    const estados = [{ cuentaId: 'c1', periodo: '2026-04-01', saldoFinal: 4000.0 }];
    expect(continuidadCheck(mayo, estados)).toEqual({ status: 'descuadre', diff: 535.6 });
  });

  it('sin-anterior cuando no hay estado del mes previo (o es de otra cuenta)', () => {
    expect(continuidadCheck(mayo, [])).toEqual({ status: 'sin-anterior' });
    const otraCuenta = [{ cuentaId: 'c2', periodo: '2026-04-01', saldoFinal: 4535.6 }];
    expect(continuidadCheck(mayo, otraCuenta)).toEqual({ status: 'sin-anterior' });
  });
});

describe('snapshotCheck (cruce vs captura manual)', () => {
  const monexMayo = {
    cuentaId: 'c1',
    fechaCorte: '2026-05-31',
    saldoFinal: 1000057.66,
    saldoInversiones: 117013570.19,
  };

  it('ok cuando el snapshot coincide con vista + inversiones', () => {
    const snaps = [{ cuentaId: 'c1', fecha: '2026-05-31', saldo: 118013627.85 }];
    expect(snapshotCheck(monexMayo, snaps)).toEqual({
      status: 'ok',
      saldoSnapshot: 118013627.85,
    });
  });

  it('descuadre si el snapshot capturó solo la vista (error típico Monex)', () => {
    const snaps = [{ cuentaId: 'c1', fecha: '2026-05-31', saldo: 1000057.66 }];
    expect(snapshotCheck(monexMayo, snaps)).toEqual({
      status: 'descuadre',
      diff: 117013570.19,
      saldoSnapshot: 1000057.66,
    });
  });

  it('sin-snapshot cuando no hay captura en la fecha de corte', () => {
    const snaps = [{ cuentaId: 'c1', fecha: '2026-05-30', saldo: 118013627.85 }];
    expect(snapshotCheck(monexMayo, snaps)).toEqual({ status: 'sin-snapshot' });
  });
});

describe('cuentaMatchExtraccion', () => {
  const bbva = {
    clabe: '012068001415024927',
    numeroCuenta: '0141502492',
    contrato: null,
  };
  const monex = {
    clabe: '112075000037310071',
    numeroCuenta: null,
    contrato: '3731007',
  };

  it('matchea por CLABE (gana sobre número de cuenta)', () => {
    expect(cuentaMatchExtraccion(bbva, { clabe: '012068001415024927', numero_cuenta: '' })).toBe(
      true
    );
    expect(
      cuentaMatchExtraccion(bbva, { clabe: '112075000037310071', numero_cuenta: '0141502492' })
    ).toBe(false);
  });

  it('matchea contrato Monex vía numero_cuenta extraído', () => {
    expect(cuentaMatchExtraccion(monex, { clabe: '', numero_cuenta: '3731007' })).toBe(true);
  });

  it('ignora espacios y guiones', () => {
    expect(cuentaMatchExtraccion(bbva, { clabe: '0120 6800 1415 024927', numero_cuenta: '' })).toBe(
      true
    );
  });

  it('null cuando no hay identificadores comparables', () => {
    expect(cuentaMatchExtraccion(bbva, { clabe: '', numero_cuenta: '' })).toBe(null);
    expect(
      cuentaMatchExtraccion(
        { clabe: null, numeroCuenta: null, contrato: null },
        { clabe: '', numero_cuenta: '0141502492' }
      )
    ).toBe(null);
  });
});
