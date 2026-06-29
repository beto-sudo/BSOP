/**
 * Gastos notariales de DILESA — tipos del modelo de cálculo (v2, cotizador oficial).
 *
 * Reconstruido del cotizador del notario (Excel "COTIZADOR NOTARIA 25 2026"):
 * las tarifas dependen del **tipo de vivienda** (interés social vs residencial
 * medio), no de un set único. El cálculo precarga el campo de gastos en la fase
 * de dictaminar y solo se confirma. Las tarifas viven en
 * `dilesa.gastos_notariales_config` (una fila por categoría/año) +
 * `dilesa.gastos_notariales_tabulador`. Ver iniciativa `dilesa-gastos-notariales`.
 */

export type CategoriaNotarial = 'interes_social' | 'residencial_medio';

/** Una fila de un tabulador escalonado (compraventa o apertura de crédito). */
export type TabuladorFila = {
  orden: number;
  limiteInferior: number;
  /** `null` = último escalón sin tope (el tope superior del cotizador). */
  limiteSuperior: number | null;
  /** Columna que aplica a DILESA (compraventa: beneficio 50%; apertura: col DILESA). */
  valorBeneficio: number;
  /** Cuota plena (columna PARTICULAR); en compraventa aplica con propiedad previa. */
  valorParticular: number;
};

/**
 * Config vigente de una categoría: cuotas fijas + parámetros + tabuladores.
 * Espejo en camelCase de `dilesa.gastos_notariales_config` (+ tabulador).
 */
export type GastosNotarialesConfig = {
  categoria: CategoriaNotarial;
  anio: number;
  /** ISAI = isaiPct × valor de escrituración (0.03 = 3%). */
  isaiPct: number;
  muni: {
    certificacionPlanos: number;
    copiasFotostaticas: number;
    /** Forma ISAI municipal (solo residencial medio; 0 si no aplica). */
    formaIsai: number;
    avaluoPrevio: number;
    /** Valuación catastral = valor catastral × este pct (0.002 / 0.0018). */
    valuacionCatastralPct: number;
    derechos: number;
    /** No adeudo SIMAS (solo residencial medio; 0 si no aplica). */
    noAdeudoSimas: number;
  };
  registroPublico: {
    clg: number;
    avisoPreventivo: number;
    /** Crédito hasta este monto → cuota fija; arriba entra el tabulador. */
    aperturaUmbralCuotaFija: number;
    aperturaCuotaFija: number;
  };
  otros: {
    avaluo: number;
    cnpc: number;
    /** CNPR: cuota fija (el cotizador la cobra fija, no por derechohabiente). */
    cnpr: number;
    avisoDefinitivo: number;
    formaIsai: number;
    copiaCertificada: number;
    plano: number;
    kinegrama: number;
  };
  tabuladorCompraventa: TabuladorFila[];
  tabuladorApertura: TabuladorFila[];
};

/** Inputs por operación (salen de `dilesa.ventas` + el flag de propiedad). */
export type GastosNotarialesInput = {
  valorEscrituracion: number;
  /** Valor catastral (del predial/CLG). Si falta, la valuación catastral = 0. */
  valorCatastral?: number;
  montoCreditoTitular: number;
  /** 0 si no hay co-acreditado. */
  montoCreditoCotitular: number;
  /** ¿Algún derechohabiente ya tiene propiedad a su nombre? (default false). */
  tienePropiedad?: boolean;
};

/** Una línea del desglose (concepto + monto). */
export type GastoLinea = {
  clave: string;
  etiqueta: string;
  monto: number;
  /** `true` = depende de la operación; `false` = cuota fija de config. */
  calculado: boolean;
  /** `true` = no se pudo calcular por falta de dato (ej. valor catastral). */
  pendiente?: boolean;
};

export type GastoBloque = {
  clave: 'municipio' | 'registro_publico' | 'otros';
  etiqueta: string;
  lineas: GastoLinea[];
  subtotal: number;
};

export type GastosNotarialesDesglose = {
  categoria: CategoriaNotarial;
  bloques: GastoBloque[];
  total: number;
  /** Derechohabientes considerados (1 titular + co-acreditado si lo hay). */
  numDerechohabientes: number;
  /** `true` si falta el valor catastral (la valuación catastral quedó en $0). */
  faltaValorCatastral: boolean;
};
