import { DesktopOnlyNotice } from '@/components/responsive';
import { ImportCsvView } from '@/components/playtomic/import-csv/import-csv-view';

/**
 * @module Import CSV de pagos Playtomic (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 */
export default function ImportCsvPage() {
  return (
    <>
      <DesktopOnlyNotice module="Import CSV Playtomic" />
      <div className="hidden sm:block">
        <ImportCsvView />
      </div>
    </>
  );
}
