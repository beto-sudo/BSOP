/**
 * Motor de cuadratura de una venta DILESA.
 *
 * Replica el modelo financiero que vivía en Coda (tabla Clientes,
 * grid-mMIXWCSfyr) como una función pura y testeable. Es la fuente única de
 * verdad para la mini-cuadratura del Expediente de Operación, la pestaña
 * Cuadratura y el copiloto de cierre (iniciativa `dilesa-ventas-expediente`).
 *
 * Fórmulas (de Coda):
 *   Depósitos Recibidos       = Σ todos los depósitos del cliente.
 *   Monto Disponible          = Σ depósitos(Directo Cliente) + crédito titular
 *                               + crédito co-titular + pagaré autorizado (CD).
 *   Saldo Cobranza            = Valor de Escrituración − Monto Disponible
 *                               (cobertura cruda: solo efectivo + crédito).
 *   Saldo Cliente (efectivo)  = Saldo Cobranza − Descuento Otorgado
 *                               + Cheque Notaría girado.
 *                               El descuento AUTORIZADO cubre el faltante de
 *                               cobranza; el cheque a notaría es un giro que se
 *                               fondea de ese mismo descuento (o del excedente
 *                               de cobranza). Equivale a: Cheque girado −
 *                               (Disponible − Escrituración + Descuento) =
 *                               Cheque girado − Excedente Disponible.
 *                               ≤ TOLERANCIA_SALDO ⇒ operación cubierta.
 *                               (Decisión Beto 2026-06-15: el descuento y el
 *                               cheque entran al saldo; antes el saldo era ciego
 *                               al descuento y un descuento perdonado se veía
 *                               como deuda. El cheque usa el CAPTURADO, no el
 *                               calculado: mide un giro real, no uno sugerido.)
 *   Cheque Notaría (cálculo)  = min(Gastos Escrituración − Apoyo Infonavit,
 *                                Monto Disponible − Valor Escrituración
 *                                + Descuento Otorgado Total).
 *   Valor Real Venta Dilesa   = Depósitos Recibidos − Cheque Notaría + Pagaré.
 *   Valor Facturado           = SUMA de los CFDIs timbrados: la factura de la
 *                               escrituración (el CFDI real `valorFacturadoReal`
 *                               si existe, si no el Valor Escrituración) + Σ
 *                               depósitos del cliente con recibo (cada enganche
 *                               se factura con su propio recibo-CFDI). El
 *                               estimado de respaldo (con el valor de
 *                               escrituración) se expone como
 *                               `valorFacturadoSugerido`.
 *   Monto Nota de Crédito     = Valor Facturado − Valor Real Venta Dilesa.
 *                               (acredita de vuelta el enganche facturado dos
 *                               veces + el descuento.)
 *                               Es un DERIVADO, no el total del CFDI de NC: con
 *                               factura real usa el facturado real; la Fase 13
 *                               valida aparte que el CFDI de NC coincida.
 *   Descuento Real            = Valor Escrituración − Valor Real Venta Dilesa.
 *   Comisión Vendedor         = Escrituración × (1.5% Loma Verde / 1.0% resto).
 *   Comisión Gerencia         = Escrituración × 0.5%.
 *
 * GAPS de captura (aún no en BSOP; el motor los acepta opcionales y asume 0):
 * apoyoInfonavit (por tipo de crédito), los 4 buckets de descuento, y el
 * detalle por depósito (tipo Directo Cliente / con recibo de caja).
 */

const n = (v: number | null | undefined): number => (v == null ? 0 : Number(v));
const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export type DepositoCuadratura = {
  monto: number | null;
  /** Tipo "Deposito Directo Cliente" (cuenta para Monto Disponible). */
  directoCliente?: boolean;
  /**
   * Tiene PDF Recibo de Caja. Suma al Valor Facturado SOLO si además es
   * `directoCliente`: la disposición del crédito (fuente='institucion') nunca
   * factura, aunque traiga un recibo de caja importado de Coda. La fórmula de
   * Coda filtraba por tipo de depósito, no por la sola presencia del PDF.
   */
  tieneRecibo?: boolean;
};

