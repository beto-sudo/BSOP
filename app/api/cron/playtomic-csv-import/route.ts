/**
 * Cron: descarga automática del CSV de pagos de Playtomic Manager.
 *
 * Por qué existe: el third-party API de Playtomic no expone `payment_method`
 * (veredicto 2026-05-11, ver docs/planning/rdb-pagos-cancha-conciliacion.md).
 * El CSV del panel Manager es el único origen de Wellhub / Club wallet /
 * Free payment / Cash. Antes era un upload manual semanal; este cron lo
 * automatiza reproduciendo el flujo web (login → token → export).
 *
 * Schedule: diario (ver vercel.json). Idempotente: la PK de
 * `playtomic.payments_import` es `payment_id`, así que re-importar un periodo
 * solapado actualiza filas en vez de duplicarlas. Por eso pedimos una ventana
 * amplia (default 60d hacia atrás): los pagos en club se marcan PAID en
 * Playtomic días/semanas después del juego, y una ventana corta los perdería.
 *
 * Security: requiere `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron lo
 * envía). Mismo patrón que /api/cron/daily-task-summary.
 *
 * Trigger manual / backfill puntual:
 *   GET /api/cron/playtomic-csv-import?lookbackDays=180
 *   (con el header Authorization: Bearer $CRON_SECRET)
 */

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { parsePaymentsCsv } from '@/lib/playtomic/csv-import';
import { downloadPlaytomicPaymentsCsv } from '@/lib/playtomic/manager-api';
import { upsertPaymentsRows } from '@/lib/playtomic/payments-import-upsert';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export const maxDuration = 300;

const DEFAULT_LOOKBACK_DAYS = 60;
const MAX_LOOKBACK_DAYS = 400;
const LOOKAHEAD_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function resolveLookbackDays(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get('lookbackDays');
  if (!raw) return DEFAULT_LOOKBACK_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.floor(n), MAX_LOOKBACK_DAYS);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Supabase admin env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      },
      { status: 500 }
    );
  }

  const lookbackDays = resolveLookbackDays(req);
  const now = Date.now();
  const startDate = new Date(now - lookbackDays * DAY_MS);
  const endDate = new Date(now + LOOKAHEAD_DAYS * DAY_MS);

  try {
    const { csv } = await downloadPlaytomicPaymentsCsv({ startDate, endDate });
    const { rows, errors } = parsePaymentsCsv(csv);

    if (rows.length === 0) {
      const summary = {
        ok: true as const,
        rows_in_csv: 0,
        rows_inserted: 0,
        rows_updated: 0,
        parse_errors: errors.length,
        window_start: startDate.toISOString(),
        window_end: endDate.toISOString(),
        note: 'El CSV no trajo filas de pagos en la ventana solicitada.',
      };
      console.log('[playtomic-csv-import]', JSON.stringify(summary));
      return NextResponse.json(summary);
    }

    const result = await upsertPaymentsRows(supabase, rows, {
      uploadedBy: null,
      sourceFilename: `auto:cron@${new Date(now).toISOString()}`,
    });
    if (!result.ok) {
      console.error('[playtomic-csv-import] upsert failed:', result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    revalidatePath('/rdb/playtomic/import-csv');
    revalidatePath('/rdb/playtomic/conciliacion');
    revalidatePath('/rdb/playtomic');

    const summary = {
      ok: true as const,
      rows_in_csv: rows.length,
      rows_inserted: result.rows_inserted,
      rows_updated: result.rows_updated,
      parse_errors: errors.length,
      lookback_days: lookbackDays,
      window_start: startDate.toISOString(),
      window_end: endDate.toISOString(),
      service_date_max: result.service_date_max,
      payment_date_max: result.payment_date_max,
    };
    console.log('[playtomic-csv-import]', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido en la importación.';
    console.error('[playtomic-csv-import] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
