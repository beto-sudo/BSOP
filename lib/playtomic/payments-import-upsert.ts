import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type { PaymentImportRow } from './csv-import';

/**
 * Upsert idempotente de filas parseadas del CSV de Playtomic Manager a
 * `playtomic.payments_import`. Compartido por dos call sites:
 *
 *   1. `app/rdb/playtomic/import-csv/actions.ts` — upload manual del operador
 *      (cliente con auth de usuario, `uploadedBy = user.id`).
 *   2. `app/api/cron/playtomic-csv-import/route.ts` — descarga automática vía
 *      Vercel Cron (cliente service-role, `uploadedBy = null`).
 *
 * La PK de `payments_import` es `payment_id`, así que re-subir un periodo
 * solapado es seguro: las filas existentes se actualizan, no se duplican.
 */

const BATCH_SIZE = 100;
const ID_CHUNK_SIZE = 500;

export type UpsertPaymentsMeta = {
  /** `auth.users.id` del operador en upload manual; `null` en el cron. */
  uploadedBy: string | null;
  /** Nombre del archivo subido, o marcador `auto:...` en el cron. */
  sourceFilename: string;
};

export type UpsertPaymentsResult =
  | {
      ok: true;
      rows_inserted: number;
      rows_updated: number;
      service_date_min: string | null;
      service_date_max: string | null;
      payment_date_max: string | null;
    }
  | { ok: false; error: string };

export async function upsertPaymentsRows(
  supabase: SupabaseClient<Database>,
  rows: PaymentImportRow[],
  meta: UpsertPaymentsMeta
): Promise<UpsertPaymentsResult> {
  const playtomicSchema = supabase.schema('playtomic');

  // Pre-query: identifica cuáles existen para reportar insertados vs actualizados.
  const paymentIds = rows.map((r) => r.payment_id);
  const existingIds = new Set<string>();
  for (let i = 0; i < paymentIds.length; i += ID_CHUNK_SIZE) {
    const chunk = paymentIds.slice(i, i + ID_CHUNK_SIZE);
    const { data: existing, error: existingErr } = await playtomicSchema
      .from('payments_import')
      .select('payment_id')
      .in('payment_id', chunk);
    if (existingErr) {
      return { ok: false, error: `Error consultando existentes: ${existingErr.message}` };
    }
    for (const row of existing ?? []) existingIds.add(row.payment_id);
  }

  const uploadedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      ...r,
      uploaded_by: meta.uploadedBy,
      uploaded_at: uploadedAt,
      source_filename: meta.sourceFilename,
    }));
    const { error: upsertErr } = await playtomicSchema
      .from('payments_import')
      .upsert(batch, { onConflict: 'payment_id' });
    if (upsertErr) {
      return {
        ok: false,
        error: `Error en upsert (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${upsertErr.message}`,
      };
    }
  }

  // Métricas para el resumen post-upload.
  let serviceMin: string | null = null;
  let serviceMax: string | null = null;
  let paymentMax: string | null = null;
  for (const row of rows) {
    if (row.service_date) {
      if (!serviceMin || row.service_date < serviceMin) serviceMin = row.service_date;
      if (!serviceMax || row.service_date > serviceMax) serviceMax = row.service_date;
    }
    if (row.payment_date) {
      if (!paymentMax || row.payment_date > paymentMax) paymentMax = row.payment_date;
    }
  }

  const rowsUpdated = rows.filter((r) => existingIds.has(r.payment_id)).length;
  const rowsInserted = rows.length - rowsUpdated;

  return {
    ok: true,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    service_date_min: serviceMin,
    service_date_max: serviceMax,
    payment_date_max: paymentMax,
  };
}
