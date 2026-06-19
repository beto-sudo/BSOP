/**
 * Motor del reporte «Productividad por vendedor» (DILESA · Ventas) — ADR-047.
 *
 * Scorecard por vendedor: cartera total, pipeline en proceso, escrituradas y
 * monto escriturado + % de cierre. Base para reconocer al equipo y para
 * comisiones. Pura y testeable; la comparten la vista y el PDF.
 *
 * Convenciones: las ventas `desasignada` no cuentan; "pipeline" = ventas en
 * proceso (sin número de escritura); "escriturado" = ventas ya cerradas.
 */
import type { VentaReporteRow } from './ventas-data';

export type FiltrosProductividad = {
  proyecto: string;
};

export const FILTROS_PRODUCTIVIDAD_VACIOS: FiltrosProductividad = { proyecto: '' };

export type VendedorProductividad = {
  vendedor: string;
  /** Cartera total del vendedor (no desasignadas). */
  ventas: number;
  /** Monto en proceso (ventas sin escriturar). */
  pipeline: number;
  escrituradas: number;
  montoEscriturado: number;
  /** Tasa de cierre = escrituradas / ventas (0–1). */
  pctEscrituradas: number;
};

export type ProductividadResult = {
  /** Una fila por vendedor, ordenada por monto escriturado desc. */
  filas: VendedorProductividad[];
  totalVendedores: number;
  totalVentas: number;
  totalPipeline: number;
  totalEscrituradas: number;
  totalMontoEscriturado: number;
};

export function construirProductividadVendedor(
  rows: readonly VentaReporteRow[],
  filtros: FiltrosProductividad
): ProductividadResult {
  const filtradas = rows.filter((r) => {
    if (r.estado === 'desasignada') return false;
    if (!r.vendedor) return false; // sin vendedor no entra al ranking
    if (filtros.proyecto && r.proyectoId !== filtros.proyecto) return false;
    return true;
  });

  const map = new Map<
    string,
    { ventas: number; pipeline: number; escrituradas: number; montoEscriturado: number }
  >();
  for (const r of filtradas) {
    const k = r.vendedor!;
    const cur = map.get(k) ?? { ventas: 0, pipeline: 0, escrituradas: 0, montoEscriturado: 0 };
    cur.ventas += 1;
    if (r.numeroEscritura) {
      cur.escrituradas += 1;
      cur.montoEscriturado += r.precio ?? 0;
    } else {
      cur.pipeline += r.precio ?? 0;
    }
    map.set(k, cur);
  }

  const filas: VendedorProductividad[] = [...map.entries()]
    .map(([vendedor, v]) => ({
      vendedor,
      ventas: v.ventas,
      pipeline: v.pipeline,
      escrituradas: v.escrituradas,
      montoEscriturado: v.montoEscriturado,
      pctEscrituradas: v.ventas === 0 ? 0 : v.escrituradas / v.ventas,
    }))
    .sort(
      (a, b) =>
        b.montoEscriturado - a.montoEscriturado ||
        b.pipeline - a.pipeline ||
        a.vendedor.localeCompare(b.vendedor, 'es')
    );

  return {
    filas,
    totalVendedores: filas.length,
    totalVentas: filas.reduce((acc, f) => acc + f.ventas, 0),
    totalPipeline: filas.reduce((acc, f) => acc + f.pipeline, 0),
    totalEscrituradas: filas.reduce((acc, f) => acc + f.escrituradas, 0),
    totalMontoEscriturado: filas.reduce((acc, f) => acc + f.montoEscriturado, 0),
  };
}
