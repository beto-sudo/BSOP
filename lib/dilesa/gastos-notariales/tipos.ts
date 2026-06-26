/**
 * Gastos notariales de DILESA — tipos del modelo de cálculo.
 *
 * Reconstruido del correo del notario (Memo — Lic. Guillermo Nicolás López
 * Elizondo) del 25-jun-2026: el monto NO sale del Anexo B ni de ningún documento
 * oficial; el notario lo calcula a mano en sus tablas. Este modelo lo replica
 * para precargarlo en la fase de dictaminar y solo confirmarlo. Las tarifas
 * vivas (cuotas fijas + 2 tabuladores) viven en `dilesa.gastos_notariales_*` y
 * se editan cada enero — ver iniciativa `dilesa-gastos-notariales`.
 */

/** Una fila de un tabulador escalonado (compraventa o apertura de crédito). */
export type TabuladorFila = {
  orden: number;
  limiteInferior: number;
  /** `null` = último escalón sin tope. */
  limiteSuperior: number | null;
  /** Ningún derechohabiente con propiedad previa (beneficio 50%). */
  valorBeneficio: number;
  /** Algún derechohabiente con propiedad previa (cuota plena). */
  valorParticular: number;
};

/**
 * Config vigente de gastos notariales: cuotas fijas + parámetros + los 2
 * tabuladores. Espejo en camelCase de `dilesa.gastos_notariales_config` +
 * `dilesa.gastos_notariales_tabulador` (el mapeo desde DB se hace al cargar).
 */
export type GastosNotarialesConfig = {
  anio: number;
  /** ISAI = isaiPct × valor de escrituración (0.03 = 3%). */
  isaiPct: number;
  muni: {
    certificacionPlanos: number;
    copiasFotostaticas: number;
    avaluoPrevio: number;
    valuacionCatastral: number;
    derechos: number;
  };
  registroPublico: {
    clg: number;
    avisoPreventivo: number;
    /** Crédito hasta este monto → cuota fija; arriba entra el tabulador. */
    aperturaUmbralCuotaFija: number;
    aperturaCuotaFija: number;
  };
  otros: {
    cnprPorDerechohabiente: number;
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
};

export type GastoBloque = {
  clave: 'municipio' | 'registro_publico' | 'otros';
  etiqueta: string;
  lineas: GastoLinea[];
  subtotal: number;
};

export type GastosNotarialesDesglose = {
  bloques: GastoBloque[];
  total: number;
  /** Derechohabientes considerados (1 titular + co-acreditado si lo hay). */
  numDerechohabientes: number;
};
