/**
 * Sección de salud del briefing diario (iniciativa `daily-briefing-automation`).
 *
 * Antes esta sección la armaba la scheduled action de Claude Desktop corriendo
 * 3 queries SQL con CTEs contra el MCP de Supabase (que se colgaba con calls
 * concurrentes). Server-side reusamos los helpers YA vetados del módulo health
 * (`groupDailySleep`/`groupDailyAverage`/`summarizeDailyWindow`) — misma lógica
 * de dedup HAE que `app/health`, sin reinventar el bug de noches de 20-24h.
 *
 * `summarizeHealth` es PURA (testeable); `getHealthBriefing` es el wrapper de IO
 * fail-open: si no hay service role o falla la lectura, devuelve `available:
 * false` y el briefing reporta el gap en §2 (Estado de fuentes) sin romperse.
 */

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import type { HealthMetricRow } from '@/lib/health';
import {
  groupDailyAverage,
  groupDailySleep,
  summarizeDailyWindow,
  isStaleSince,
} from '@/components/health/helpers';

const SLEEP_STAGES = ['Sleep Core', 'Sleep Deep', 'Sleep REM'] as const;
const RHR = 'Resting Heart Rate';
const HRV = 'Heart Rate Variability';

/** Días que mira la ventana (7d recientes + 23d previos = 30; +15 de colchón). */
const LOOKBACK_DAYS = 45;
/** Una métrica sin dato por más de esto se reporta como sync gap. */
const STALE_DAYS = 3;

export type HealthDay = {
  date: string;
  sleepH: number | null;
  rhr: number | null;
  hrv: number | null;
};

export type HealthBriefing =
  | {
      available: true;
      sleep7d: number | null;
      sleepPrev23d: number | null;
      rhr7d: number | null;
      rhrPrev23d: number | null;
      hrv7d: number | null;
      hrvPrev23d: number | null;
      /** Serie por-día de los últimos 14 días para anclar la narrativa. */
      perDay14d: HealthDay[];
      /** Métricas con el último dato a más de STALE_DAYS días. */
      stale: { metric: string; daysAgo: number | null }[];
    }
  | { available: false; error: string };

function round(v: number | null, digits: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function latestDate(rows: HealthMetricRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    if (!max || d > max) max = d;
  }
  return max;
}

function isoNDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Agrega las filas crudas en los números del briefing. Pura: las pruebas la
 * llaman con filas sintéticas. Espeja la lógica del dashboard de salud.
 */
export function summarizeHealth(
  sleepRows: HealthMetricRow[],
  rhrRows: HealthMetricRow[],
  hrvRows: HealthMetricRow[]
): Extract<HealthBriefing, { available: true }> {
  const sleepPts = groupDailySleep(sleepRows);
  const rhrPts = groupDailyAverage(rhrRows);
  const hrvPts = groupDailyAverage(hrvRows);

  // Mapa por-día de los últimos 14 días (sleep ∪ rhr ∪ hrv).
  const cutoff = isoNDaysAgo(14);
  const byDate = new Map<string, HealthDay>();
  const ensure = (date: string): HealthDay => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, sleepH: null, rhr: null, hrv: null };
      byDate.set(date, d);
    }
    return d;
  };
  for (const p of sleepPts)
    if (p.date >= cutoff && p.value > 0) ensure(p.date).sleepH = round(p.value, 2);
  for (const p of rhrPts)
    if (p.date >= cutoff && p.value > 0) ensure(p.date).rhr = round(p.value, 1);
  for (const p of hrvPts)
    if (p.date >= cutoff && p.value > 0) ensure(p.date).hrv = round(p.value, 1);
  const perDay14d = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const stale: { metric: string; daysAgo: number | null }[] = [];
  for (const [label, rows] of [
    ['Sueño', sleepRows],
    ['RHR', rhrRows],
    ['HRV', hrvRows],
  ] as const) {
    const s = isStaleSince(latestDate(rows), STALE_DAYS);
    if (s.stale) stale.push({ metric: label, daysAgo: s.daysAgo });
  }

  return {
    available: true,
    sleep7d: round(summarizeDailyWindow(sleepPts, 7, 0), 2),
    sleepPrev23d: round(summarizeDailyWindow(sleepPts, 23, 7), 2),
    rhr7d: round(summarizeDailyWindow(rhrPts, 7, 0), 1),
    rhrPrev23d: round(summarizeDailyWindow(rhrPts, 23, 7), 1),
    hrv7d: round(summarizeDailyWindow(hrvPts, 7, 0), 1),
    hrvPrev23d: round(summarizeDailyWindow(hrvPts, 23, 7), 1),
    perDay14d,
    stale,
  };
}

function fetchSeries(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  names: readonly string[],
  fromIso: string
) {
  return supabase
    .from('health_metrics')
    .select('id, metric_name, date, value, unit, source')
    .in('metric_name', names as string[])
    .gte('date', fromIso)
    .order('date', { ascending: true })
    .returns<HealthMetricRow[]>();
}

/**
 * Lee health_metrics (45d) y devuelve los números del briefing. Fail-open: sin
 * service role o con error de lectura → `available: false` con el motivo, para
 * que el briefing lo reporte en §2 sin abortar el resto.
 */
export async function getHealthBriefing(): Promise<HealthBriefing> {
  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return { available: false, error: 'Sin service role (SUPABASE_SERVICE_ROLE_KEY).' };
  try {
    const fromIso = isoNDaysAgo(LOOKBACK_DAYS);
    const [sleep, rhr, hrv] = await Promise.all([
      fetchSeries(supabase, SLEEP_STAGES, fromIso),
      fetchSeries(supabase, [RHR], fromIso),
      fetchSeries(supabase, [HRV], fromIso),
    ]);
    const err = sleep.error || rhr.error || hrv.error;
    if (err) return { available: false, error: err.message };
    return summarizeHealth(sleep.data ?? [], rhr.data ?? [], hrv.data ?? []);
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : String(e) };
  }
}
