'use server';

import { revalidatePath } from 'next/cache';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { parsePaymentsCsv } from '@/lib/playtomic/csv-import';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type ImportPaymentsResult =
  | {
      ok: true;
      total_in_csv: number;
      rows_inserted: number;
      rows_updated: number;
      parse_errors: { line: number; reason: string }[];
      service_date_min: string | null;
      service_date_max: string | null;
      payment_date_max: string | null;
    }
  | { ok: false; error: string };

const BATCH_SIZE = 100;

export async function importPaymentsCsv(formData: FormData): Promise<ImportPaymentsResult> {
  await assertNotInPreview();

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Archivo no recibido. Selecciona un CSV antes de subir.' };
  }
  if (file.size === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'El archivo excede 10MB. Divide el periodo en uploads más chicos.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };
  }

  const text = await file.text();
  const { rows, errors } = parsePaymentsCsv(text);
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        errors.length > 0
          ? `No se procesaron filas. Primer error: ${errors[0].reason}`
          : 'El CSV no tiene filas de pagos.',
    };
  }

  const playtomicSchema = supabase.schema('playtomic');

  // Pre-query: identifica cuáles existen para reportar insertados vs actualizados.
  const paymentIds = rows.map((r) => r.payment_id);
  const existingIds = new Set<string>();
  const idChunkSize = 500;
  for (let i = 0; i < paymentIds.length; i += idChunkSize) {
    const chunk = paymentIds.slice(i, i + idChunkSize);
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
  const sourceFilename = file.name;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      ...r,
      uploaded_by: user.id,
      uploaded_at: uploadedAt,
      source_filename: sourceFilename,
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

  revalidatePath('/rdb/playtomic/import-csv');
  revalidatePath('/rdb/playtomic/conciliacion');
  revalidatePath('/rdb/playtomic');

  return {
    ok: true,
    total_in_csv: rows.length,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    parse_errors: errors,
    service_date_min: serviceMin,
    service_date_max: serviceMax,
    payment_date_max: paymentMax,
  };
}
