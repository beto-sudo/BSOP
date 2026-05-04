import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ImportCsvView } from '@/components/playtomic/import-csv/import-csv-view';

/**
 * @module Import CSV de pagos Playtomic (RDB)
 * @responsive desktop-only
 */
export default function ImportCsvPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
      <DesktopOnlyNotice module="Import CSV Playtomic" />
      <div className="hidden sm:block">
        <ImportCsvView />
      </div>
    </RequireAccess>
  );
}
