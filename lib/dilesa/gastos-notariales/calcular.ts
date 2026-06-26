/**
 * Gastos notariales de DILESA — cálculo puro.
 *
 * `calcularGastosNotariales(input, config)` reproduce el presupuesto del notario
 * (Municipio + Registro Público + Otros) para precargarlo en la fase de
 * dictaminar. Función pura y sin I/O: la config se carga aparte (de
 * `dilesa.gastos_notariales_*`) y se pasa como argumento — así el cálculo se
 * testea contra el ejemplo de Memo sin tocar la DB. Ver iniciativa
 * `dilesa-gastos-notariales`.
 */

import type {
  GastoBloque,
  GastoLinea,
  GastosNotarialesConfig,
  GastosNotarialesDesglose,
  GastosNotarialesInput,
  TabuladorFila,
} from './tipos';

/** Redondea a 2 decimales (evita artefactos de float al sumar). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Escalón del tabulador para un monto. Cada escalón cubre `(inferior, superior]`
 * (los límites se seedean sin solape: inferior = superior_anterior + 0.01).
 * Si el monto excede el último escalón con tope, hace clamp al de mayor límite.
 */
export function buscarEscalon(filas: TabuladorFila[], monto: number): TabuladorFila | null {
  if (monto <= 0 || filas.length === 0) return null;
  for (const f of filas) {
    const dentroInf = monto >= f.limiteInferior;
    const dentroSup = f.limiteSuperior == null || monto <= f.limiteSuperior;
    if (dentroInf && dentroSup) return f;
  }
  // Fuera del último escalón con tope: usa el de mayor límite inferior.
  return filas.reduce((a, b) => (b.limiteInferior > a.limiteInferior ? b : a));
}

/** Valor de la columna del tabulador según haya o no propiedad previa. */
function valorTabulador(fila: TabuladorFila | null, tienePropiedad: boolean): number {
  if (!fila) return 0;
  return tienePropiedad ? fila.valorParticular : fila.valorBeneficio;
}

/**
 * Apertura de crédito de un derechohabiente: cuota fija hasta el umbral; arriba
 * entra el tabulador por monto de crédito.
 */
function calcularApertura(
  montoCredito: number,
  config: GastosNotarialesConfig,
  tienePropiedad: boolean
): number {
  if (montoCredito <= 0) return 0;
  if (montoCredito <= config.registroPublico.aperturaUmbralCuotaFija) {
    return config.registroPublico.aperturaCuotaFija;
  }
  return valorTabulador(buscarEscalon(config.tabuladorApertura, montoCredito), tienePropiedad);
}

/**
 * Calcula los gastos notariales completos con su desglose por bloque. El total
 * precarga `dilesa.ventas.gastos_escrituracion`; Dirección lo confirma o ajusta
 * contra el presupuesto del notario.
 */
export function calcularGastosNotariales(
  input: GastosNotarialesInput,
  config: GastosNotarialesConfig
): GastosNotarialesDesglose {
  const tienePropiedad = input.tienePropiedad ?? false;
  const numDerechohabientes = 1 + (input.montoCreditoCotitular > 0 ? 1 : 0);

  const isai = round2(input.valorEscrituracion * config.isaiPct);
  const compraventa = valorTabulador(
    buscarEscalon(config.tabuladorCompraventa, input.valorEscrituracion),
    tienePropiedad
  );
  const aperturaI = calcularApertura(input.montoCreditoTitular, config, tienePropiedad);
  const aperturaII =
    input.montoCreditoCotitular > 0
      ? calcularApertura(input.montoCreditoCotitular, config, tienePropiedad)
      : 0;
  const cnpr = round2(config.otros.cnprPorDerechohabiente * numDerechohabientes);

  const bloque = (
    clave: GastoBloque['clave'],
    etiqueta: string,
    lineas: GastoLinea[]
  ): GastoBloque => ({
    clave,
    etiqueta,
    lineas,
    subtotal: round2(lineas.reduce((s, l) => s + l.monto, 0)),
  });

  const fijo = (clave: string, etiqueta: string, monto: number): GastoLinea => ({
    clave,
    etiqueta,
    monto,
    calculado: false,
  });
  const calc = (clave: string, etiqueta: string, monto: number): GastoLinea => ({
    clave,
    etiqueta,
    monto,
    calculado: true,
  });

  const bloques: GastoBloque[] = [
    bloque('municipio', 'Municipio', [
      calc('isai', 'ISAI (3%)', isai),
      fijo('certificacion_planos', 'Certificación de planos', config.muni.certificacionPlanos),
      fijo('copias_fotostaticas', 'Copias fotostáticas', config.muni.copiasFotostaticas),
      fijo('avaluo_previo', 'Avalúo previo', config.muni.avaluoPrevio),
      fijo('valuacion_catastral', 'Valuación catastral', config.muni.valuacionCatastral),
      fijo('derechos', 'Derechos', config.muni.derechos),
    ]),
    bloque('registro_publico', 'Registro Público', [
      fijo('clg', 'Cert. lib. gravamen', config.registroPublico.clg),
      fijo('aviso_preventivo', 'Aviso preventivo', config.registroPublico.avisoPreventivo),
      calc('compraventa', 'Compraventa', compraventa),
      calc('apertura_credito_i', 'Apertura crédito I', aperturaI),
      calc('apertura_credito_ii', 'Apertura crédito II', aperturaII),
    ]),
    bloque('otros', 'Otros', [
      calc('cnpr', `CNPR (×${numDerechohabientes})`, cnpr),
      fijo('aviso_definitivo', 'Aviso definitivo', config.otros.avisoDefinitivo),
      fijo('forma_isai', 'Forma ISAI', config.otros.formaIsai),
      fijo('copia_certificada', 'Copia certificada', config.otros.copiaCertificada),
      fijo('plano', 'Plano', config.otros.plano),
      fijo('kinegrama', 'Kinegrama', config.otros.kinegrama),
    ]),
  ];

  return {
    bloques,
    total: round2(bloques.reduce((s, b) => s + b.subtotal, 0)),
    numDerechohabientes,
  };
}
