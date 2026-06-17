import { describe, it, expect } from 'vitest';
import {
  abonoCubreMayormenteInstitucion,
  abonoQuedariaSinAplicar,
  repartirAbonoFifo,
  sugerirFuenteAbono,
  type CargoAbiertoFuente,
} from './fuente-abono';

// Venta típica: enganche/mensualidades del cliente ya liquidadas (saldo 0) y
// la disposición del crédito Infonavit como siguiente cargo abierto.
const cargosDisposicionPendiente: CargoAbiertoFuente[] = [
  { saldo: 0, fuente_esperada: 'cliente' },
  { saldo: 636328.45, fuente_esperada: 'institucion' },
  { saldo: 15000, fuente_esperada: 'cliente' },
];

describe('sugerirFuenteAbono', () => {
  it('sugiere institución cuando el primer cargo abierto la espera', () => {
    expect(sugerirFuenteAbono(cargosDisposicionPendiente)).toBe('institucion');
  });

  it('sugiere cliente cuando el primer cargo abierto es del cliente', () => {
    expect(
      sugerirFuenteAbono([
        { saldo: 50000, fuente_esperada: 'cliente' },
        { saldo: 600000, fuente_esperada: 'institucion' },
      ])
    ).toBe('cliente');
  });

  it('cae a cliente sin cargos abiertos (saldo a favor)', () => {
    expect(sugerirFuenteAbono([])).toBe('cliente');
    expect(sugerirFuenteAbono([{ saldo: 0, fuente_esperada: 'institucion' }])).toBe('cliente');
  });
});

describe('repartirAbonoFifo', () => {
  it('aplica en orden FIFO sin filtrar por fuente (espejo del RPC)', () => {
    const r = repartirAbonoFifo(cargosDisposicionPendiente, 640000);
    expect(r.institucion).toBe(636328.45);
    expect(r.cliente).toBeCloseTo(3671.55, 2);
    expect(r.sinAplicar).toBe(0);
  });

  it('deja el excedente como sin aplicar (saldo a favor)', () => {
    const r = repartirAbonoFifo([{ saldo: 10000, fuente_esperada: 'cliente' }], 12500);
    expect(r.cliente).toBe(10000);
    expect(r.institucion).toBe(0);
    expect(r.sinAplicar).toBe(2500);
  });

  it('con monto no positivo no aplica nada', () => {
    expect(repartirAbonoFifo(cargosDisposicionPendiente, 0)).toEqual({
      cliente: 0,
      institucion: 0,
      sinAplicar: 0,
    });
  });
});

describe('abonoCubreMayormenteInstitucion', () => {
  it('detecta la disposición capturada como cliente (caso 2026-06-12)', () => {
    expect(abonoCubreMayormenteInstitucion(cargosDisposicionPendiente, 636328.45)).toBe(true);
  });

  it('no avisa cuando el abono cubre sobre todo cargos del cliente', () => {
    const cargos: CargoAbiertoFuente[] = [
      { saldo: 50000, fuente_esperada: 'cliente' },
      { saldo: 600000, fuente_esperada: 'institucion' },
    ];
    expect(abonoCubreMayormenteInstitucion(cargos, 30000)).toBe(false);
  });

  it('no avisa sin monto o sin cargos abiertos', () => {
    expect(abonoCubreMayormenteInstitucion(cargosDisposicionPendiente, 0)).toBe(false);
    expect(abonoCubreMayormenteInstitucion([], 100000)).toBe(false);
  });
});

describe('abonoQuedariaSinAplicar', () => {
  it('detecta el abono que flota 100% sin plan de pagos (incidente Arizpe Luna)', () => {
    expect(abonoQuedariaSinAplicar([], 908999.71)).toBe(true);
  });

  it('detecta el abono que flota con el plan ya saldado (todos los cargos en 0)', () => {
    expect(
      abonoQuedariaSinAplicar(
        [
          { saldo: 0, fuente_esperada: 'cliente' },
          { saldo: 0, fuente_esperada: 'institucion' },
        ],
        50000
      )
    ).toBe(true);
  });

  it('no marca cuando algún cargo abierto absorbe parte del abono', () => {
    expect(abonoQuedariaSinAplicar(cargosDisposicionPendiente, 700000)).toBe(false);
    // Excedente sobre un único cargo: aplica algo → no es flotación total.
    expect(abonoQuedariaSinAplicar([{ saldo: 10000, fuente_esperada: 'cliente' }], 12500)).toBe(
      false
    );
  });

  it('no marca con monto no positivo', () => {
    expect(abonoQuedariaSinAplicar([], 0)).toBe(false);
  });
});
