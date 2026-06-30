/**
 * Fluidez por venta — iniciativa dilesa-fluidez-pipeline, S2b (R2/R4).
 *
 * Contextualiza los "días en fase" de S1 contra el benchmark histórico de esa
 * fase (`dilesa.v_fase_benchmark`, creado en S2a): el mismo "18 d" ya no se mide
 * con un umbral fijo sino con lo TÍPICO de su fase. Es el RIESGO ACTUAL de la
 * venta (su fase en curso), no un score 0-100 — bandas que Dirección explica en
 * una línea (R4): "rojo = más lento que el 90% de los casos en esa fase".
 *
 *   verde «Al día»  → dias ≤ mediana (igual o mejor que lo típico)
 *   ámbar «Lenta»   → mediana < dias ≤ p90 (arriba de lo típico, dentro de rango)
 *   rojo  «Crítica» → dias > p90 (en la cola lenta; atorada de verdad)
 *
 * Sin benchmark de la fase (n bajo, o fases 15–17 fuera del radar) → `null`: la
 * UI cae al color por umbral fijo de S1.
 */

export type BandaFluidez = 'verde' | 'ambar' | 'rojo';

export type FaseBenchmarkRef = { mediana: number | null; p90: number | null };

/** Banda de riesgo de la venta según sus días en la fase actual vs. el benchmark. */
export function bandaFluidez(
  dias: number | null | undefined,
  benchmark: FaseBenchmarkRef | null | undefined
): BandaFluidez | null {
  if (dias == null || benchmark == null) return null;
  const { mediana, p90 } = benchmark;
  if (mediana == null || p90 == null) return null;
  if (dias > p90) return 'rojo';
  if (dias > mediana) return 'ambar';
  return 'verde';
}

/** Severidad numérica para ordenar (rojo arriba). `null` = sin dato, al fondo. */
export function severidadFluidez(banda: BandaFluidez | null): number {
  switch (banda) {
    case 'rojo':
      return 3;
    case 'ambar':
      return 2;
    case 'verde':
      return 1;
    default:
      return 0;
  }
}

/** Etiqueta corta de la banda. */
export function labelFluidez(banda: BandaFluidez): string {
  return banda === 'verde' ? 'Al día' : banda === 'ambar' ? 'Lenta' : 'Crítica';
}

/** Tono de Badge del design system para la banda. */
export function toneFluidez(banda: BandaFluidez): 'success' | 'warning' | 'danger' {
  return banda === 'verde' ? 'success' : banda === 'ambar' ? 'warning' : 'danger';
}

/** Clase de color de texto para los días, según la banda. */
export function colorFluidez(banda: BandaFluidez): string {
  return banda === 'verde'
    ? 'text-emerald-500'
    : banda === 'ambar'
      ? 'text-amber-500'
      : 'text-red-500';
}

/**
 * Tooltip que explica el número en lenguaje humano (anti caja-negra): cuántos
 * días lleva y qué es típico para esa fase.
 */
export function tooltipFluidez(
  dias: number,
  fase: string | null,
  benchmark: FaseBenchmarkRef | null | undefined
): string {
  const base = `${dias} día${dias === 1 ? '' : 's'} en ${fase ?? 'esta fase'}`;
  if (!benchmark || benchmark.mediana == null || benchmark.p90 == null) return base;
  return `${base} · típico: mediana ${benchmark.mediana} d, p90 ${benchmark.p90} d`;
}
