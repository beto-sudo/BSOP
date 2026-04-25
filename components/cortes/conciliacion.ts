import type { Corte, CorteTotales, Voucher } from './types';

// Tolerancia en pesos para el estado "cuadra_aprox" (centavos por redondeo, propinas
// chicas, etc.). Configurable como constante exportada.
export const TOLERANCIA_MXN = 5;

export type ConciliacionEstado =
  | 'sin_actividad' // ingresos = 0 y sin evidencia
  | 'cuadra' // diferencia exactamente 0
  | 'cuadra_aprox' // |diferencia| <= TOLERANCIA_MXN
  | 'diferencia' // |diferencia| > TOLERANCIA_MXN
  | 'sin_voucher' // ingresos > 0 pero sin vouchers de tarjeta
  | 'pendiente_captura' // hay vouchers sin monto_reportado todavía
  | 'pendiente_cierre'; // efectivo: corte abierto o contado nulo

export type ConciliacionTarjeta = {
  metodo: 'tarjeta';
  ingresos_pedidos: number;
  total_evidencia: number; // suma de monto_reportado de vouchers de tarjeta confirmados
  evidencia_count: number; // # vouchers con categoria='voucher_tarjeta'
  evidencia_pendiente: number; // # vouchers tarjeta sin monto_reportado
  diferencia: number; // total_evidencia - ingresos_pedidos
  estado: ConciliacionEstado;
};

export type ConciliacionEfectivo = {
  metodo: 'efectivo';
  esperado: number;
  contado: number | null; // null si corte abierto o efectivo_contado nulo
  diferencia: number | null; // null si contado es null
  estado: ConciliacionEstado;
};

/**
 * Concilia ingresos por tarjeta vs sumatoria de vouchers de tarjeta.
 *
 * Reglas:
 * - Solo cuentan vouchers con categoria === 'voucher_tarjeta'.
 * - Un voucher con monto_reportado === null se considera pendiente (no entra en la suma).
 * - Un voucher con monto_reportado === 0 SÍ está capturado (cero válido).
 * - Si hay vouchers pendientes, el estado es 'pendiente_captura' aunque la suma
 *   parcial cuadre — no podemos confirmar el cuadre hasta que estén todos.
 * - Tolerancia ±TOLERANCIA_MXN aplica con `<=` (cinco pesos exactos cuadran aprox,
 *   no se marca como diferencia crítica).
 */
export function conciliarTarjeta(
  totales: CorteTotales | null,
  vouchers: Voucher[]
): ConciliacionTarjeta {
  const ingresos = totales?.ingresos_tarjeta ?? 0;
  const vouchersTarjeta = vouchers.filter((v) => v.categoria === 'voucher_tarjeta');
  const conMonto = vouchersTarjeta.filter((v) => v.monto_reportado != null);
  const sumVouchers = conMonto.reduce((acc, v) => acc + (v.monto_reportado ?? 0), 0);
  const pendientes = vouchersTarjeta.length - conMonto.length;
  const diferencia = sumVouchers - ingresos;
  const absDif = Math.abs(diferencia);

  let estado: ConciliacionEstado;
  if (ingresos === 0 && vouchersTarjeta.length === 0) {
    estado = 'sin_actividad';
  } else if (ingresos > 0 && vouchersTarjeta.length === 0) {
    estado = 'sin_voucher';
  } else if (pendientes > 0) {
    estado = 'pendiente_captura';
  } else if (absDif === 0) {
    estado = 'cuadra';
  } else if (absDif <= TOLERANCIA_MXN) {
    estado = 'cuadra_aprox';
  } else {
    estado = 'diferencia';
  }

  return {
    metodo: 'tarjeta',
    ingresos_pedidos: ingresos,
    total_evidencia: sumVouchers,
    evidencia_count: vouchersTarjeta.length,
    evidencia_pendiente: pendientes,
    diferencia,
    estado,
  };
}

/**
 * Concilia efectivo esperado vs efectivo contado al cierre.
 *
 * Reglas:
 * - Si corte abierto o `efectivo_contado` es null → 'pendiente_cierre' con diferencia null.
 * - Tolerancia ±TOLERANCIA_MXN aplica con `<=`.
 */
export function conciliarEfectivo(
  corte: Corte,
  totales: CorteTotales | null
): ConciliacionEfectivo {
  const esperado = totales?.efectivo_esperado ?? 0;
  const contado = corte.efectivo_contado;
  const abierto = corte.estado?.toLowerCase() === 'abierto';

  if (abierto || contado == null) {
    return {
      metodo: 'efectivo',
      esperado,
      contado: null,
      diferencia: null,
      estado: 'pendiente_cierre',
    };
  }

  const diferencia = contado - esperado;
  const absDif = Math.abs(diferencia);

  let estado: ConciliacionEstado;
  if (absDif === 0) {
    estado = 'cuadra';
  } else if (absDif <= TOLERANCIA_MXN) {
    estado = 'cuadra_aprox';
  } else {
    estado = 'diferencia';
  }

  return {
    metodo: 'efectivo',
    esperado,
    contado,
    diferencia,
    estado,
  };
}