export type CuadraturaInput = {
  valorEscrituracion: number | null;
  montoCreditoTitular: number | null;
  montoCreditoCotitular: number | null;
  /** Pagaré autorizado del crédito directo (Fase 10). */
  montoCreditoDirecto: number | null;
  /**
   * Monto detonado: el disbursement real del crédito (Fase 12 Detonada). Es la
   * "detonación" que usa el archivo de Michelle para el Valor Real Venta DILESA.
   * null antes de detonar ⇒ se usa el crédito institución como estimado.
   */
  montoDetonado?: number | null;
  /** Cheque enviado a la notaría (capturado en Fase 11). */
  montoChequeNotaria: number | null;
  gastosEscrituracion: number | null;
  /** GAP: apoyo del Infonavit a gastos de escrituración (por tipo de crédito). */
  apoyoInfonavit?: number | null;
  /** GAP: suma de los 4 buckets de descuento otorgado. */
  descuentoOtorgadoTotal?: number | null;
  /**
   * Tope CONFIABLE de descuento autorizado (regla Beto 2026-06-15: el descuento
   * que entra al saldo está topado a lo autorizado desde el inicio). Pasar SOLO
   * cuando la autorización es de fiar — el monto de la promoción de la Solicitud
   * de Asignación. null/undefined ⇒ sin tope (ventas legacy de Coda cuyo
   * `descuento_maximo_autorizado` no es confiable: 159/315 lo exceden por mal
   * dato; ahí no se topa para no inventar pendientes falsos).
   */
  descuentoMaximoAutorizado?: number | null;
  /** Para referencia (no entra al saldo). */
  precioAsignacion?: number | null;
  /**
   * Desglose nuevo (ADR-045). El motor usa el MODELO DESGLOSADO cuando hay
   * marcador del desglose nuevo (`promocionGastos` o `precioBase` poblado): el
   * "descuento" que cubre gastos = `promocionGastos` (bono, costo DILESA) +
   * `sobreprecioAdicionales` (lo paga el crédito). Sin marcador (cerradas/legacy)
   * → modelo viejo (`descuentoOtorgadoTotal` topado), fallback que NO altera nada
   * histórico. `precioBase`/`incrementoCredito` alimentan el panel de precio.
   *
   * OJO: `sobreprecioAdicionales` se alimenta de `dilesa.ventas.productos_adicionales`,
   * que YA estaba poblado en TODAS las ventas — por eso NO es marcador del
   * desglose (lo sería todo el histórico). Solo entra al saldo cuando el desglose
   * ya está activo por `promocionGastos`/`precioBase`.
   */
  precioBase?: number | null;
  incrementoCredito?: number | null;
  sobreprecioAdicionales?: number | null;
  promocionGastos?: number | null;
  /**
   * Geometría del lote (premios congelados de la Solicitud de Asignación, ver
   * migración 20260618022906). Componentes de la cadena de precio que van entre
   * el precio base y el incremento de crédito:
   *   base + excedente + frenteVerde + esquina + ventaFuturo + incremento + sobreprecio = escrituración.
   * Cada uno opcional (null/undefined ⇒ 0). Solo se muestran en `formacionPrecio`
   * cuando el desglose está activo (`tieneDesglose`).
   */
  valorExcedenteTerreno?: number | null;
  valorFrenteVerde?: number | null;
  valorEsquina?: number | null;
  valorVentaFuturo?: number | null;
  /**
   * Total del CFDI de la factura de ESCRITURACIÓN (Fase 13,
   * `dilesa.ventas.valor_facturado`) — la factura de la operación que coincide
   * con la escritura. El motor lo usa como el componente "factura de
   * escrituración" del Valor Facturado y le SUMA los recibos-CFDI del enganche
   * (depósitos del cliente con recibo). null/undefined ⇒ aún no hay factura: usa
   * el valor de escrituración. Solo pasarlo cuando exista el adjunto
   * `factura_xml` (un snapshot de Coda en `valor_facturado` = escrituración no
   * es una factura real, pero como coincide con la escritura el resultado es el
   * mismo).
   */
  valorFacturadoReal?: number | null;
  depositos: DepositoCuadratura[];
  /** Nombre del proyecto, para la tasa de comisión del vendedor. */
  proyectoNombre?: string | null;
};

