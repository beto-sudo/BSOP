/**
 * Motor del reporte «Calificación por fase» (DILESA · Ventas) — ADR-047,
 * iniciativa dilesa-fluidez-pipeline (S2a, el radar de cuellos).
 *
 * Mide qué tan lenta es cada fase del pipeline para detectar dónde se atora el
 * proceso. Puro y testeable; lo comparten la pantalla y el PDF.
 *
 * Dos lecturas a la vez:
 *  - ABSOLUTA: mediana/p90/n de días por fase en el periodo. El `cuello` = la
 *    fase con el p90 más alto (la cola más lenta). Esto vale aun en "Todo el
 *    histórico", donde la banda relativa es neutra.
 *  - RELATIVA (banda): mediana del periodo vs. el benchmark histórico de esa
 *    fase (la "vara"). Verde ≈ igual o mejor, ámbar más lento, rojo mucho más
 *    lento → "¿qué fases andamos peor que de costumbre?". En S3 la vara la
 *    sustituye una meta editable; aquí el default es la mediana histórica.
 *
 * Decisión (R4): nada de un score 0-100 sofisticado en v1 — bandas y números
 * crudos que Dirección pueda explicar en 30 segundos. n bajo ⇒ gris, nunca un
 * verde/rojo falso.
 */
import { responsableFase, type FaseResponsable } from '@/lib/dilesa/fases';

/** Fila por fase que devuelve el RPC `fn_fase_calificacion` (periodo). */
export type FaseCalificacionRaw = {
  posicion: number;
  fase: string;
  n: number;
  mediana: number | null;
  p90: number | null;
};

/** Fila por fase de la vista `v_fase_benchmark` (vara histórica). */
export type FaseBenchmark = {
  posicion: number;
  fase: string;
  mediana: number | null;
  p90: number | null;
  n: number;
};

export type BandaFase = 'verde' | 'ambar' | 'rojo' | 'gris';

/** Mínimo de tramos para calificar una fase; por debajo = gris ("n insuficiente"). */
export const N_MIN_FASE = 5;
/** A partir de este múltiplo de la vara, la fase va en rojo (mucho más lenta). */
export const RATIO_ROJO = 1.5;
/** A partir de este múltiplo, ámbar (algo más lenta que de costumbre). */
export const RATIO_AMBAR = 1.1;

export type FaseCalificacionRow = {
  posicion: number;
  fase: string;
  responsable: FaseResponsable;
  n: number;
  mediana: number | null;
  p90: number | null;
  /** Vara: mediana histórica de la fase (default de "meta" hasta S3). */
  baseline: number | null;
  /** mediana del periodo / baseline. `null` si falta dato. */
  ratio: number | null;
  banda: BandaFase;
  /** mediana del periodo − mediana del periodo anterior (días). + = se alentó. */
  deltaPrevio: number | null;
};

export type CalificacionResult = {
  filas: FaseCalificacionRow[];
  /** Fase más lenta por p90 (con n suficiente). El cuello accionable. */
  cuello: { fase: string; p90: number } | null;
  /** Cuántas fases van más lentas que su histórico (rojo). */
  fasesLentas: number;
  /** Total de tramos cerrados medidos en el periodo. */
  tramosMedidos: number;
};

function bandaDe(n: number, mediana: number | null, baseline: number | null): BandaFase {
  if (n < N_MIN_FASE || mediana == null) return 'gris';
  if (baseline == null || baseline === 0) return 'verde';
  const r = mediana / baseline;
  if (r > RATIO_ROJO) return 'rojo';
  if (r > RATIO_AMBAR) return 'ambar';
  return 'verde';
}

/**
 * Arma el radar por fase. `periodo` y `previo` son resultados del RPC (periodo
 * seleccionado y el inmediatamente anterior, para la tendencia); `baseline` es
 * el benchmark histórico. Cubre solo las fases presentes en el benchmark
 * (1–14: el pipeline de venta; 15–17 se excluyen por contaminación de migración).
 */
export function construirCalificacion(
  periodo: readonly FaseCalificacionRaw[],
  baseline: readonly FaseBenchmark[],
  previo: readonly FaseCalificacionRaw[] = []
): CalificacionResult {
  const periodoByPos = new Map(periodo.map((r) => [r.posicion, r]));
  const previoByPos = new Map(previo.map((r) => [r.posicion, r]));

  const filas: FaseCalificacionRow[] = [...baseline]
    .sort((a, b) => a.posicion - b.posicion)
    .map((b) => {
      const p = periodoByPos.get(b.posicion);
      const prev = previoByPos.get(b.posicion);
      const n = p?.n ?? 0;
      const mediana = p?.mediana ?? null;
      const baselineMed = b.mediana;
      const ratio = mediana != null && baselineMed ? mediana / baselineMed : null;
      const deltaPrevio = mediana != null && prev?.mediana != null ? mediana - prev.mediana : null;
      return {
        posicion: b.posicion,
        fase: b.fase ?? '',
        responsable: responsableFase(b.posicion),
        n,
        mediana,
        p90: p?.p90 ?? null,
        baseline: baselineMed,
        ratio,
        banda: bandaDe(n, mediana, baselineMed),
        deltaPrevio,
      };
    });

  // Cuello = mayor p90 entre fases con n suficiente.
  let cuello: { fase: string; p90: number } | null = null;
  for (const f of filas) {
    if (f.n >= N_MIN_FASE && f.p90 != null && (cuello == null || f.p90 > cuello.p90)) {
      cuello = { fase: f.fase, p90: f.p90 };
    }
  }

  return {
    filas,
    cuello,
    fasesLentas: filas.filter((f) => f.banda === 'rojo').length,
    tramosMedidos: filas.reduce((acc, f) => acc + f.n, 0),
  };
}

/** Percentil con interpolación lineal — espeja `percentile_cont` de Postgres. */
function percentil(ordenado: readonly number[], q: number): number {
  if (ordenado.length === 0) return 0;
  if (ordenado.length === 1) return ordenado[0]!;
  const idx = q * (ordenado.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return ordenado[lo]!;
  return ordenado[lo]! + (ordenado[hi]! - ordenado[lo]!) * (idx - lo);
}

/**
 * Agrega días de permanencia por fase (n/mediana/p90) desde filas crudas. Se usa
 * para el modo "solo activas" del radar, donde la permanencia se calcula en el
 * cliente desde la antigüedad actual (no hay tramo cerrado todavía). Espeja la
 * estadística del RPC para que ambos caminos den lo mismo.
 */
export function agregarPorFase(
  rows: readonly { posicion: number; fase: string; dias: number }[]
): FaseCalificacionRaw[] {
  const byPos = new Map<number, { fase: string; dias: number[] }>();
  for (const r of rows) {
    const e = byPos.get(r.posicion) ?? { fase: r.fase, dias: [] };
    e.dias.push(r.dias);
    byPos.set(r.posicion, e);
  }
  return [...byPos.entries()].map(([posicion, { fase, dias }]) => {
    const s = [...dias].sort((a, b) => a - b);
    return {
      posicion,
      fase,
      n: s.length,
      mediana: Math.round(percentil(s, 0.5) * 10) / 10,
      p90: Math.round(percentil(s, 0.9) * 10) / 10,
    };
  });
}

/** Tono de Badge para la banda (mapea a los tonos del design system). */
export function bandaTone(banda: BandaFase): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (banda) {
    case 'verde':
      return 'success';
    case 'ambar':
      return 'warning';
    case 'rojo':
      return 'danger';
    default:
      return 'neutral';
  }
}
