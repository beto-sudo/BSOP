import type { SyncRow } from './types';
import { formatDateTime } from './utils';

export function SyncSection({ syncs }: { syncs: SyncRow[] }) {
  const lastSuccess = syncs.find((s) => s.status === 'success');
  const lastError = syncs.find((s) => s.status === 'error');

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">Sincronización</h2>
        {!lastSuccess && !lastError ? (
          <span className="text-sm text-[var(--text)]/50">Sin registros</span>
        ) : (
          <div className="flex flex-col items-end gap-1 text-sm">
            {lastSuccess ? (
              <span className="text-green-600 dark:text-green-400">
                ✓ Último éxito: {formatDateTime(lastSuccess.finished_at ?? lastSuccess.started_at)}
                {lastSuccess.bookings_fetched != null
                  ? ` · ${lastSuccess.bookings_fetched} bookings`
                  : ''}
              </span>
            ) : null}
            {lastError ? (
              <span className="text-red-500 dark:text-red-400 max-w-md truncate">
                ✗ Último error: {formatDateTime(lastError.finished_at ?? lastError.started_at)}
                {lastError.error_message ? ` — ${lastError.error_message}` : ''}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
