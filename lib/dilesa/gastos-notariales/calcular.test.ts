import { describe, expect, it } from 'vitest';

import { buscarEscalon, calcularGastosNotariales } from './calcular';
import type { GastosNotarialesConfig, TabuladorFila } from './tipos';

/**
 * Fixture: tarifas 2026 de Memo. Espejo del seed de
 * `20260626171235_dilesa_gastos_notariales_config.sql`. Si cambia el seed,
 * actualizar aquí (y viceversa) — este test es el guard contra que el cálculo
 * se desvíe del presupuesto del notario.
 *
 * `valorBeneficio` = columna que aplica a DILESA por default (en compraventa el
 * beneficio 50% sin propiedad; en apertura la columna 'DILESA' de la hoja).
 * `valorParticular` = cuota plena (columna PARTICULAR).
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
    valorBeneficio: 13373,
    valorParticular: 26726,
  },
];

// Apertura: valorBeneficio = columna 'DILESA' de la hoja (la que aplica a
// DILESA); valorParticular = PARTICULAR (referencia, no se usa en el cálculo).
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
    orden: 3,
    limiteInferior: 173250.01,
    limiteSuperior: 288750,
    valorBeneficio: 4029,
    valorParticular: 4008.9,
  },
  {
    orden: 4,
    limiteInferior: 288750.01,
    limiteSuperior: 404250,
    valorBeneficio: 5365,
    valorParticular: 5345.2,
  },
  {
    orden: 5,
    limiteInferior: 404250.01,
    limiteSuperior: 519750,
    valorBeneficio: 6702,
    valorParticular: 6681.5,
  },
  {
    orden: 6,
    limiteInferior: 519750.01,
    limiteSuperior: 635250,
    valorBeneficio: 8038,
    valorParticular: 8017.8,
  },
  {
    orden: 7,
    limiteInferior: 635250.01,
    limiteSuperior: 750750,
    valorBeneficio: 9374,
    valorParticular: 9354.1,
  },
  {
    orden: 8,
    limiteInferior: 750750.01,
    limiteSuperior: 866250,
    valorBeneficio: 10710,
    valorParticular: 10690.4,
  },
  {
    orden: 9,
    limiteInferior: 866250.01,
    limiteSuperior: 981750,
    valorBeneficio: 12047,
    valorParticular: 12026.7,
  },
  {
    orden: 10,
    limiteInferior: 981750.01,
    limiteSuperior: 1097250,
    valorBeneficio: 13383,
    valorParticular: 13363,
  },
  {
    orden: 11,
    limiteInferior: 1097250.01,
    limiteSuperior: 1212750,
    valorBeneficio: 14719,
    valorParticular: 14699.3,
  },
  {
    orden: 12,
    limiteInferior: 1212750.01,
    limiteSuperior: 1328250,
    valorBeneficio: 16056,
    valorParticular: 16035.6,
  },
  {
    orden: 13,
    limiteInferior: 1328250.01,
    limiteSuperior: 1443750,
    valorBeneficio: 17392,
    valorParticular: 17371.9,
  },
  {
    orden: 14,
    limiteInferior: 1443750.01,
    limiteSuperior: 1559250,
    valorBeneficio: 18728,
    valorParticular: 18708.2,
  },
  {
    orden: 15,
    limiteInferior: 1559250.01,
    limiteSuperior: 1674750,
    valorBeneficio: 20065,
    valorParticular: 20044.5,
  },
  {
    orden: 16,
    limiteInferior: 1674750.01,
    limiteSuperior: 1732500,
    valorBeneficio: 21401,
    valorParticular: 21380.8,
  },
  {
    orden: 17,
    limiteInferior: 1732500.01,
    limiteSuperior: 1848000,
    valorBeneficio: 22737,
    valorParticular: 22717.1,
  },
  {
    orden: 18,
    limiteInferior: 1848000.01,
    limiteSuperior: 2310000,
    valorBeneficio: 24073,
    valorParticular: 24053.4,
  },
];

const CONFIG_MEMO_2026: GastosNotarialesConfig = {
  anio: 2026,
  isaiPct: 0.03,
  muni: {
    certificacionPlanos: 165,
    copiasFotostaticas: 56,
    avaluoPrevio: 566,
    valuacionCatastral: 1200,
    derechos: 850,
  },
  registroPublico: {
    clg: 575,
    avisoPreventivo: 0,
    aperturaUmbralCuotaFija: 820000,
    aperturaCuotaFija: 765,
  },
  otros: {
    cnprPorDerechohabiente: 1000,
    avisoDefinitivo: 103,
    formaIsai: 400,
    copiaCertificada: 1500,
    plano: 1200,
    kinegrama: 200,
  },
  tabuladorCompraventa: compraventa,
  tabuladorApertura: apertura,
};

/** Atajo: busca una línea del desglose por clave. */
function linea(d: ReturnType<typeof calcularGastosNotariales>, clave: string) {
  return d.bloques.flatMap((b) => b.lineas).find((l) => l.clave === clave);
}
function subtotal(d: ReturnType<typeof calcularGastosNotariales>, clave: string) {
  return d.bloques.find((b) => b.clave === clave)?.subtotal;
}

