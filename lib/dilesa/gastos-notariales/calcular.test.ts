import { describe, expect, it } from 'vitest';

import { buscarEscalon, calcularGastosNotariales } from './calcular';
import type { GastosNotarialesConfig, TabuladorFila } from './tipos';

/**
 * Fixtures: tarifas 2026 del cotizador oficial del notario (Excel "COTIZADOR
 * NOTARIA 25 2026"). Espejo del seed de
 * `20260629225357_dilesa_gastos_notariales_v2_categoria.sql`. Este test es el
 * guard contra que el cálculo se desvíe del cotizador — valida los dos ejemplos
 * del propio Excel al peso (LDE $922k→$44,333; LDS $3.5M→$188,869).
 */
const compraventa: TabuladorFila[] = [
  {
    orden: 1,
    limiteInferior: 0.01,
    limiteSuperior: 57750,
    valorBeneficio: 2683,
    valorParticular: 5345,
  },
  {
    orden: 2,
    limiteInferior: 57750.01,
    limiteSuperior: 115500,
    valorBeneficio: 3351,
    valorParticular: 6682,
  },
  {
    orden: 3,
    limiteInferior: 115500.01,
    limiteSuperior: 231000,
    valorBeneficio: 4019,
    valorParticular: 8018,
  },
  {
    orden: 4,
    limiteInferior: 231000.01,
    limiteSuperior: 346500,
    valorBeneficio: 4683,
    valorParticular: 9354,
  },
  {
    orden: 5,
    limiteInferior: 346500.01,
    limiteSuperior: 462000,
    valorBeneficio: 5355,
    valorParticular: 10690,
  },
  {
    orden: 6,
    limiteInferior: 462000.01,
    limiteSuperior: 577500,
    valorBeneficio: 6023,
    valorParticular: 12027,
  },
  {
    orden: 7,
    limiteInferior: 577500.01,
    limiteSuperior: 693000,
    valorBeneficio: 6692,
    valorParticular: 13363,
  },
  {
    orden: 8,
    limiteInferior: 693000.01,
    limiteSuperior: 808500,
    valorBeneficio: 7360,
    valorParticular: 14699,
  },
  {
    orden: 9,
    limiteInferior: 808500.01,
    limiteSuperior: 924000,
    valorBeneficio: 8028,
    valorParticular: 16036,
  },
  {
    orden: 10,
    limiteInferior: 924000.01,
    limiteSuperior: 1039500,
    valorBeneficio: 8696,
    valorParticular: 17372,
  },
  {
    orden: 11,
    limiteInferior: 1039500.01,
    limiteSuperior: 1155000,
    valorBeneficio: 9364,
    valorParticular: 18708,
  },
  {
    orden: 12,
    limiteInferior: 1155000.01,
    limiteSuperior: 1386000,
    valorBeneficio: 10701,
    valorParticular: 21381,
  },
  {
    orden: 13,
    limiteInferior: 1386000.01,
    limiteSuperior: 1559250,
    valorBeneficio: 11369,
    valorParticular: 22717,
  },
  {
    orden: 14,
    limiteInferior: 1559250.01,
    limiteSuperior: 1617000,
    valorBeneficio: 12037,
    valorParticular: 24053,
  },
  {
    orden: 15,
    limiteInferior: 1617000.01,
    limiteSuperior: 1732500,
    valorBeneficio: 12705,
    valorParticular: 25390,
  },
  {
    orden: 16,
    limiteInferior: 1732500.01,
    limiteSuperior: null,
    valorBeneficio: 35422,
    valorParticular: 35422,
  },
];
const apertura: TabuladorFila[] = [
  {
    orden: 1,
    limiteInferior: 0.01,
    limiteSuperior: 57750,
    valorBeneficio: 1356,
    valorParticular: 1336.3,
  },
  {
    orden: 2,
    limiteInferior: 57750.01,
    limiteSuperior: 173250,
    valorBeneficio: 2693,
    valorParticular: 2672.6,
  },
  {
    orden: 9,
    limiteInferior: 866250.01,
    limiteSuperior: 981750,
    valorBeneficio: 12047,
    valorParticular: 12026.7,
  },
  {
    orden: 18,
    limiteInferior: 1848000.01,
    limiteSuperior: 2310000,
    valorBeneficio: 24073,
    valorParticular: 24053.4,
  },
  {
    orden: 19,
    limiteInferior: 2310000.01,
    limiteSuperior: null,
    valorBeneficio: 35422,
    valorParticular: 35422,
  },
];

const INTERES_SOCIAL: GastosNotarialesConfig = {
  categoria: 'interes_social',
  anio: 2026,
  isaiPct: 0.03,
  muni: {
    certificacionPlanos: 165,
    copiasFotostaticas: 56,
    formaIsai: 0,
    avaluoPrevio: 566,
    valuacionCatastralPct: 0.002,
    derechos: 850,
    noAdeudoSimas: 0,
  },
  registroPublico: {
    clg: 575,
    avisoPreventivo: 0,
    aperturaUmbralCuotaFija: 820000,
    aperturaCuotaFija: 765,
  },
  otros: {
    avaluo: 0,
    cnpc: 0,
    cnpr: 1000,
    avisoDefinitivo: 103,
    formaIsai: 400,
    copiaCertificada: 1000,
    plano: 1000,
    kinegrama: 200,
  },
  tabuladorCompraventa: compraventa,
  tabuladorApertura: apertura,
};
const RESIDENCIAL_MEDIO: GastosNotarialesConfig = {
  categoria: 'residencial_medio',
  anio: 2026,
  isaiPct: 0.03,
  muni: {
    certificacionPlanos: 271,
    copiasFotostaticas: 0,
    formaIsai: 450,
    avaluoPrevio: 594,
    valuacionCatastralPct: 0.0018,
    derechos: 1132,
    noAdeudoSimas: 300,
  },
  registroPublico: {
    clg: 575,
    avisoPreventivo: 0,
    aperturaUmbralCuotaFija: 820000,
    aperturaCuotaFija: 765,
  },
  otros: {
    avaluo: 600,
    cnpc: 0,
    cnpr: 1000,
    avisoDefinitivo: 103,
    formaIsai: 400,
    copiaCertificada: 1000,
    plano: 1000,
    kinegrama: 200,
  },
  tabuladorCompraventa: compraventa,
  tabuladorApertura: apertura,
};

