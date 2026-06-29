/**
 * Gastos notariales de DILESA — cálculo puro (v2, cotizador oficial).
 *
 * `calcularGastosNotariales(input, config)` reproduce el cotizador del notario
 * (Municipio + Registro Público + Otros) para la categoría de la config que se
 * le pase (interés social / residencial medio). Función pura y sin I/O: la
 * config se carga aparte (de `dilesa.gastos_notariales_*`) y se pasa como
 * argumento. Ver iniciativa `dilesa-gastos-notariales`.
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
 * (límites sin solape). El último escalón tiene `limiteSuperior = null` y es el
 * tope superior del cotizador. Si el monto excede y no hay escalón abierto, hace
 * clamp al de mayor límite.
 */
export function buscarEscalon(filas: TabuladorFila[], monto: number): TabuladorFila | null {
  if (monto <= 0 || filas.length === 0) return null;
  for (const f of filas) {
    const dentroInf = monto >= f.limiteInferior;
    const dentroSup = f.limiteSuperior == null || monto <= f.limiteSuperior;
    if (dentroInf && dentroSup) return f;
  }
  return filas.reduce((a, b) => (b.limiteInferior > a.limiteInferior ? b : a));
}

function valorTabulador(fila: TabuladorFila | null, tienePropiedad: boolean): number {
  if (!fila) return 0;
  return tienePropiedad ? fila.valorParticular : fila.valorBeneficio;
}

/**
 * Apertura de crédito de un derechohabiente: cuota fija hasta el umbral; arriba
 * entra el tabulador por monto de crédito (columna DILESA — no depende de la
 * propiedad, eso solo aplica a la compraventa).
 */
function calcularApertura(montoCredito: number, config: GastosNotarialesConfig): number {
  if (montoCredito <= 0) return 0;
  if (montoCredito <= config.registroPublico.aperturaUmbralCuotaFija) {
    return config.registroPublico.aperturaCuotaFija;
  }
  const fila = buscarEscalon(config.tabuladorApertura, montoCredito);
  return fila ? fila.valorBeneficio : config.registroPublico.aperturaCuotaFija;
}

/**
 * Calcula los gastos notariales completos con su desglose por bloque, según el
 * cotizador de la categoría de `config`. El total precarga
 * `dilesa.ventas.gastos_escrituracion`; Dirección lo confirma o ajusta.
 */
export function calcularGastosNotariales(
  input: GastosNotarialesInput,
  config: GastosNotarialesConfig
): GastosNotarialesDesglose {
  const tienePropiedad = input.tienePropiedad ?? false;
  const numDerechohabientes = 1 + (input.montoCreditoCotitular > 0 ? 1 : 0);
  const m = config.muni;
  const o = config.otros;

  const isai = round2(input.valorEscrituracion * config.isaiPct);
  const valorCatastral = input.valorCatastral ?? 0;
  const faltaValorCatastral = !(valorCatastral > 0) && m.valuacionCatastralPct > 0;
  const valuacionCatastral = round2(valorCatastral * m.valuacionCatastralPct);
  const compraventa = valorTabulador(
    buscarEscalon(config.tabuladorCompraventa, input.valorEscrituracion),
    tienePropiedad
  );
  const aperturaI = calcularApertura(input.montoCreditoTitular, config);
  const aperturaII =
    input.montoCreditoCotitular > 0 ? calcularApertura(input.montoCreditoCotitular, config) : 0;

  const fijo = (clave: string, etiqueta: string, monto: number): GastoLinea => ({
    clave,
    etiqueta,
    monto,
    calculado: false,
  });
  const calc = (clave: string, etiqueta: string, monto: number, pendiente = false): GastoLinea => ({
    clave,
    etiqueta,
    monto,
    calculado: true,
    pendiente,
  });

  // Líneas por bloque, omitiendo las cuotas en $0 (conceptos que no aplican a la
  // categoría — p.ej. SIMAS/avalúo solo en residencial medio).
  const municipio: GastoLinea[] = [
    calc('isai', 'ISAI (3%)', isai),
    fijo('certificacion_planos', 'Certificación de planos', m.certificacionPlanos),
    fijo('copias_fotostaticas', 'Copias fotostáticas', m.copiasFotostaticas),
    fijo('forma_isai_muni', 'Forma ISAI', m.formaIsai),
    fijo('avaluo_previo', 'Avalúo previo', m.avaluoPrevio),
    calc('valuacion_catastral', 'Valuación catastral', valuacionCatastral, faltaValorCatastral),
    fijo('derechos', 'Derechos', m.derechos),
    fijo('no_adeudo_simas', 'No adeudo SIMAS', m.noAdeudoSimas),
  ].filter((l) => l.monto > 0 || l.pendiente);

  const registroPublico: GastoLinea[] = [
    fijo('clg', 'Cert. lib. gravamen', config.registroPublico.clg),
    fijo('aviso_preventivo', 'Aviso preventivo', config.registroPublico.avisoPreventivo),
    calc('compraventa', 'Compraventa', compraventa),
    calc('apertura_credito_i', 'Apertura crédito I', aperturaI),
    calc('apertura_credito_ii', 'Apertura crédito II', aperturaII),
  ].filter((l) => l.monto > 0 || l.clave === 'aviso_preventivo');

  const otros: GastoLinea[] = [
    fijo('avaluo', 'Avalúo', o.avaluo),
    fijo('cnpc', 'CNPC', o.cnpc),
    fijo('cnpr', 'CNPR', o.cnpr),
    fijo('aviso_definitivo', 'Aviso definitivo', o.avisoDefinitivo),
    fijo('forma_isai', 'Forma ISAI', o.formaIsai),
    fijo('copia_certificada', 'Copia certificada', o.copiaCertificada),
    fijo('plano', 'Plano', o.plano),
    fijo('kinegrama', 'Kinegrama', o.kinegrama),
  ].filter((l) => l.monto > 0);

  const armar = (
    clave: GastoBloque['clave'],
    etiqueta: string,
    lineas: GastoLinea[]
  ): GastoBloque => ({
    clave,
    etiqueta,
    lineas,
    subtotal: round2(lineas.reduce((s, l) => s + l.monto, 0)),
  });

  const bloques: GastoBloque[] = [
    armar('municipio', 'Municipio', municipio),
    armar('registro_publico', 'Registro Público', registroPublico),
    armar('otros', 'Otros', otros),
  ];

  return {
    categoria: config.categoria,
    bloques,
    total: round2(bloques.reduce((s, b) => s + b.subtotal, 0)),
    numDerechohabientes,
    faltaValorCatastral,
  };
}
