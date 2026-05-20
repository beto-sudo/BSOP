import { DesktopOnlyNotice } from '@/components/responsive';
import { ImportCsvView } from '@/components/playtomic/import-csv/import-csv-view';
import { getPaymentsImportStatusView } from '@/lib/playtomic/import-status';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * @module Import CSV de pagos Playtomic (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 *
 * Desde PR #470 (cron diario 03:00 CST) esta página queda como respaldo
 * para uploads especiales / backfills. El status card de arriba muestra
 * el estado del último sync para que el operador sepa si hace falta
 * subir algo a mano.
 */
export default async function ImportCsvPage() {
  const supabase = await createSupabaseServerClient();
  const { status, lastSyncRelative, tone } = await getPaymentsImportStatusView(supabase);

  return (
    <>
      <DesktopOnlyNotice module="Import CSV Playtomic" />
      <div className="hidden sm:block">
        <ImportCsvView initialStatus={status} lastSyncRelative={lastSyncRelative} syncTone={tone} />
      </div>
    </>
  );
}
