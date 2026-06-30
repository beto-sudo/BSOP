/**
 * Motor de cuadratura de una venta DILESA. Función pura y testeable, fuente
 * única de verdad para la mini-cuadratura del Expediente de Operación, la
 * pestaña Cuadratura y el copiloto de cierre (iniciativa
 * `dilesa-ventas-expediente`).
 *
 * DOS MODELOS según `tieneDesglose`:
 *  - DESGLOSADO (ADR-045 — ventas activas/nuevas, marcador `promocionGastos`/
 *    `precioBase`): sigue el modelo operativo de Michelle (Notas de crédito) y
 *    Ale (participación), alineado el 2026-06-18. Valor Real = detonación +
 *    enganche − cheque a notaría + pagaré; NC = Facturado − Valor Real;
 *    Descuento Real = Escrituración − Valor Real; comisiones sobre Valor Real −
 *    productos adicionales. La cobertura del presupuesto notarial se desglosa en
 *    sus fuentes (aportación DILESA + enganche + sobreprecio + pagaré).
 *  - LEGACY (ventas cerradas/Coda sin desglose): réplica del modelo de Coda
 *    (tabla Clientes, grid-mMIXWCSfyr). Fallback que NO altera nada histórico.
 *
 * Fórmulas (legacy de Coda; el desglosado las sobreescribe donde se indica):
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
 *   Valor Real Venta Dilesa   = Crédito (detonación) + Enganche del cliente
 *                               − Cheque Notaría + Pagaré (ambos modelos, ADR-050;
 *                               usa el crédito de la VENTA, no la suma de cxc_pagos).
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
 *   Comisión Vendedor         = (Valor Real − sobreprecio) × (1.5% LV / 1.0% resto).
 *   Comisión Gerencia         = (Valor Real − sobreprecio) × 0.5%.
 *
 * GAPS de captura (aún no en BSOP; el motor los acepta opcionales y asume 0):
 * apoyoInfonavit (por tipo de crédito), los 4 buckets de descuento, y el
 * detalle por depósito (tipo Directo Cliente / con recibo de caja).
 */

