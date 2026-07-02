/**
 * Tipos y derivadas del control de prediales (iniciativa
 * `dilesa-portafolio-predios`).
 *
 * Regla de oro: los montos capturados del recibo municipal NUNCA se
 * reescriben — el adeudo neto (con convenio de descuento) siempre se deriva
 * al vuelo. Vive en `.ts` plano porque lo consumen client components y (a
 * futuro) server actions/reportes.
 */

import type { BadgeTone } from '@/components/ui/badge';

export type PredialCuenta = {
  id: string;
  clave_catastral: string;
  folio: string | null;
  superficie_fiscal_m2: number | null;
  estatus: string;
  notas: string | null;
};

export type PredialConvenio = {
  id: string;
  nombre: string;
  descuento_pct: number;
  estado: string;
};

export type PredialEjercicio = {
  id: string;
  cuenta_id: string;
  ejercicio: number;
  predial: number | null;
  recargos: number | null;
  aseo: number | null;
  recargos_aseo: number | null;
  bomberos: number | null;
  recargos_bomberos: number | null;
  estado: string;
  fecha_pago: string | null;
  monto_pagado: number | null;
  notas: string | null;
  convenio: PredialConvenio | null;
};

export const ESTADO_EJERCICIO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  convenio: 'Convenio',
  condonado: 'Condonado',
};

export const ESTADO_EJERCICIO_TONE: Record<string, BadgeTone> = {
  pendiente: 'danger',
  pagado: 'success',
  convenio: 'info',
  condonado: 'neutral',
};

/** Suma de los cargos del recibo (sin descuento). */
export function totalBrutoEjercicio(e: PredialEjercicio): number {
  return (
    (e.predial ?? 0) +
    (e.recargos ?? 0) +
    (e.aseo ?? 0) +
    (e.recargos_aseo ?? 0) +
    (e.bomberos ?? 0) +
    (e.recargos_bomberos ?? 0)
  );
}

/**
 * Adeudo vivo del ejercicio: 0 si ya se pagó/condonó; si hay convenio
 * VIGENTE que cubre el ejercicio, aplica su % de descuento sobre el bruto.
 * (El convenio referenciado desde el ejercicio ya fue validado de rango al
 * ligarse; aquí solo se respeta su estado.)
 */
export function adeudoNetoEjercicio(e: PredialEjercicio): number {
  if (e.estado === 'pagado' || e.estado === 'condonado') return 0;
  const bruto = totalBrutoEjercicio(e);
  if (e.convenio && e.convenio.estado === 'vigente') {
    return bruto * (1 - e.convenio.descuento_pct / 100);
  }
  return bruto;
}

/** Agregado por lista de ejercicios (para KPIs de tab/expediente). */
export function resumenPrediales(ejercicios: PredialEjercicio[]): {
  adeudoNeto: number;
  brutoPendiente: number;
  pagados: number;
  pendientes: number;
} {
  let adeudoNeto = 0;
  let brutoPendiente = 0;
  let pagados = 0;
  let pendientes = 0;
  for (const e of ejercicios) {
    const neto = adeudoNetoEjercicio(e);
    adeudoNeto += neto;
    if (e.estado === 'pagado' || e.estado === 'condonado') {
      pagados += 1;
    } else {
      pendientes += 1;
      brutoPendiente += totalBrutoEjercicio(e);
    }
  }
  return { adeudoNeto, brutoPendiente, pagados, pendientes };
}