export type Cuadratura = {
  depositosRecibidos: number;
  depositosDirectoCliente: number;
  creditoInstitucion: number;
  montoCreditoDirecto: number;
  montoDisponible: number;
  /** Saldo de cobranza cruda: Valor Escrituración − Monto Disponible (ciego al
   *  descuento). Se conserva para auditoría — cuánto faltó de puro efectivo. */
  saldoCobranza: number;
  /** Saldo efectivo: cobranza − descuento otorgado + cheque a notaría girado. */
  saldoCliente: number;
  /** Suma de los 4 buckets de descuento otorgado (eco del input, para la UI). */
  descuentoOtorgado: number;
  /** Descuento efectivamente aplicado al saldo: `descuentoOtorgado` topado al
   *  máximo autorizado confiable (= otorgado cuando no hay tope). */
  descuentoAplicado: number;
  /** Cheque a notaría CAPTURADO (0 si aún no se gira). Distinto del calculado. */
  chequePagado: number;
  /** true si el descuento autorizado + el disponible cubren la escrituración
   *  (saldo efectivo ≤ TOLERANCIA_SALDO). */
  cubierta: boolean;
  /** Cheque a notaría sugerido por la fórmula (vs el capturado). */
  chequeNotariaCalculado: number;
  /** Cheque usado para los derivados: el capturado si existe, si no el calculado. */
  chequeNotariaUsado: number;
  valorRealVentaDilesa: number;
  /** Valor Facturado efectivo: el del CFDI real si se pasó, si no el estimado. */
  valorFacturado: number;
  /** Estimado de la fórmula de Coda (escrituración + Σ dep. cliente con recibo). */
  valorFacturadoSugerido: number;
  /** NC efectiva: `valorFacturado` (efectivo) − valor real venta DILESA. */
  montoNotaCredito: number;
  /** NC estimada: `valorFacturadoSugerido` − valor real venta DILESA. */
  montoNotaCreditoSugerido: number;
  descuentoReal: number;
  comisionVendedor: number;
  comisionGerencia: number;
  /**
   * ADR-045: true si la venta trae el desglose nuevo poblado (modelo
   * desglosado). false ⇒ se usó el modelo viejo (fallback legacy/cerradas).
   */
  tieneDesglose: boolean;
  /**
   * Desglose de la cobertura del presupuesto notarial (las 4 fuentes), solo
   * cuando `tieneDesglose`. `null` en ventas legacy/cerradas. Para el panel.
   */
  coberturaGastos: {
    /** Gastos de escrituración netos del apoyo Infonavit (= cheque a notaría). */
    gastosNetos: number;
    apoyoInfonavit: number;
    /** Promoción/bono de gastos (costo de DILESA). */
    promocion: number;
    /** Enganche/depósitos del cliente. */
    engancheCliente: number;
    /** Sobreprecio (productos adicionales) — lo paga el crédito. */
    sobreprecio: number;
    /** Pagaré necesario = faltante tras promoción + enganche + sobreprecio. */
    pagareNecesario: number;
  } | null;
  /**
   * Formación del precio de escrituración (ADR-045 + geometría desglosada
   * 20260618). La cadena: precioBase + geometría (excedente/frente verde/esquina/
   * venta futuro) + incrementoCredito = precioInterno; + adicionales =
   * valorEscrituracion. `null` en legacy/cerradas.
   */
  formacionPrecio: {
    precioBase: number;
    valorExcedenteTerreno: number;
    valorFrenteVerde: number;
    valorEsquina: number;
    valorVentaFuturo: number;
    /** Suma de los premios de geometría del lote. */
    geometria: number;
    incrementoCredito: number;
    /** Precio interno DILESA = base + geometría + incremento (su venta real). */
    precioInterno: number;
    adicionales: number;
    valorEscrituracion: number;
  } | null;
  /**
   * Saldo del PRECIO de escrituración (ADR-045): valor escrituración − crédito
   * institución. `0`/negativo ⇒ el crédito cubre el precio. El saldo de GASTOS
   * del cliente es `coberturaGastos.pagareNecesario`, NO esto. `null` en
   * legacy/cerradas (ahí el "saldo" es `saldoCliente`).
   */
  saldoPrecioEscrituracion: number | null;
  /**
   * Desglose de facturación (ADR-045), solo con desglose. Factura de venta
   * (escrituración) + factura de enganche = total facturado; − NC = neto (=
   * escritura). `null` en legacy/cerradas.
   */
  desgloseFacturacion: {
    facturaVenta: number;
    facturaEnganche: number;
    totalFacturado: number;
    notaCredito: number;
    netoFacturado: number;
  } | null;
  /**
   * Señal de doble conteo: depósitos fuente-cliente + crédito institución
   * exceden el valor de escrituración (+ gastos netos legítimos) por más del
   * umbral. Típico cuando la disposición del crédito se capturó como abono
   * fuente='cliente' — el mismo dinero entra dos veces al disponible.
   */
  posibleDobleConteo: boolean;
};

