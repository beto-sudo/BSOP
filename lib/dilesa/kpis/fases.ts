/**
 * KPIs reactivos a filtros para el hub Fases (DILESA Ventas).
 * Anatomía ADR-034 (Module-level KPI strips).
 *
 * Pivote D10 vs curaduría Sprint 0 (ver planning doc): La curaduría
 * original tenía "Fase más poblada · Fase más demorada · # estancadas
 * (>30 días en fase) · Tiempo promedio pipeline · Tasa de avance ⚠".
 * Auditoría reveló que `dilesa.ventas` no tiene `fecha_entrada_fase_actual`
 * ni `fecha_cierre` — solo `created_at`. Esto rompe 3 de los 5 KPIs
 * propuestos. KPIs ajustados que respetan KPI2 (derivación 100%
 * client-side del array de ventas):
 *
 * 1. Activas — pulso del pipeline (cuántas se están moviendo).
 * 2. Fase más poblada — dónde se concentra el flujo.
 * 3. Días promedio en pipeline — `mean(days_since(created_at))` para
 *    activas. Es proxy temporal de cuánto tarda una venta desde alta
 *    hasta hoy (no es "días en fase" pero sí "días vivas").
 * 4. Estancadas >180d — `count(activas WHERE created_at > 180d)`.
 *    Las viejas que necesitan intervención.
 * 5. Avance promedio — `mean(fase_posicion) / max(fase_posicion)` —
 *    consistente con el mismo KPI en el tab Ventas.
 *
 * Estos KPIs miden el PIPELINE VIVO: solo estado='activa'. Las 'terminada'
 * (fase 17 alcanzada — sprint estados-venta) son cierre histórico y quedan
 * fuera a propósito; antes de ese sprint el histórico Coda contaminaba
 * "Estancadas" y "Días en pipeline" con ventas concluidas hace años.
 */

import type { ModuleKpi } from '@/components/module-page';
import { formatPercent } from '@/lib/format';

export interface VentaForKpis {
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  created_at: string;
}

/** Edad en días desde created_at hasta ahora (truncado al día). */
function daysSince(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)));
}

const ESTANCADA_DIAS = 180;

export function deriveFasesKpis(
  ventasFiltradas: readonly VentaForKpis[],
  options: { now?: number } = {}
): readonly ModuleKpi[] {
  const now = options.now ?? Date.now();
  const activas = ventasFiltradas.filter((v) => v.estado === 'activa');
  const total = activas.length;

  // Fase más poblada: agrupar por fase_actual y agarrar el top por count.
  // Tie-break alfabético estable.
  const porFase = new Map<string, number>();
  for (const v of activas) {
    if (!v.fase_actual) continue;
    porFase.set(v.fase_actual, (porFase.get(v.fase_actual) ?? 0) + 1);
  }
  let topFase: string | null = null;
  let topCount = 0;
  for (const [fase, count] of [...porFase.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
    if (count > topCount) {
      topCount = count;
      topFase = fase;
    }
  }
  const fasePobladaLabel = topFase ? `${topFase} (${topCount})` : '—';

  // Días promedio en pipeline (sobre activas).
  const dias = activas.map((v) => daysSince(v.created_at, now));
  const diasPromedio = dias.length === 0 ? null : dias.reduce((a, b) => a + b, 0) / dias.length;

  // Estancadas: activas con > N días.
  const estancadas = dias.filter((d) => d > ESTANCADA_DIAS).length;

  // Avance promedio del pipeline (mismo cálculo que ventas-module).
  const posiciones = activas
    .map((v) => v.fase_posicion)
    .filter((p): p is number => typeof p === 'number');
  const maxFase = posiciones.length === 0 ? 0 : Math.max(...posiciones);
  const avgFase =
    posiciones.length === 0 ? null : posiciones.reduce((a, b) => a + b, 0) / posiciones.length;
  const avancePct = avgFase == null || maxFase === 0 ? null : avgFase / maxFase;

  return [
    { key: 'activas', label: 'Activas', value: total },
    { key: 'fase_poblada', label: 'Fase más poblada', value: fasePobladaLabel },
    {
      key: 'dias_promedio',
      label: 'Días en pipeline',
      value: diasPromedio == null ? '—' : `${Math.round(diasPromedio)} días`,
    },
    { key: 'estancadas', label: 'Estancadas >180d', value: estancadas },
    { key: 'avance', label: 'Avance promedio', value: formatPercent(avancePct) },
  ];
}