const n = (v: number | null | undefined): number => (v == null ? 0 : Number(v));
const round2 = (v: number): number => {
  const r = Math.round((v + Number.EPSILON) * 100) / 100;
  // Normaliza −0 → 0: una resta que cuadra exacto (p.ej. saldo de cobertura) puede
  // dar −0, que se formatea como "-$0.00" y rompe comparaciones `=== 0`.
  return r === 0 ? 0 : r;
};

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
   * `sobreprecioGastos` (el sobreprecio que sube el precio para que el crédito
   * absorba los gastos; lo paga el crédito, NO comisiona). Sin marcador
   * (cerradas/legacy) → modelo viejo (`descuentoOtorgadoTotal` topado), fallback
   * que NO altera nada histórico. `precioBase`/`incrementoCredito` alimentan el
   * panel de precio.
   *
   * Dos renglones distintos que ambos suman al precio de escrituración (los
   * separó la migración 20260623155819; antes se revolvían en un solo campo):
   *  - `sobreprecioGastos` (= `dilesa.ventas.sobreprecio_gastos_escrituracion`):
   *    fondea gastos, NO comisiona. Es el "sobreprecio" del modelo Michelle/Ale.
   *  - `productosAdicionales` (= `dilesa.ventas.productos_adicionales`): productos
   *    reales del paquete (closets/upgrades), SÍ comisionan (no se restan de la
   *    base de comisión). 0 en todo el histórico tras el backfill.
   * Ninguno es marcador del desglose.
   */
  precioBase?: number | null;
  incrementoCredito?: number | null;
  /** Sobreprecio para gastos de escrituración (lo absorbe el crédito; NO comisiona). */
  sobreprecioGastos?: number | null;
  /** Productos reales del paquete (closets/upgrades); SÍ comisionan. */
  productosAdicionales?: number | null;
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
   *  (saldo efectivo ≤ TOLERANCIA_SALDO). LEGACY: en ventas desglosadas mezcla
   *  precio + descuento; para gates usar `operacionCubierta`. */
  cubierta: boolean;
  /** Cobertura model-aware de TODA la operación (fuente única para el copiloto y
   *  gates). Desglose: crédito cubre precio Y fuentes cubren el presupuesto
   *  notarial. Legacy: = `cubierta`. */
  operacionCubierta: boolean;
  /** Saldo a mostrar cuando la operación NO está cubierta (faltante de precio o
   *  residual de gastos en desglose; saldo efectivo en legacy). */
  saldoOperacion: number;
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
  /** Precio de asignación (lista). Eco del input — referencia del resumen de precio
   *  del panel legacy (bono al cliente = precio de asignación − valor real). */
  precioAsignacion: number;
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
    /** Gastos notariales COMPLETOS (brutos, antes del subsidio Infonavit). */
    gastosBrutos: number;
    /** Gastos de escrituración netos del apoyo Infonavit (= cheque a notaría). */
    gastosNetos: number;
    /** Subsidio Infonavit a gastos (por tipo de crédito). 0 si no hay. */
    apoyoInfonavit: number;
    /** Promoción/bono de gastos AUTORIZADA (catálogo de promociones; costo DILESA).
     *  Es el TOPE; lo realmente usado para cubrir gastos es `aportacionPromocion`. */
    promocion: number;
    /** Promoción USADA para cubrir el presupuesto (= promo topada al faltante de
     *  gastos del lado DILESA). La línea "Aportación DILESA (promoción)" de la card. */
    aportacionPromocion: number;
    /** Enganche/depósitos del cliente aplicado a GASTOS: el excedente sobre el
     *  saldo del precio (el crédito institución cubre el precio primero; solo lo
     *  que sobra del enganche fondea el presupuesto notarial). En FOVISSSTE/IMSS
     *  el crédito ya cubre el precio → es el enganche completo. */
    engancheCliente: number;
    /** Enganche del cliente consumido por el saldo del PRECIO de escrituración
     *  (crédito institución insuficiente); NO fondea gastos. Para la nota del
     *  panel — evita el doble conteo del enganche (precio + gastos). */
    engancheAlPrecio: number;
    /** Sobreprecio para gastos de escrituración capturado — lo paga el crédito. */
    sobreprecio: number;
    /** Sobreprecio EFECTIVO que cubre el presupuesto (faltante del lado DILESA −
     *  promoción usada). Puede exceder a `sobreprecio` capturado: lo que DILESA
     *  concede de más subiendo el precio, pendiente de formalizar (Máx. Aportación). */
    sobreprecioCobertura: number;
    /** Pagaré necesario = faltante tras promoción autorizada + enganche + sobreprecio
     *  (lo que el cliente debería financiar si DILESA solo aporta la promo). Para
     *  la fase 10 / gate. NO es el pagaré real: cuando DILESA absorbe más que la
     *  promo (Máxima Aportación) el pagaré del cliente es menor (o 0). */
    pagareNecesario: number;
    /** Parte del pagaré (`montoCreditoDirecto`) asignada a GASTOS (= min(pagaré,
     *  `pagareNecesario`)). La card de cobertura resta esto, no el pagaré completo. */
    pagareGastos: number;
    /** Parte del pagaré que financia el residual de PRECIO (camino "Cobrar" de la
     *  dictaminación). 0 en ventas existentes; eleva el Valor Real y reduce la NC. */
    pagarePrecio: number;
    /** Saldo de la cobertura: gastos brutos − subsidio − promoción − enganche −
     *  sobreprecio − pagaré (la parte a gastos). ≈ 0 cuando las fuentes cubren. */
    saldoCobertura: number;
  } | null;
  /**
   * Formación del precio de escrituración (ADR-045 + geometría desglosada
   * 20260618). La cadena: precioBase + geometría (excedente/frente verde/esquina/
   * venta futuro) + incrementoCredito = precioInterno; + productos reales +
   * sobreprecio para gastos = valorEscrituracion. `null` en legacy/cerradas.
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
    /** Productos reales del paquete (closets/upgrades); SÍ comisionan. */
    productos: number;
    /** Sobreprecio para gastos de escrituración (lo absorbe el crédito; NO comisiona). */
    sobreprecioGastos: number;
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
   * Saldo del precio que el enganche pagado del cliente AÚN no cubre:
   * `saldoPrecioEscrituracion` − `coberturaGastos.engancheAlPrecio`. Es el "Saldo
   * por cubrir" que ve el cliente (≈ 0 cuando crédito + enganche alcanzan el
   * precio; un residual de centavos lo absorbe el bono de DILESA al escriturar).
   * Fuente ÚNICA del panel y del mini-resumen — antes el panel lo calculaba inline
   * y el mini-resumen mostraba `saldoPrecioEscrituracion` crudo (sin restar el
   * enganche), divergiendo en Infonavit (crédito < precio: cabecera 158,551 vs
   * panel 1). `null` en legacy/cerradas.
   */
  saldoPrecioPorCubrir: number | null;
  /**
   * true si la operación necesita que Dirección **resuelva explícitamente** el
   * saldo residual de PRECIO antes de cerrar la dictaminación (fase 8): hay
   * desglose y `saldoPrecioPorCubrir` supera la tolerancia de redondeo
   * (`TOLERANCIA_SALDO`). El residual se resuelve cobrándolo (pagaré) o
   * absorbiéndolo (nota de crédito); el monto absorbido ya cae en la NC derivada,
   * así que esto es el GOBIERNO de la decisión, no aritmética nueva (ADR-048,
   * iniciativa `dilesa-saldos-residuales`). `false` en legacy/cerradas (sin
   * desglose) y cuando el residual es ruido de redondeo (≤ tolerancia, p.ej. el
   * peso de Ruben M3-L17).
   */
  requiereResolucionSaldoResidual: boolean;
  /**
   * true si la operación necesita que Dirección **resuelva explícitamente** el
   * saldo residual de GASTOS notariales antes de cerrar la dictaminación (fase 8):
   * hay desglose y `coberturaGastos.pagareNecesario` supera la tolerancia de
   * redondeo (`TOLERANCIA_SALDO`). El faltante de gastos se resuelve cobrándolo
   * (pagaré), absorbiéndolo DILESA (Máxima Aportación) o cubriéndolo el cliente con
   * un depósito (que baja `pagareNecesario` solo). Hasta el Sprint 3 de
   * `dilesa-saldos-residuales` este faltante solo tenía el camino "pagaré" (el gate
   * lo exigía) y, en el panel, el residual sin sobreprecio capturado se pintaba como
   * "sobreprecio" haciendo cuadrar la card en falso. Esta señal es el GOBIERNO de la
   * decisión, no aritmética nueva: `pagareNecesario` ya existe y el monto absorbido
   * ya cae en la NC derivada. `false` en legacy/cerradas (sin desglose) y cuando el
   * faltante es ruido de redondeo (≤ tolerancia).
   */
  requiereResolucionSaldoGastos: boolean;
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