/**
 * Umbral del flag de doble conteo: 5% del valor de escrituración. El cliente
 * legítimamente deposita de más (gastos de escrituración, ya descontados) por
 * montos chicos; una disposición duplicada es el monto del crédito completo.
 */
const UMBRAL_DOBLE_CONTEO = 0.05;

/**
 * Tolerancia (pesos) del saldo efectivo para marcar "cubierta". Absorbe el
 * redondeo de captura: el cheque a notaría se captura en pesos enteros mientras
 * gastos y crédito traen centavos, así que una operación perfectamente saldada
 * puede dar un residual de unos pocos pesos. Arriba de esto es un faltante real
 * (o un cheque girado por encima del descuento autorizado) que hay que revisar.
 */
const TOLERANCIA_SALDO = 5;

/** ¿El proyecto cae en la tasa alta de comisión (Loma Verde / Loma Verde 2)? */
function esLomaVerde(proyecto: string | null | undefined): boolean {
  return /loma\s*verde/i.test(proyecto ?? '');
}

/**
 * Tope de descuento autorizado que entra al saldo (`descuentoMaximoAutorizado`).
 * Regla única (iniciativa `dilesa-descuentos-promos`, Sprint 3):
 *  - Con promo en la solicitud → el monto de la promo (tope confiable).
 *  - Venta nativa de BSOP sin promo → 0: el descuento solo se autoriza vía el
 *    catálogo de promociones; un descuento sin promo no se acredita al saldo
 *    (la vía para habilitarlo es dar de alta la promo).
 *  - Venta legacy de Coda sin promo → null (sin tope): no inventar pendientes
 *    falsos en histórico (el `descuento_maximo_autorizado` legacy no es de fiar).
 * `esLegacy` = la venta vino de Coda (tiene `coda_row_id`).
 */
export function topeDescuentoAutorizado(
  promoMonto: number | null | undefined,
  esLegacy: boolean
): number | null {
  if (promoMonto != null) return promoMonto;
  return esLegacy ? null : 0;
}

