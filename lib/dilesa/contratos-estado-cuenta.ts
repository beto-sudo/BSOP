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
  /** Σ estimaciones autorizadas+pagadas (neto: incluye amortizaciones negativas). */
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
  /** |Σ estimaciones negativas| (amortizaciones autorizadas+pagadas). */
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
    if (e.estado === 'borrador') {
      pendienteAutorizar += monto;
      continue;
    }
    if (!ESTADOS_DEVENGO.includes(e.estado)) continue; // cancelada
    devengado += monto;
    retenciones += e.retencion ?? 0;
    if (monto > 0 && e.es_anticipo) anticipoEntregado += monto;
    if (monto < 0) anticipoAmortizado += -monto;
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