/**
 * Parte el descuento real (= Escrituración − Valor Real, columna "Descuento" de
 * Michelle) en sus dos orígenes, para las cards de la cuadratura:
 *  - `sobreprecio`: lo que DILESA concede subiendo el precio para que el crédito
 *    absorba los gastos (NO le cuesta a DILESA; lo paga el crédito).
 *  - `promocion`: el bono autorizado del catálogo (SÍ le cuesta a DILESA); el
 *    residual tras el sobreprecio.
 *
 * El `sobreprecioCapturado` (`dilesa.ventas.sobreprecio_gastos_escrituracion`) es
 * un HECHO escriturado y actúa como PISO del sobreprecio: si se subió el precio
 * 10,000, esos 10,000 son sobreprecio aunque el bono no se haya agotado. Sin
 * sobreprecio capturado (0/undefined) se cae al residual sobre la promoción
 * topada — comportamiento idéntico al previo (el bono se quema primero). El piso
 * NO puede inventar bono por encima del autorizado: `sobreprecio ≥ total − promo`
 * garantiza `promocion ≤ promocionAutorizada`. Con `total ≥ 0` se mantiene
 * `promocion + sobreprecio = total` (el sobreprecio se topa a `total`).
 */
export function partirDescuento(
  descuentoReal: number,
  promocionAutorizada: number | null | undefined,
  sobreprecioCapturado?: number | null | undefined
): { promocion: number; sobreprecio: number } {
  const total = round2(descuentoReal);
  if (total <= 0) return { promocion: 0, sobreprecio: 0 };
  const residualSobrePromo = Math.max(0, total - n(promocionAutorizada));
  const sobreprecio = round2(
    Math.min(total, Math.max(n(sobreprecioCapturado), residualSobrePromo))
  );
  const promocion = round2(total - sobreprecio);
  return { promocion, sobreprecio };
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
  // `precioBase`), que solo se pueblan al migrar/asignar. NO usa el sobreprecio
  // ni los productos: tras el backfill 20260623 ambos campos quedan 0 en el
  // histórico, y usarlos como marcador sería frágil.
  const tieneDesglose = i.promocionGastos != null || i.precioBase != null;
  const promocionGastos = n(i.promocionGastos);
  // Sobreprecio que fondea gastos (lo absorbe el crédito, NO comisiona) vs
  // productos reales del paquete (closets/upgrades, SÍ comisionan). Separados por
  // la migración 20260623155819; antes se revolvían en `productos_adicionales`.
  const sobreprecioGastos = n(i.sobreprecioGastos);
  const productosAdicionales = n(i.productosAdicionales);
  const gastosNetos = n(i.gastosEscrituracion) - n(i.apoyoInfonavit);

  // ADR-045 + iniciativa `dilesa-descuento-perdonado-motor`: el desglose de las
  // fuentes que cubren el presupuesto notarial COMPLETO se calcula ANTES del
  // `descuentoAplicado`, porque en el modelo desglosado ese descuento debe usar la
  // promoción REALMENTE consumida (`aportacionPromocion`, topada a lo necesario vía
  // `partirDescuento`) y NO el TOPE del bono — si no, el bono no usado se cuela como
  // "descuento perdonado" fantasma en la revisión PLD (`descuentoAplicado − cheque`).
  // Solo con desglose poblado. Gastos BRUTOS = subsidio Infonavit + aportación DILESA
  // (promoción) + enganche + sobreprecio + pagaré → saldo 0. El split del lado DILESA
  // (lo que cubre tras el enganche y el pagaré) es `partirDescuento`: promoción (bono
  // autorizado, topado) + sobreprecio (el resto). Fuente ÚNICA para la card de
  // cuadratura y el mini-resumen (no recalcular).
  const gastosNetosR = round2(gastosNetos);
  const gastosBrutosR = round2(n(i.gastosEscrituracion));
  // El enganche del cliente cubre PRIMERO el saldo del precio (lo que el crédito
  // institución no alcanza); solo el EXCEDENTE fondea el presupuesto notarial.
  // En FOVISSSTE/IMSS el crédito ya cubre el precio (saldo ≤ 0) → todo el enganche
  // va a gastos (comportamiento previo intacto). En Infonavit con crédito < precio
  // el enganche va al precio y NO debe restarse de los gastos: era un DOBLE CONTEO
  // (el mismo enganche cubría el precio en una card y los gastos en otra → saldo
  // de cobertura negativo absurdo, p.ej. −124,782). El crédito directo (pagaré) es
  // fuente de gastos, no de precio, así que no entra en el saldo del precio.
  const saldoPrecioParaGastos = Math.max(0, valorEscrituracion - creditoInstitucion);
  const engancheAGastos = round2(Math.max(0, depositosDirectoCliente - saldoPrecioParaGastos));
  const engancheAlPrecio = round2(depositosDirectoCliente - engancheAGastos);
  // `pagareNecesario`: faltante si DILESA solo aportara la promoción AUTORIZADA
  // (para la fase 10 / gate). NO es el pagaré real: cuando DILESA absorbe más que
  // la promo (Máxima Aportación) el pagaré del cliente es menor (o 0).
  const pagareNecesario = tieneDesglose
    ? round2(Math.max(0, gastosNetosR - promocionGastos - engancheAGastos - sobreprecioGastos))
    : 0;
  // Asignación del pagaré (iniciativa `dilesa-saldos-residuales` S2): el crédito
  // directo cubre PRIMERO el faltante de gastos (`pagareNecesario`); el EXCEDENTE
  // financia el residual de PRECIO (camino "Cobrar" de la dictaminación). Así un
  // pagaré tomado para el precio no sobre-fondea los gastos. En las ventas
  // existentes el pagaré = faltante de gastos ⇒ `pagareAGastos = montoCreditoDirecto`
  // y `pagareAPrecio = 0` → cuadratura idéntica (verificado en los tests).
  const pagareAGastos = round2(Math.min(montoCreditoDirecto, pagareNecesario));
  const pagareAPrecio = round2(Math.max(0, montoCreditoDirecto - pagareAGastos));
  // Lo que DILESA debe cubrir del presupuesto tras el enganche (excedente del
  // precio) y la parte del pagaré que SÍ fondea gastos, partido en promoción
  // (topada al bono) + sobreprecio (el resto).
  const faltanteGastosDilesa = round2(gastosNetosR - engancheAGastos - pagareAGastos);
  // El sobreprecio CAPTURADO es piso del split: si se subió el precio para que el
  // crédito absorbiera gastos, ese monto es sobreprecio (no bono), aunque la
  // promoción no se haya agotado. Sin él, residual sobre la promo topada (igual
  // que antes). No cambia el total (promo + sobreprecio = faltante) ⇒ saldoCobertura
  // intacto; solo reparte distinto bono↔sobreprecio en la card.
  const { promocion: aportacionPromocion, sobreprecio: sobreprecioCobertura } = partirDescuento(
    faltanteGastosDilesa,
    promocionGastos,
    sobreprecioGastos
  );

  // Descuento que reduce el saldo. Con desglose (ADR-045 + `dilesa-descuento-
  // perdonado-motor`): promoción CONSUMIDA (`aportacionPromocion`, ya topada al bono
  // autorizado por `partirDescuento`) + sobreprecio que CUBRE el presupuesto
  // (`sobreprecioCobertura`, el efectivo — ya topado al faltante por `partirDescuento`).
  // Antes se usaban el TOPE del bono (`promocionGastos`) y el sobreprecio CAPTURADO
  // (`sobreprecioGastos`), ambos sin topar: sobre-estimaban el descuento cuando el bono
  // no se consumía completo o el precio se subía MÁS de lo que cubre los gastos, y
  // dejaban un "descuento perdonado" fantasma (`descuentoAplicado − cheque`) en la
  // Fase 13. Casos reales: Aracely M10-L32 (tope bono 15,000 vs consumido 13,380 →
  // 1,620 fantasma, ya corregido el lado promo) y Christopher M3-L16 (sobreprecio
  // capturado 101,000 vs efectivo 15,000 → 70,360 fantasma, corregido aquí el lado
  // sobreprecio). Con el efectivo, `descuentoAplicado` ≈ `descuentoReal` (idénticos
  // salvo centavos de redondeo de la detonación, p.ej. Arizpe 18,313 vs 18,313.29) y
  // el fix nunca infla el descuento: `partirDescuento` garantiza `aportacionPromocion
  // ≤ promocionGastos` y `aportacionPromocion + sobreprecioCobertura =
  // faltanteGastosDilesa` (el total del split, ya topado). OJO: `sobreprecioCobertura`
  // NO está acotado por `sobreprecioGastos` — cuando el sobreprecio capturado es 0 y el
  // faltante supera el bono, el residual se vuelve `sobreprecioCobertura` (el "fantasma"
  // que el Sprint 3 expone como `requiereResolucionSaldoGastos`). Sin desglose (ventas
  // cerradas/legacy) → modelo viejo: `descuento_total` topado al máximo autorizado.
  // Fallback que NO altera nada histórico.
  const descuentoAplicado = tieneDesglose
    ? round2(aportacionPromocion + sobreprecioCobertura)
    : i.descuentoMaximoAutorizado != null
      ? Math.min(descuentoOtorgadoTotal, Math.max(0, n(i.descuentoMaximoAutorizado)))
      : descuentoOtorgadoTotal;
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
  const saldoCobertura = round2(
    gastosBrutosR -
      n(i.apoyoInfonavit) -
      aportacionPromocion -
      engancheAGastos -
      sobreprecioCobertura -
      pagareAGastos
  );
  const coberturaGastos = tieneDesglose
    ? {
        gastosBrutos: gastosBrutosR,
        gastosNetos: gastosNetosR,
        apoyoInfonavit: round2(n(i.apoyoInfonavit)),
        promocion: round2(promocionGastos),
        aportacionPromocion,
        engancheCliente: engancheAGastos,
        engancheAlPrecio,
        sobreprecio: round2(sobreprecioGastos),
        sobreprecioCobertura,
        pagareNecesario,
        /** Parte del pagaré (`montoCreditoDirecto`) que fondea GASTOS (= min(pagaré,
         *  pagareNecesario)). La card de cobertura resta esto, no el pagaré completo. */
        pagareGastos: pagareAGastos,
        /** Parte del pagaré que financia el residual de PRECIO (camino "Cobrar"). 0
         *  en las ventas existentes. Eleva el Valor Real y reduce la NC. */
        pagarePrecio: pagareAPrecio,
        saldoCobertura,
      }
    : null;

  // ADR-045 + geometría 20260618: formación del precio de escrituración (cadena
  // congelada de la Solicitud de Asignación). precio_base + geometría del lote
  // (excedente/frente verde/esquina/venta futuro) + incremento_credito = precio
  // interno DILESA (su venta real); + productos reales (closets/upgrades) +
  // sobreprecio para gastos = valor de escrituración. Solo con desglose poblado.
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
        productos: round2(productosAdicionales),
        sobreprecioGastos: round2(sobreprecioGastos),
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
  // Saldo del precio que el enganche pagado aún no cubre (= "Saldo por cubrir"
  // del panel y la cifra "Precio" del mini-resumen): el crédito cubre el precio
  // primero, el enganche aplica al resto, y lo que quede es el pendiente real del
  // cliente. Fuente ÚNICA — antes el panel lo calculaba inline y el mini-resumen
  // mostraba el saldo crudo (sin restar el enganche), por eso divergían en
  // Infonavit (crédito < precio). `engancheAlPrecio` ya está topado al saldo.
  const saldoPrecioPorCubrir = tieneDesglose
    ? round2((saldoPrecioEscrituracion ?? 0) - engancheAlPrecio)
    : null;
  // Señal de gobierno (iniciativa `dilesa-saldos-residuales`): el residual de
  // precio supera el ruido de redondeo y exige resolución explícita de Dirección
  // (cobrar/absorber) antes de cerrar la fase 8. El piso es `TOLERANCIA_SALDO`
  // para no trabar por centavos (Ruben M3-L17 = $1 ⇒ false; Juan Antonio = $792
  // ⇒ true). Solo aplica al modelo desglosado.
  const requiereResolucionSaldoResidual =
    tieneDesglose && (saldoPrecioPorCubrir ?? 0) > TOLERANCIA_SALDO;
  // Señal de gobierno hermana para el faltante de GASTOS (Sprint 3 de
  // `dilesa-saldos-residuales`): `pagareNecesario` es el saldo de gastos que ni el
  // subsidio, ni el bono autorizado, ni el enganche, ni el sobreprecio capturado
  // cubren. Cuando supera la tolerancia, Dirección debe resolverlo explícito
  // (cobrar/absorber/depósito) en vez de que el motor lo absorba en silencio como
  // "sobreprecio" fantasma. No cambia ninguna aritmética (`pagareNecesario` ya está
  // calculado arriba); solo expone que el caso requiere decisión.
  const requiereResolucionSaldoGastos = tieneDesglose && pagareNecesario > TOLERANCIA_SALDO;

  // Cobertura model-aware de TODA la operación — fuente ÚNICA para el copiloto de
  // cierre y otros gates. NO el `saldoCliente`/`cubierta` legacy, que en ventas
  // desglosadas mezcla precio + descuento y deja un saldo fantasma (Arizpe:
  // 18,313 cheque − 15,000 descuento = 3,313 que NO es deuda). Desglose: el crédito
  // cubre el precio Y las fuentes cubren el presupuesto notarial. Legacy: el saldo
  // efectivo ≤ tolerancia.
  const operacionCubierta = tieneDesglose
    ? (saldoPrecioEscrituracion ?? 0) <= TOLERANCIA_SALDO &&
      Math.abs(saldoCobertura) <= TOLERANCIA_SALDO
    : cubierta;
  // Saldo a mostrar cuando NO está cubierta: el faltante de precio si el crédito
  // no alcanza, si no el residual de gastos. Legacy: el saldo efectivo del cliente.
  const saldoOperacion = tieneDesglose
    ? (saldoPrecioEscrituracion ?? 0) > TOLERANCIA_SALDO
      ? (saldoPrecioEscrituracion ?? 0)
      : saldoCobertura
    : saldoCliente;

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
  // son ingreso de DILESA) + pagaré. Fórmula operativa que validan Michelle (Notas
  // de crédito) y Ale (participación), alineada el 2026-06-18.
  //
  // UNIFICADO en AMBOS modelos el 2026-06-26 (ADR-050). Antes el legacy sumaba
  // `depositosRecibidos` (TODOS los abonos de cxc_pagos): daba un valor real BASURA
  // en las ~76 ventas migradas de Coda cuyo CRÉDITO nunca se registró en cxc_pagos
  // (solo el enganche) → valor real ≈ enganche (M14-L4: 22,429 en vez de 2.26M; la
  // comisión salía 224 en vez de 22,652). Usar el crédito de la VENTA (detonación o,
  // antes de detonar, el crédito institución) + el enganche del cliente (depósitos
  // fuente='cliente') es robusto a ese hueco y NO dobla el crédito cuando SÍ está en
  // cxc_pagos: idéntico resultado que el cálculo viejo para Jorge Luis y el ejemplo
  // de Coda (ahí el crédito = un abono institución = `montoCreditoTitular`).
  // Detonación = disbursement real del crédito (Fase 12); antes de detonar se usa el
  // crédito institución como estimado (mismo criterio que el archivo de Michelle).
  const detonacion = i.montoDetonado != null ? n(i.montoDetonado) : creditoInstitucion;
  const valorRealVentaDilesa = round2(
    detonacion + depositosDirectoCliente - chequeNotariaUsado + montoCreditoDirecto
  );
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
  // Descuento real = Escritura − Valor Real (fórmula de Michelle/Ale, alineada el
  // 2026-06-18). Es TODO lo que DILESA cede frente al valor escriturado: la
  // promoción/bono MÁS el sobreprecio (cuando la promo no cubre los gastos se sube
  // el precio para que el crédito los absorba — ese incremento también es
  // descuento real, aunque vaya acompañado de una venta mayor). Antes el desglose
  // mostraba solo la promoción y subvaluaba el descuento.
  const descuentoReal = round2(valorEscrituracion - valorRealVentaDilesa);
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

  // Base de comisión = Valor Real Venta DILESA − sobreprecio para gastos (lo
  // absorbe el crédito y NO comisiona), en AMBOS modelos — base operativa de
  // Michelle/Ale (col "Venta Dilesa comisiones" = valor real − sobreprecio). Los
  // productos reales del paquete (closets/upgrades) SÍ comisionan, por eso NO se
  // restan. Hasta el 2026-06-26 el modelo legacy comisionaba sobre el valor de
  // ESCRITURACIÓN, lo que sobre-pagaba en ventas con descuento (p.ej. escritura
  // inflada para aforo); se unificó a la base de valor real (iniciativa
  // `dilesa-comision-valor-real`, ADR-050). OJO: esto es solo la BASE — la comisión
  // PAGADA lleva encima un esquema de objetivos y cuotas trimestrales que se modela
  // aparte (pendiente).
  const baseComision = round2(valorRealVentaDilesa - sobreprecioGastos);
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
    operacionCubierta,
    saldoOperacion: round2(saldoOperacion),
    chequeNotariaCalculado,
    chequeNotariaUsado,
    valorRealVentaDilesa,
    valorFacturado,
    valorFacturadoSugerido,
    montoNotaCredito,
    montoNotaCreditoSugerido,
    descuentoReal,
    precioAsignacion: round2(n(i.precioAsignacion)),
    comisionVendedor,
    comisionGerencia,
    tieneDesglose,
    coberturaGastos,
    formacionPrecio,
    saldoPrecioEscrituracion,
    saldoPrecioPorCubrir,
    requiereResolucionSaldoResidual,
    requiereResolucionSaldoGastos,
    desgloseFacturacion,
    posibleDobleConteo,
  };
}
