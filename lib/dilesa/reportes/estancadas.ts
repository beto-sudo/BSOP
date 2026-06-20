/**
 * Motor del reporte «Ventas estancadas» (DILESA · Ventas) — ADR-047.
 *
 * El pipeline vivo ordenado por antigüedad en la fase actual: las que llevan más
 * tiempo sin avanzar quedan arriba. Sirve de alerta temprana (cuando algo se
 * atora, salta). Pura y testeable; la comparten la vista y el PDF.
 *
 * Decisión (2026-06-20): se muestran TODAS las activas con su antigüedad, no solo
 * las > X días — el pipeline es chico y se mueve rápido, así que un filtro estricto
 * dejaría el reporte vacío. El umbral marca cuántas se consideran "estancadas".
 */
import type { EstancadaRow } from './estancadas-data';

/** Umbral por defecto (días) a partir del cual una venta se considera estancada. */
export const UMBRAL_ESTANCADA_DEFAULT = 30;

export type FiltrosEstancadas = {
  proyecto: string;
  /** Solo mostrar las que llevan >= este número de días (vacío/0 = todas). */
  minDias: string;
};

export const FILTROS_ESTANCADAS_VACIOS: FiltrosEstancadas = { proyecto: '', minDias: '' };

export type EstancadasResult = {
  /** Ventas en pipeline, ordenadas por días en fase descendente. */
  filas: EstancadaRow[];
  totalPipeline: number;
  /** Cuántas superan el umbral de estancamiento. */
  estancadas: number;
  maxDias: number;
  promedioDias: number;
};

export function construirEstancadas(
  rows: readonly EstancadaRow[],
  filtros: FiltrosEstancadas,
  umbral: number = UMBRAL_ESTANCADA_DEFAULT
): EstancadasResult {
  const min = filtros.minDias ? Number(filtros.minDias) : 0;
  const filtradas = rows.filter((r) => {
    if (filtros.proyecto && r.proyectoNombre !== filtros.proyecto) return false;
    if (min > 0 && r.diasEnFase < min) return false;
    return true;
  });

  const filas = [...filtradas].sort((a, b) => b.diasEnFase - a.diasEnFase);
  const totalPipeline = filas.length;
  const sumaDias = filas.reduce((acc, f) => acc + f.diasEnFase, 0);

  return {
    filas,
    totalPipeline,
    estancadas: filas.filter((f) => f.diasEnFase >= umbral).length,
    maxDias: filas.reduce((max, f) => Math.max(max, f.diasEnFase), 0),
    promedioDias: totalPipeline === 0 ? 0 : Math.round(sumaDias / totalPipeline),
  };
}