describe('calcularGastosNotariales — ejemplo de Memo ($920,000)', () => {
  // Caso ground-truth del correo del notario: $920k, 1 derechohabiente, sin
  // propiedad previa, crédito ≤ $820k → total $44,208 exacto.
  const d = calcularGastosNotariales(
    {
      valorEscrituracion: 920000,
      montoCreditoTitular: 800000,
      montoCreditoCotitular: 0,
      tienePropiedad: false,
    },
    CONFIG_MEMO_2026
  );

  it('cuadra el total al peso', () => {
    expect(d.total).toBe(44208);
  });

  it('cuadra los tres subtotales', () => {
    expect(subtotal(d, 'municipio')).toBe(30437);
    expect(subtotal(d, 'registro_publico')).toBe(9368);
    expect(subtotal(d, 'otros')).toBe(4403);
  });

  it('cuadra las líneas variables', () => {
    expect(linea(d, 'isai')?.monto).toBe(27600); // 3% × 920,000
    expect(linea(d, 'compraventa')?.monto).toBe(8028); // escalón 808,500–924,000, sin propiedad
    expect(linea(d, 'apertura_credito_i')?.monto).toBe(765); // crédito ≤ 820k → cuota fija
    expect(linea(d, 'apertura_credito_ii')?.monto).toBe(0); // sin co-acreditado
    expect(linea(d, 'cnpr')?.monto).toBe(1000); // 1 derechohabiente
  });

  it('marca calculadas vs cuotas fijas', () => {
    expect(linea(d, 'isai')?.calculado).toBe(true);
    expect(linea(d, 'compraventa')?.calculado).toBe(true);
    expect(linea(d, 'cnpr')?.calculado).toBe(true);
    expect(linea(d, 'derechos')?.calculado).toBe(false);
    expect(linea(d, 'kinegrama')?.calculado).toBe(false);
  });

  it('reporta 1 derechohabiente', () => {
    expect(d.numDerechohabientes).toBe(1);
  });
});

describe('calcularGastosNotariales — variantes', () => {
  it('con propiedad previa usa la columna particular de compraventa', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 920000,
        montoCreditoTitular: 800000,
        montoCreditoCotitular: 0,
        tienePropiedad: true,
      },
      CONFIG_MEMO_2026
    );
    expect(linea(d, 'compraventa')?.monto).toBe(16036); // columna particular
    expect(d.total).toBe(44208 - 8028 + 16036); // 52,216
  });

  it('co-acreditado: 2 derechohabientes → CNPR ×2 y apertura II', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 920000,
        montoCreditoTitular: 500000,
        montoCreditoCotitular: 400000,
        tienePropiedad: false,
      },
      CONFIG_MEMO_2026
    );
    expect(d.numDerechohabientes).toBe(2);
    expect(linea(d, 'cnpr')?.monto).toBe(2000);
    expect(linea(d, 'apertura_credito_i')?.monto).toBe(765); // 500k ≤ umbral
    expect(linea(d, 'apertura_credito_ii')?.monto).toBe(765); // 400k ≤ umbral
  });

  it('ISAI escala con el valor de escrituración', () => {
    const d = calcularGastosNotariales(
      { valorEscrituracion: 1000000, montoCreditoTitular: 700000, montoCreditoCotitular: 0 },
      CONFIG_MEMO_2026
    );
    expect(linea(d, 'isai')?.monto).toBe(30000); // 3% × 1,000,000
  });

  it('crédito sobre el umbral entra al tabulador de apertura (columna DILESA)', () => {
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 930000,
        montoCreditoTitular: 900000,
        montoCreditoCotitular: 0,
        tienePropiedad: false,
      },
      CONFIG_MEMO_2026
    );
    // 900k > 820k → escalón 866,250–981,750, columna DILESA.
    expect(linea(d, 'apertura_credito_i')?.monto).toBe(12047);
  });

  it('la apertura no depende de la propiedad (siempre columna DILESA)', () => {
    const base = {
      valorEscrituracion: 930000,
      montoCreditoTitular: 900000,
      montoCreditoCotitular: 0,
    };
    const sinProp = calcularGastosNotariales({ ...base, tienePropiedad: false }, CONFIG_MEMO_2026);
    const conProp = calcularGastosNotariales({ ...base, tienePropiedad: true }, CONFIG_MEMO_2026);
    expect(linea(sinProp, 'apertura_credito_i')?.monto).toBe(12047);
    expect(linea(conProp, 'apertura_credito_i')?.monto).toBe(12047); // igual: propiedad no afecta apertura
  });
});

describe('buscarEscalon', () => {
  it('respeta los límites (escalón cubre el superior, no el inferior anterior)', () => {
    expect(buscarEscalon(compraventa, 808500)?.orden).toBe(8); // tope del escalón 8
    expect(buscarEscalon(compraventa, 808500.01)?.orden).toBe(9); // piso del escalón 9
    expect(buscarEscalon(compraventa, 924000)?.orden).toBe(9); // tope del escalón 9
  });

  it('hace clamp al último escalón si excede el tope', () => {
    expect(buscarEscalon(apertura, 5000000)?.orden).toBe(18);
  });

  it('devuelve null para monto cero o negativo', () => {
    expect(buscarEscalon(compraventa, 0)).toBeNull();
    expect(buscarEscalon(compraventa, -100)).toBeNull();
  });
});