function subtotal(d: ReturnType<typeof calcularGastosNotariales>, clave: string) {
  return d.bloques.find((b) => b.clave === clave)?.subtotal;
}

describe('cotizador — interés social (LDE), ejemplo del Excel $922,000', () => {
  // valor 922,000 · catastral 600,000 · 2 créditos ≤$820k (AP I+II = 765 c/u) → $44,333.
  const d = calcularGastosNotariales(
    {
      valorEscrituracion: 922000,
      valorCatastral: 600000,
      montoCreditoTitular: 700000,
      montoCreditoCotitular: 700000,
    },
    INTERES_SOCIAL
  );
  it('cuadra el total al peso', () => expect(d.total).toBe(44333));
  it('cuadra los subtotales', () => {
    expect(subtotal(d, 'municipio')).toBe(30497);
    expect(subtotal(d, 'registro_publico')).toBe(10133);
    expect(subtotal(d, 'otros')).toBe(3703);
  });
});

describe('cotizador — residencial medio (LDS), ejemplo del Excel $3,500,000', () => {
  // valor 3,500,000 · catastral 3,000,000 · crédito >$2.31M (compraventa y apertura = tope 35,422) → $188,869.
  const d = calcularGastosNotariales(
    {
      valorEscrituracion: 3500000,
      valorCatastral: 3000000,
      montoCreditoTitular: 3000000,
      montoCreditoCotitular: 0,
    },
    RESIDENCIAL_MEDIO
  );
  it('cuadra el total al peso', () => expect(d.total).toBe(188869));
  it('cuadra los subtotales', () => {
    expect(subtotal(d, 'municipio')).toBe(113147);
    expect(subtotal(d, 'registro_publico')).toBe(71419);
    expect(subtotal(d, 'otros')).toBe(4303);
  });
});

describe('variantes', () => {
  it('valuación catastral = valor catastral × pct (interés social 0.2%)', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 922000,
        valorCatastral: 600000,
        montoCreditoTitular: 700000,
        montoCreditoCotitular: 0,
      },
      INTERES_SOCIAL
    );
    const val = d.bloques.flatMap((b) => b.lineas).find((l) => l.clave === 'valuacion_catastral');
    expect(val?.monto).toBe(1200); // 600,000 × 0.002
    expect(d.faltaValorCatastral).toBe(false);
  });

  it('sin valor catastral: marca faltaValorCatastral y deja la valuación en $0', () => {
    const d = calcularGastosNotariales(
      { valorEscrituracion: 920000, montoCreditoTitular: 700000, montoCreditoCotitular: 0 },
      INTERES_SOCIAL
    );
    expect(d.faltaValorCatastral).toBe(true);
    const val = d.bloques.flatMap((b) => b.lineas).find((l) => l.clave === 'valuacion_catastral');
    expect(val?.monto).toBe(0);
    expect(val?.pendiente).toBe(true);
  });

  it('residencial medio incluye conceptos extra (SIMAS, avalúo, forma ISAI muni)', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 920000,
        valorCatastral: 600000,
        montoCreditoTitular: 700000,
        montoCreditoCotitular: 0,
      },
      RESIDENCIAL_MEDIO
    );
    const claves = d.bloques.flatMap((b) => b.lineas).map((l) => l.clave);
    expect(claves).toContain('no_adeudo_simas');
    expect(claves).toContain('avaluo');
    expect(claves).toContain('forma_isai_muni');
  });

  it('interés social NO incluye SIMAS ni avalúo (cuotas en $0 se omiten)', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 920000,
        valorCatastral: 600000,
        montoCreditoTitular: 700000,
        montoCreditoCotitular: 0,
      },
      INTERES_SOCIAL
    );
    const claves = d.bloques.flatMap((b) => b.lineas).map((l) => l.clave);
    expect(claves).not.toContain('no_adeudo_simas');
    expect(claves).not.toContain('avaluo');
  });

  it('CNPR es fijo (no se multiplica por derechohabientes)', () => {
    const conCotit = calcularGastosNotariales(
      {
        valorEscrituracion: 920000,
        valorCatastral: 600000,
        montoCreditoTitular: 500000,
        montoCreditoCotitular: 400000,
      },
      INTERES_SOCIAL
    );
    const cnpr = conCotit.bloques.flatMap((b) => b.lineas).find((l) => l.clave === 'cnpr');
    expect(cnpr?.monto).toBe(1000);
  });
});

describe('buscarEscalon — topes del cotizador', () => {
  it('compraventa arriba de $1,732,500 = $35,422', () => {
    expect(buscarEscalon(compraventa, 3139530)?.valorBeneficio).toBe(35422);
  });
  it('apertura arriba de $2,310,000 = $35,422', () => {
    expect(buscarEscalon(apertura, 2741343.55)?.valorBeneficio).toBe(35422);
  });
});
