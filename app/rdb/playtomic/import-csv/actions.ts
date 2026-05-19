'use server';

import { revalidatePath } from 'next/cache';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { parsePaymentsCsv } from '@/lib/playtomic/csv-import';
import { upsertPaymentsRows } from '@/lib/playtomic/payments-import-upsert';
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

  const result = await upsertPaymentsRows(supabase, rows, {
    uploadedBy: user.id,
    sourceFilename: file.name,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath('/rdb/playtomic/import-csv');
  revalidatePath('/rdb/playtomic/conciliacion');
  revalidatePath('/rdb/playtomic');

  return {
    ok: true,
    total_in_csv: rows.length,
    rows_inserted: result.rows_inserted,
    rows_updated: result.rows_updated,
    parse_errors: errors,
    service_date_min: result.service_date_min,
    service_date_max: result.service_date_max,
    payment_date_max: result.payment_date_max,
  };
}
