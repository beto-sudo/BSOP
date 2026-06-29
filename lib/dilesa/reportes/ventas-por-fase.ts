/**
 * Motor del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047.
 *
 * Cuenta las ventas que REGISTRARON una fase del pipeline en un periodo,
 * tomando la fecha en que se registró la terminación de la fase
 * (`venta_fases.fecha`). El filtro `posicion` elige la fase (1–17); `0` = todas
 * las fases (modo actividad de pipeline). Desglose por mes y total de valor.
 * Puro y testeable; lo comparten la vista, el PDF y el CSV.
 */
import type { VentaFaseReporteRow } from './ventas-por-fase-data';

/** Fase por default del reporte: Detonada (12) — el caso que lo originó. */
export const POSICION_DEFAULT = 12;
/** Valor centinela del filtro de fase para «todas las fases». */
export const POSICION_TODAS = 0;

export type FiltrosVentasPorFase = {
  /** Fase a contar (1–17). `0` = todas las fases. */
  posicion: number;
  /** Inicio del rango `YYYY-MM-DD` (vacío = sin límite inferior). */
  desde: string;
  /** Fin del rango `YYYY-MM-DD` (vacío = sin límite superior). */
  hasta: string;
  proyecto: string;
};

export const FILTROS_VENTAS_POR_FASE_VACIOS: FiltrosVentasPorFase = {
  posicion: POSICION_DEFAULT,
  desde: '',
  hasta: '',
  proyecto: '',
};

export type VentaFaseMesRow = {
  mes: string;
  /** Conteo de ventas que registraron la fase en el mes. */
  ventas: number;
  valor: number;
};

export type VentasPorFaseResult = {
  /** Registros de fase en el rango, ordenados por fecha desc. */
  filas: VentaFaseReporteRow[];
  /** Desglose por mes, ascendente. */
  porMes: VentaFaseMesRow[];
  totalVentas: number;
  totalValor: number;
  /** `true` cuando se piden todas las fases (la tabla muestra la columna Fase). */
  multiFase: boolean;
};

function enRango(fecha: string, desde: string, hasta: string): boolean {
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/** Construye el reporte de ventas por fase a partir de las filas normalizadas. */
export function construirVentasPorFase(
  rows: readonly VentaFaseReporteRow[],
  filtros: FiltrosVentasPorFase
): VentasPorFaseResult {
  const todas = filtros.posicion === POSICION_TODAS;
  const filas = rows
    .filter((r) => (todas ? true : r.posicion === filtros.posicion))
    .filter((r) => enRango(r.fecha, filtros.desde, filtros.hasta))
    .filter((r) => !filtros.proyecto || r.proyectoId === filtros.proyecto)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.cliente.localeCompare(b.cliente, 'es'));

  const mesMap = new Map<string, VentaFaseMesRow>();
  for (const f of filas) {
    const cur = mesMap.get(f.mes) ?? ({ mes: f.mes, ventas: 0, valor: 0 } as VentaFaseMesRow);
    cur.ventas += 1;
    cur.valor += f.valor;
    mesMap.set(f.mes, cur);
  }
  const porMes = [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    filas,
    porMes,
    totalVentas: filas.length,
    totalValor: filas.reduce((acc, f) => acc + f.valor, 0),
    multiFase: todas,
  };
}
