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
 *   Saldo Cliente             = Valor de Escrituración − Monto Disponible.
 *                               (≤ 0 ⇒ operación cubierta — saldo cero vs
 *                                Valor de Escrituración, confirmado por Beto.)
 *   Cheque Notaría (cálculo)  = min(Gastos Escrituración − Apoyo Infonavit,
 *                                Monto Disponible − Valor Escrituración
 *                                + Descuento Otorgado Total).
 *   Valor Real Venta Dilesa   = Depósitos Recibidos − Cheque Notaría + Pagaré.
 *   Valor Facturado           = Valor Escrituración + Σ depósitos(con recibo).
 *   Monto Nota de Crédito     = Valor Facturado − Valor Real Venta Dilesa.
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
  /** Tiene PDF Recibo de Caja (cuenta para Valor Facturado). */
  tieneRecibo?: boolean;
};

export type CuadraturaInput = {
  valorEscrituracion: number | null;
  montoCreditoTitular: number | null;
  montoCreditoCotitular: number | null;
  /** Pagaré autorizado del crédito directo (Fase 10). */
  montoCreditoDirecto: number | null;
  /** Cheque enviado a la notaría (capturado en Fase 11). */
  montoChequeNotaria: number | null;
  gastosEscrituracion: number | null;
  /** GAP: apoyo del Infonavit a gastos de escrituración (por tipo de crédito). */
  apoyoInfonavit?: number | null;
  /** GAP: suma de los 4 buckets de descuento otorgado. */
  descuentoOtorgadoTotal?: number | null;
  /** Para referencia (no entra al saldo). */
  precioAsignacion?: number | null;
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
  saldoCliente: number;
  /** true si el Monto Disponible cubre el Valor de Escrituración. */
  cubierta: boolean;
  /** Cheque a notaría sugerido por la fórmula (vs el capturado). */
  chequeNotariaCalculado: number;
  /** Cheque usado para los derivados: el capturado si existe, si no el calculado. */
  chequeNotariaUsado: number;
  valorRealVentaDilesa: number;
  valorFacturado: number;
  montoNotaCredito: number;
  descuentoReal: number;
  comisionVendedor: number;
  comisionGerencia: number;
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

/** ¿El proyecto cae en la tasa alta de comisión (Loma Verde / Loma Verde 2)? */
function esLomaVerde(proyecto: string | null | undefined): boolean {
  return /loma\s*verde/i.test(proyecto ?? '');
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
    .filter((d) => d.tieneRecibo)
    .reduce((s, d) => s + n(d.monto), 0);

  const montoDisponible = depositosDirectoCliente + creditoInstitucion + montoCreditoDirecto;
  const saldoCliente = round2(valorEscrituracion - montoDisponible);
  const cubierta = saldoCliente <= 0.0049;

  const descuentoOtorgadoTotal = n(i.descuentoOtorgadoTotal);
  const gastosNetos = n(i.gastosEscrituracion) - n(i.apoyoInfonavit);
  const excedenteDisponible = montoDisponible - valorEscrituracion + descuentoOtorgadoTotal;
  const chequeNotariaCalculado = round2(Math.min(gastosNetos, excedenteDisponible));

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

  const valorRealVentaDilesa = round2(
    depositosRecibidos - chequeNotariaUsado + montoCreditoDirecto
  );
  const valorFacturado = round2(valorEscrituracion + depositosConRecibo);
  const montoNotaCredito = round2(valorFacturado - valorRealVentaDilesa);
  const descuentoReal = round2(valorEscrituracion - valorRealVentaDilesa);

  const comisionVendedor = round2(
    valorEscrituracion * (esLomaVerde(i.proyectoNombre) ? 0.015 : 0.01)
  );
  const comisionGerencia = round2(valorEscrituracion * 0.005);

  return {
    depositosRecibidos: round2(depositosRecibidos),
    depositosDirectoCliente: round2(depositosDirectoCliente),
    creditoInstitucion: round2(creditoInstitucion),
    montoCreditoDirecto: round2(montoCreditoDirecto),
    montoDisponible: round2(montoDisponible),
    saldoCliente,
    cubierta,
    chequeNotariaCalculado,
    chequeNotariaUsado,
    valorRealVentaDilesa,
    valorFacturado,
    montoNotaCredito,
    descuentoReal,
    comisionVendedor,
    comisionGerencia,
    posibleDobleConteo,
  };
}
