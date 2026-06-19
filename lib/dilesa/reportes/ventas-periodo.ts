/**
 * Motor del reporte «Ventas del periodo» (DILESA · Ventas) — ADR-047.
 *
 * Lista las ventas ESCRITURADAS (cierre real) cuya fecha de escritura cae en el
 * rango, con desglose por mes y totales. Es el cierre comercial del periodo.
 * Pura y testeable; la comparten la vista y el PDF.
 */
import type { VentaReporteRow } from './ventas-data';

export type FiltrosVentasPeriodo = {
  /** Inicio del rango `YYYY-MM-DD` (vacío = sin límite inferior). */
  desde: string;
  /** Fin del rango `YYYY-MM-DD` (vacío = sin límite superior). */
  hasta: string;
  proyecto: string;
  vendedor: string;
};

export const FILTROS_VENTAS_PERIODO_VACIOS: FiltrosVentasPeriodo = {
  desde: '',
  hasta: '',
  proyecto: '',
  vendedor: '',
};

export type VentaPeriodoRow = {
  id: string;
  cliente: string;
  proyectoNombre: string;
  unidadIdentificador: string | null;
  vendedor: string | null;
  fechaEscritura: string;
  monto: number;
};

export type VentasPeriodoResult = {
  /** Ventas escrituradas en el rango, ordenadas por fecha de escritura desc. */
  ventas: VentaPeriodoRow[];
  /** Desglose por mes de escritura, ascendente. */
  porMes: Array<{ mes: string; ventas: number; monto: number }>;
  totalVentas: number;
  totalMonto: number;
  ticketPromedio: number;
};

/** Construye el reporte. Solo cuenta ventas con número y fecha de escritura. */
export function construirVentasPeriodo(
  rows: readonly VentaReporteRow[],
  filtros: FiltrosVentasPeriodo
): VentasPeriodoResult {
  const filtradas = rows.filter((r) => {
    if (!r.numeroEscritura || !r.fechaEscritura) return false; // solo escrituradas
    if (filtros.desde && r.fechaEscritura < filtros.desde) return false;
    if (filtros.hasta && r.fechaEscritura > filtros.hasta) return false;
    if (filtros.proyecto && r.proyectoId !== filtros.proyecto) return false;
    if (filtros.vendedor && r.vendedor !== filtros.vendedor) return false;
    return true;
  });

  const ventas: VentaPeriodoRow[] = filtradas
    .map((r) => ({
      id: r.id,
      cliente: r.cliente,
      proyectoNombre: r.proyectoNombre,
      unidadIdentificador: r.unidadIdentificador,
      vendedor: r.vendedor,
      fechaEscritura: r.fechaEscritura!,
      monto: r.precio ?? 0,
    }))
    .sort((a, b) => b.fechaEscritura.localeCompare(a.fechaEscritura));

  const mesMap = new Map<string, { ventas: number; monto: number }>();
  for (const v of ventas) {
    const mes = v.fechaEscritura.slice(0, 7);
    const cur = mesMap.get(mes) ?? { ventas: 0, monto: 0 };
    cur.ventas += 1;
    cur.monto += v.monto;
    mesMap.set(mes, cur);
  }
  const porMes = [...mesMap.entries()]
    .map(([mes, v]) => ({ mes, ventas: v.ventas, monto: v.monto }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const totalVentas = ventas.length;
  const totalMonto = ventas.reduce((acc, v) => acc + v.monto, 0);
  const ticketPromedio = totalVentas === 0 ? 0 : totalMonto / totalVentas;

  return { ventas, porMes, totalVentas, totalMonto, ticketPromedio };
}
