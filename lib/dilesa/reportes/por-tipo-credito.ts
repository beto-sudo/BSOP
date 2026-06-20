/**
 * Motor del reporte «Por tipo de crédito» (DILESA · Ventas) — ADR-047.
 *
 * Distribución de la cartera (ventas no desasignadas) por tipo de crédito
 * (INFONAVIT / FOVISSSTE / bancario / contado / …): conteo, monto y share.
 * Pura y testeable; la comparten la vista y el PDF.
 */
import type { VentaReporteRow } from './ventas-data';

export type FiltrosPorTipoCredito = { proyecto: string };

export const FILTROS_POR_TIPO_CREDITO_VACIOS: FiltrosPorTipoCredito = { proyecto: '' };

export type TipoCreditoRow = {
  tipo: string;
  ventas: number;
  monto: number;
  /** Share del conteo total (0–1). */
  pctVentas: number;
  /** Share del monto total (0–1). */
  pctMonto: number;
};

export type PorTipoCreditoResult = {
  /** Una fila por tipo de crédito, ordenada por conteo desc. */
  filas: TipoCreditoRow[];
  totalVentas: number;
  totalMonto: number;
};

/** Etiqueta para ventas sin tipo de crédito capturado. */
export const SIN_TIPO_CREDITO = 'Sin especificar';

export function construirPorTipoCredito(
  rows: readonly VentaReporteRow[],
  filtros: FiltrosPorTipoCredito
): PorTipoCreditoResult {
  const filtradas = rows.filter((r) => {
    if (r.estado === 'desasignada') return false;
    if (filtros.proyecto && r.proyectoId !== filtros.proyecto) return false;
    return true;
  });

  const map = new Map<string, { ventas: number; monto: number }>();
  for (const r of filtradas) {
    const k = r.tipoCredito?.trim() || SIN_TIPO_CREDITO;
    const cur = map.get(k) ?? { ventas: 0, monto: 0 };
    cur.ventas += 1;
    cur.monto += r.precio ?? 0;
    map.set(k, cur);
  }

  const totalVentas = filtradas.length;
  const totalMonto = [...map.values()].reduce((acc, v) => acc + v.monto, 0);

  const filas: TipoCreditoRow[] = [...map.entries()]
    .map(([tipo, v]) => ({
      tipo,
      ventas: v.ventas,
      monto: v.monto,
      pctVentas: totalVentas === 0 ? 0 : v.ventas / totalVentas,
      pctMonto: totalMonto === 0 ? 0 : v.monto / totalMonto,
    }))
    .sort((a, b) => b.ventas - a.ventas || a.tipo.localeCompare(b.tipo, 'es'));

  return { filas, totalVentas, totalMonto };
}
