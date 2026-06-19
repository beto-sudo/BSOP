/**
 * Resolución del modelo efectivo de un uso de IA (iniciativa registro-ia).
 *
 * Sprint 2: el modelo efectivo = override en `core.ai_config` (editable; surte
 * sin redeploy) → fallback al default del registry. En Vercel una env var NO es
 * hot-swap (las lambdas warm cachean `process.env`); por eso el override vive en
 * DB. Cache en memoria de 60s para no pegarle a la DB en cada llamada.
 *
 * FAIL-OPEN por diseño: sin service role, tabla inexistente (deploy antes de la
 * migración), o cualquier error → el default del registry. Nunca rompe.
 */

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { AI_USOS, type AiUsoId } from './registry';

const TTL_MS = 60_000;
let cache: { at: number; map: Map<string, string> } | null = null;

async function cargarOverrides(): Promise<Map<string, string>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return new Map();
  // core.ai_config no está en los tipos generados hasta aplicar la migración del
  // Sprint 2 → cast. Si la tabla no existe todavía, `error` se setea y caemos al
  // default (fail-open).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.schema('core') as any)
    .from('ai_config')
    .select('uso_id, modelo');
  if (error || !Array.isArray(data)) return new Map();
  return new Map(
    (data as { uso_id: string; modelo: string }[])
      .filter((r) => r.uso_id && r.modelo)
      .map((r) => [r.uso_id, r.modelo])
  );
}

export async function resolveModel(usoId: AiUsoId): Promise<string> {
  const fallback = AI_USOS[usoId].modeloDefault;
  try {
    const now = Date.now();
    if (!cache || now - cache.at > TTL_MS) {
      cache = { at: now, map: await cargarOverrides() };
    }
    return cache.map.get(usoId) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Solo para tests: limpia el cache de overrides entre casos. */
export function __resetAiConfigCache(): void {
  cache = null;
}
