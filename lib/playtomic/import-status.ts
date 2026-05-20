import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/**
 * Snapshot del estado de `playtomic.payments_import`. Consumido por la
 * página `/rdb/playtomic/import-csv` para mostrar al operador cuándo fue
 * el último sync (cron o manual) sin que tenga que abrir Supabase.
 */
export type PaymentsImportStatus = {
  /** ISO timestamp del `uploaded_at` más reciente; null si la tabla está vacía. */
  lastSyncAt: string | null;
  /** `source_filename` del último upsert: `auto:cron@<iso>` o el nombre del archivo manual. */
  lastSyncSource: string | null;
  /** Total de filas en la tabla. */
  totalRows: number;
  /** `payment_date` mínimo cubierto (más antiguo). */
  paymentDateMin: string | null;
  /** `payment_date` máximo cubierto (más reciente). */
  paymentDateMax: string | null;
};

export type ImportSourceKind = 'auto' | 'manual' | 'unknown';

/**
 * Distingue un upsert del cron (`auto:cron@...`) de uno hecho desde la UI
 * (nombre del archivo cargado). El cron empezó a poblar este campo en
 * PR #470 (2026-05-19); filas históricas previas tienen el filename real.
 */
export function classifyImportSource(source: string | null | undefined): ImportSourceKind {
  if (!source) return 'unknown';
  return source.startsWith('auto:cron@') ? 'auto' : 'manual';
}

/**
 * Texto relativo en español ("hace 3h", "hace 2d") computado contra un
 * `nowMs` explícito para que sea testable y para que la página (Server
 * Component) lo calcule del lado del server — así evitamos drift de
 * hidratación con `new Date()` en el cliente.
 */
export function formatRelativeFromNow(nowMs: number, iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = nowMs - t;
  if (diffMs < 0) return 'en el futuro';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'hace menos de 1 min';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

export type SyncTone = 'ok' | 'warn' | 'err';

/**
 * Deriva el tono visual del status card. Se calcula del lado del server
 * (Server Component) para que la clase Tailwind del borde no haga drift
 * de hidratación entre `Date.now()` de server y client.
 *
 *   - `err`: tabla vacía o `lastSyncAt` null → nunca hubo sync.
 *   - `ok`: último sync fue del cron Y < 36h → operación normal.
 *   - `warn`: cualquier otra cosa (sync manual, o cron pero ≥ 36h).
 *
 * 36h es la franja de holgura sobre el schedule diario del cron (03:00
 * CST) — permite una corrida fallida sin disparar la alerta visual.
 */
export function computeSyncTone(
  status: PaymentsImportStatus,
  nowMs: number,
  thresholdHours = 36
): SyncTone {
  if (!status.lastSyncAt) return 'err';
  const t = new Date(status.lastSyncAt).getTime();
  if (Number.isNaN(t)) return 'err';
  const hoursSince = (nowMs - t) / 3_600_000;
  const kind = classifyImportSource(status.lastSyncSource);
  if (kind === 'auto' && hoursSince < thresholdHours) return 'ok';
  return 'warn';
}

export type PaymentsImportStatusView = {
  status: PaymentsImportStatus;
  lastSyncRelative: string | null;
  tone: SyncTone;
};

/**
 * Wrapper para Server Components: lee el status y deriva los campos de
 * presentación (`lastSyncRelative`, `tone`) en una sola llamada, evitando
 * que el page tenga que invocar `Date.now()` durante render (regla del
 * React Compiler "no impure functions during render"). El `nowMs` es
 * inyectable para tests.
 */
export async function getPaymentsImportStatusView(
  supabase: SupabaseClient<Database>,
  nowMs: number = Date.now()
): Promise<PaymentsImportStatusView> {
  const status = await getPaymentsImportStatus(supabase);
  return {
    status,
    lastSyncRelative: formatRelativeFromNow(nowMs, status.lastSyncAt),
    tone: computeSyncTone(status, nowMs),
  };
}

export async function getPaymentsImportStatus(
  supabase: SupabaseClient<Database>
): Promise<PaymentsImportStatus> {
  const playtomic = supabase.schema('playtomic');

  const [latestRes, countRes, maxDateRes, minDateRes] = await Promise.all([
    playtomic
      .from('payments_import')
      .select('uploaded_at, source_filename')
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    playtomic.from('payments_import').select('payment_id', { count: 'exact', head: true }),
    playtomic
      .from('payments_import')
      .select('payment_date')
      .order('payment_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    playtomic
      .from('payments_import')
      .select('payment_date')
      .order('payment_date', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    lastSyncAt: latestRes.data?.uploaded_at ?? null,
    lastSyncSource: latestRes.data?.source_filename ?? null,
    totalRows: countRes.count ?? 0,
    paymentDateMin: minDateRes.data?.payment_date ?? null,
    paymentDateMax: maxDateRes.data?.payment_date ?? null,
  };
}