export function calcularCuadratura(i: CuadraturaInput): Cuadratura {
  const valorEscrituracion = n(i.valorEscrituracion);
  const creditoInstitucion = n(i.montoCreditoTitular) + n(i.montoCreditoCotitular);
  const montoCreditoDirecto = n(i.montoCreditoDirecto);

  const depositosRecibidos = i.depositos.reduce((s, d) => s + n(d.monto), 0);
  const depositosDirectoCliente = i.depositos
    .filter((d) => d.directoCliente)
    .reduce((s, d) => s + n(d.monto), 0);
  const depositosConRecibo = i.depositos
    .filter((d) => d.tieneRecibo && d.directoCliente)
    .reduce((s, d) => s + n(d.monto), 0);

  const montoDisponible = depositosDirectoCliente + creditoInstitucion + montoCreditoDirecto;
  const saldoCobranza = round2(valorEscrituracion - montoDisponible);

  const descuentoOtorgadoTotal = n(i.descuentoOtorgadoTotal);
  // ADR-045: con el desglose poblado (venta nueva o en proceso), el "descuento"
  // que reduce el saldo = promoción (bono, costo DILESA) + sobreprecio (lo paga
  // el crédito). Sin desglose (ventas cerradas/legacy) → modelo viejo:
  // descuento_total topado al máximo autorizado. Fallback que NO altera nada
  // histórico.
  //
  // La detección usa los marcadores del desglose NUEVO (`promocionGastos` /
  // `precioBase`), que solo se pueblan al migrar/asignar. NO usa
  // `sobreprecioAdicionales`: ese viene de `productos_adicionales`, que ya estaba
  // poblado en TODAS las ventas (legacy incluido) — usarlo activaría el modelo
  // nuevo en todo el histórico y le movería el saldo.
  const tieneDesglose = i.promocionGastos != null || i.precioBase != null;
  const promocionGastos = n(i.promocionGastos);
  const sobreprecioAdicionales = n(i.sobreprecioAdicionales);
  // Tope a lo autorizado desde el inicio: el saldo solo acredita el descuento
  // hasta el máximo CONFIABLE (promo de la solicitud). Sin tope confiable
  // (legacy) se aplica el otorgado completo. El exceso sobre el tope NO reduce
  // el saldo (queda como pendiente a revisar).
  const descuentoAplicado = tieneDesglose
    ? round2(promocionGastos + sobreprecioAdicionales)
    : i.descuentoMaximoAutorizado != null
      ? Math.min(descuentoOtorgadoTotal, Math.max(0, n(i.descuentoMaximoAutorizado)))
      : descuentoOtorgadoTotal;
  const gastosNetos = n(i.gastosEscrituracion) - n(i.apoyoInfonavit);
  const excedenteDisponible = montoDisponible - valorEscrituracion + descuentoAplicado;
  // Con desglose, el cheque a notaría cubre los gastos netos COMPLETOS (las 4
  // fuentes los fondean; ADR-045). Sin desglose, la fórmula vieja de Coda
  // (capeada al excedente disponible) — fallback intacto.
  const chequeNotariaCalculado = tieneDesglose
    ? round2(gastosNetos)
    : round2(Math.min(gastosNetos, excedenteDisponible));

  // Cheque a notaría GIRADO (capturado en Fase 11; 0 si aún no se gira). El
  // saldo efectivo usa este, no el calculado: mide un giro real contra el
  // descuento, no una sugerencia.
  const chequePagado = round2(n(i.montoChequeNotaria));
  // Saldo efectivo: el descuento aplicado cubre el faltante de cobranza y el
  // cheque girado se fondea de ese descuento (o del excedente). Equivale a
  // `chequePagado − excedenteDisponible`.
  const saldoCliente = round2(saldoCobranza - descuentoAplicado + chequePagado);
  const cubierta = saldoCliente <= TOLERANCIA_SALDO;

  // ADR-045: desglose de las 4 fuentes que cubren el presupuesto notarial
  // (gastos netos). Solo con desglose poblado; el pagaré es el faltante tras
  // promoción + enganche del cliente + sobreprecio.
  const gastosNetosR = round2(gastosNetos);
  const pagareNecesario = tieneDesglose
    ? round2(
        Math.max(
          0,
          gastosNetosR - promocionGastos - depositosDirectoCliente - sobreprecioAdicionales
        )
      )
    : 0;
  const coberturaGastos = tieneDesglose
    ? {
        gastosNetos: gastosNetosR,
        apoyoInfonavit: round2(n(i.apoyoInfonavit)),
        promocion: round2(promocionGastos),
        engancheCliente: round2(depositosDirectoCliente),
        sobreprecio: round2(sobreprecioAdicionales),
        pagareNecesario,
      }
    : null;

  // ADR-045 + geometría 20260618: formación del precio de escrituración (cadena
  // congelada de la Solicitud de Asignación). precio_base + geometría del lote
  // (excedente/frente verde/esquina/venta futuro) + incremento_credito = precio
  // interno DILESA (su venta real); + sobreprecio (productos adicionales) = valor
  // de escrituración. Solo con desglose poblado.
  const geometria = round2(
    n(i.valorExcedenteTerreno) + n(i.valorFrenteVerde) + n(i.valorEsquina) + n(i.valorVentaFuturo)
  );
  const precioInterno = tieneDesglose
    ? round2(n(i.precioBase) + geometria + n(i.incrementoCredito))
    : 0;
  const formacionPrecio = tieneDesglose
    ? {
        precioBase: round2(n(i.precioBase)),
        valorExcedenteTerreno: round2(n(i.valorExcedenteTerreno)),
        valorFrenteVerde: round2(n(i.valorFrenteVerde)),
        valorEsquina: round2(n(i.valorEsquina)),
        valorVentaFuturo: round2(n(i.valorVentaFuturo)),
        geometria,
        incrementoCredito: round2(n(i.incrementoCredito)),
        precioInterno,
        adicionales: round2(sobreprecioAdicionales),
        valorEscrituracion: round2(valorEscrituracion),
      }
    : null;

  // ADR-045: saldo del PRECIO de escrituración (lo cubre el crédito institución;
  // el pagaré es de GASTOS, no de precio). Solo con desglose. El header y el
  // panel lo leen para NO exponer `saldoCliente` (que mezcla el excedente del
  // precio con el descuento de gastos → el −74,651 sin sentido). El saldo de
  // gastos del cliente es `coberturaGastos.pagareNecesario`.
  const saldoPrecioEscrituracion = tieneDesglose
    ? round2(valorEscrituracion - creditoInstitucion)
    : null;

  // El crédito directo (pagaré) queda fuera: sus pagos sí son del cliente.
  const posibleDobleConteo =
    valorEscrituracion > 0 &&
    creditoInstitucion > 0 &&
    depositosDirectoCliente + creditoInstitucion - valorEscrituracion - Math.max(gastosNetos, 0) >
      valorEscrituracion * UMBRAL_DOBLE_CONTEO;

  // El formulado de Coda usa el cheque CAPTURADO; si aún no se captura,
  // caemos al calculado para no dejar los derivados en blanco.
  const chequeNotariaUsado = round2(
    i.montoChequeNotaria != null ? n(i.montoChequeNotaria) : chequeNotariaCalculado
  );

  // Valor Real Venta DILESA = lo que DILESA realiza NETO: crédito (detonación) +
  // enganche del cliente − cheque a notaría (los gastos que pasan al notario NO
  // son ingreso de DILESA) + pagaré. Es la fórmula operativa que validan Michelle
  // (Notas de crédito) y Ale (participación), alineada el 2026-06-18 — antes el
  // desglose usaba el precio interno BRUTO y no restaba el cheque, por lo que la
  // NC no cuadraba. Con desglose se usa el crédito de la columna (los depósitos
  // solos dan negativo en FOVISSSTE); sin desglose, la fórmula vieja por depósitos.
  // Detonación = disbursement real del crédito (Fase 12); antes de detonar se usa
  // el crédito institución como estimado (mismo criterio que el archivo de Michelle).
  const detonacion = i.montoDetonado != null ? n(i.montoDetonado) : creditoInstitucion;
  const valorRealVentaDilesa = tieneDesglose
    ? round2(detonacion + depositosDirectoCliente - chequeNotariaUsado + montoCreditoDirecto)
    : round2(depositosRecibidos - chequeNotariaUsado + montoCreditoDirecto);
  // Valor Facturado = SUMA de los CFDIs timbrados de la operación: la factura de
  // la escrituración + los recibos de caja con CFDI del enganche (cada depósito
  // del cliente con recibo se factura aparte). La factura de escrituración toma
  // el total del CFDI real cuando existe (`valorFacturadoReal`), si no el valor
  // de escrituración. El enganche se factura primero (su recibo-CFDI) y la
  // factura de la operación coincide con la escritura; la NC acredita de vuelta
  // el enganche + el descuento para que el neto cuadre con el Valor Real.
  // (Modelo confirmado por Beto 2026-06-15. Antes se usaba SOLO el CFDI de la
  // escrituración y se dejaba fuera el enganche → NC subvaluada.)
  const facturaEscrituracion =
    i.valorFacturadoReal != null ? round2(n(i.valorFacturadoReal)) : valorEscrituracion;
  const valorFacturado = round2(facturaEscrituracion + depositosConRecibo);
  // Estimado de respaldo: mismo cálculo con el valor de escrituración en vez del
  // CFDI real. Igual al efectivo salvo que el CFDI de escrituración difiera.
  const valorFacturadoSugerido = round2(valorEscrituracion + depositosConRecibo);
  // Nota de Crédito = Facturado − Valor Real (en AMBOS modelos, alineado a la
  // fórmula de Michelle el 2026-06-18). Acredita lo facturado que NO es ingreso
  // neto de DILESA: el enganche facturado dos veces (escritura + su recibo-CFDI)
  // MÁS el cheque a notaría (pass-through al notario), menos el pagaré. Antes el
  // desglose la dejaba en solo el enganche y omitía el cheque → no cuadraba.
  const montoNotaCredito = round2(valorFacturado - valorRealVentaDilesa);
  const montoNotaCreditoSugerido = round2(valorFacturadoSugerido - valorRealVentaDilesa);
  // Con desglose, el "descuento real" = la promoción (lo que DILESA efectivamente
  // regala al cliente). El sobreprecio NO es descuento (es lo contrario: DILESA
  // cobra de más). Sin desglose: la fórmula de Coda (escrituración − valor real).
  const descuentoReal = tieneDesglose
    ? round2(promocionGastos)
    : round2(valorEscrituracion - valorRealVentaDilesa);
  // Desglose de facturación: factura de venta (escrituración) + factura de
  // enganche = total facturado; − NC = neto facturado = Valor Real Venta DILESA
  // (lo que DILESA realiza neto del cheque a notaría). Alineado a Michelle el
  // 2026-06-18 (antes el neto se forzaba al valor de escritura).
  const desgloseFacturacion = tieneDesglose
    ? {
        facturaVenta: round2(valorEscrituracion),
        facturaEnganche: round2(depositosConRecibo),
        totalFacturado: round2(valorFacturado),
        notaCredito: montoNotaCredito,
        netoFacturado: round2(valorFacturado - montoNotaCredito),
      }
    : null;

  // Con desglose, las comisiones se calculan sobre el Valor Real Venta DILESA
  // menos los productos adicionales (el sobreprecio no comisiona) — base operativa
  // de Michelle/Ale (col "Venta Dilesa comisiones" = valor real − PA), alineada el
  // 2026-06-18 (antes era el precio interno bruto). Sin desglose, sobre el valor
  // de escrituración (fallback).
  const baseComision = tieneDesglose
    ? round2(valorRealVentaDilesa - sobreprecioAdicionales)
    : valorEscrituracion;
  const comisionVendedor = round2(baseComision * (esLomaVerde(i.proyectoNombre) ? 0.015 : 0.01));
  const comisionGerencia = round2(baseComision * 0.005);

  return {
    depositosRecibidos: round2(depositosRecibidos),
    depositosDirectoCliente: round2(depositosDirectoCliente),
    creditoInstitucion: round2(creditoInstitucion),
    montoCreditoDirecto: round2(montoCreditoDirecto),
    montoDisponible: round2(montoDisponible),
    saldoCobranza,
    saldoCliente,
    descuentoOtorgado: round2(descuentoOtorgadoTotal),
    descuentoAplicado: round2(descuentoAplicado),
    chequePagado,
    cubierta,
    chequeNotariaCalculado,
    chequeNotariaUsado,
    valorRealVentaDilesa,
    valorFacturado,
    valorFacturadoSugerido,
    montoNotaCredito,
    montoNotaCreditoSugerido,
    descuentoReal,
    comisionVendedor,
    comisionGerencia,
    tieneDesglose,
    coberturaGastos,
    formacionPrecio,
    saldoPrecioEscrituracion,
    desgloseFacturacion,
    posibleDobleConteo,
  };
}
