/**
 * Estado de cuenta de un contrato de obra (dilesa-contratos-estimaciones).
 *
 * La estimación AUTORIZADA es el devengo (D4); la factura es flexible (D5):
 * por-estimación o total-del-contrato. Esta derivación junta ambas fuentes
 * en la foto financiera del contrato:
 *
 *   contratado | devengado (Σ estimaciones autorizadas, neto de
 *   amortizaciones negativas) | por devengar | pendiente de autorizar |
 *   facturado | pagado | retenciones | anticipo entregado/amortizado.
 *
 * Pura (sin IO) para testearse aislada; la consumen el detalle del
 * contrato y el listado de Contratos (vista Obra).
 */

export type ObraEstimacionEstado = 'borrador' | 'autorizada' | 'pagada' | 'cancelada';

export type EstimacionCuenta = {
  monto_total: number;
  retencion: number;
  es_anticipo: boolean;
  estado: ObraEstimacionEstado;
  /** S3: anticipo amortizado en este avance (congelado al autorizar). */
  amortizacion_aplicada?: number;
};

export type FacturaCuenta = {
  total: number;
  monto_pagado: number;
  estado_cxp: string;
  cancelada_at: string | null;
  /** NULL = factura TOTAL del contrato; con valor = factura por estimación. */
  obra_estimacion_id: string | null;
};

export type EstadoCuentaContrato = {
  contratado: number;
  /** Σ estimaciones autorizadas+pagadas, NETO: monto − amortización (negativas manuales + automática del anticipo, S3). */
  devengado: number;
  porDevengar: number;
  /** % de avance financiero (devengado / contratado). */
  avancePct: number;
  /** Σ estimaciones en borrador — devengo capturado pendiente de Dirección. */
  pendienteAutorizar: number;
  /** Σ facturas activas ligadas al contrato (total + por estimación). */
  facturado: number;
  /** Σ monto_pagado de esas facturas. */
  pagado: number;
  /** Σ retención de estimaciones autorizadas+pagadas. */
  retenciones: number;
  /** Σ estimaciones positivas marcadas anticipo (autorizadas+pagadas). */
  anticipoEntregado: number;
  /** Anticipo recuperado: |Σ negativas manuales| + Σ amortización automática (S3). */
  anticipoAmortizado: number;
  anticipoPorAmortizar: number;
};

/** Estados de estimación que cuentan como devengo (capa ejercido, D4). */
export const ESTADOS_DEVENGO: readonly ObraEstimacionEstado[] = ['autorizada', 'pagada'];

export function esFacturaActiva(f: Pick<FacturaCuenta, 'cancelada_at' | 'estado_cxp'>): boolean {
  return f.cancelada_at == null && f.estado_cxp !== 'cancelada';
}

export function deriveEstadoCuenta(
  contratado: number,
  estimaciones: readonly EstimacionCuenta[],
  facturas: readonly FacturaCuenta[] = []
): EstadoCuentaContrato {
  let devengado = 0;
  let pendienteAutorizar = 0;
  let retenciones = 0;
  let anticipoEntregado = 0;
  let anticipoAmortizado = 0;

  for (const e of estimaciones) {
    const monto = e.monto_total ?? 0;
    const amort = e.amortizacion_aplicada ?? 0;
    if (e.estado === 'borrador') {
      pendienteAutorizar += monto;
      continue;
    }
    if (!ESTADOS_DEVENGO.includes(e.estado)) continue; // cancelada
    // Devengado NETO (S3): el bruto del avance menos la amortización automática
    // del anticipo congelada en la fila (espejo del tope server-side).
    devengado += monto - amort;
    retenciones += e.retencion ?? 0;
    if (monto > 0 && e.es_anticipo) anticipoEntregado += monto;
    // Anticipo recuperado: amortización manual (estimación negativa, histórico)
    // + amortización automática del anticipo (S3).
    if (monto < 0) anticipoAmortizado += -monto;
    anticipoAmortizado += amort;
  }

  let facturado = 0;
  let pagado = 0;
  for (const f of facturas) {
    if (!esFacturaActiva(f)) continue;
    facturado += f.total ?? 0;
    pagado += f.monto_pagado ?? 0;
  }

  return {
    contratado,
    devengado,
    porDevengar: contratado - devengado,
    avancePct: contratado > 0 ? (devengado / contratado) * 100 : 0,
    pendienteAutorizar,
    facturado,
    pagado,
    retenciones,
    anticipoEntregado,
    anticipoAmortizado,
    anticipoPorAmortizar: Math.max(0, anticipoEntregado - anticipoAmortizado),
  };
}

/** La factura TOTAL activa del contrato, si existe (a lo más 1 por contrato). */
export function findFacturaTotal<T extends FacturaCuenta>(facturas: readonly T[]): T | null {
  return facturas.find((f) => f.obra_estimacion_id == null && esFacturaActiva(f)) ?? null;
}

export const TIPO_CONTRATO_LABEL: Record<string, string> = {
  vivienda: 'Vivienda',
  urbanizacion: 'Urbanización',
  obra_cabecera: 'Obra de cabecera',
  tarea_menor: 'Tarea menor',
};

/** Tolerancia (1 peso) para el tope vs contrato — absorbe el redondeo de centavos. */
export const TOPE_EPSILON = 1;

/**
 * Tope duro vs el valor del contrato (S2): ¿autorizar esta estimación llevaría
 * el devengado por encima del valor contratado? Espejo del guard server-side en
 * `dilesa.obra_estimacion_autorizar` — el front lo usa para pedir el override de
 * Dirección (motivo) antes de llamar la RPC, que de todos modos re-valida.
 *
 * `devengadoActual` = devengado neto del contrato SIN esta estimación (la que se
 * autoriza está en borrador → no cuenta aún). Solo las estimaciones positivas
 * pueden exceder; valor_total <= 0 se exime (contrato sin valor capturado).
 */
export function excedeTopeContrato(
  devengadoActual: number,
  montoEstimacion: number,
  valorTotal: number
): boolean {
  if (montoEstimacion <= 0) return false;
  if (valorTotal <= 0) return false;
  return devengadoActual + montoEstimacion > valorTotal + TOPE_EPSILON;
}
