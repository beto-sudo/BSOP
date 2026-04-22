import { RevenueChart } from './revenue-chart';
import type { ChartBucket } from './types';
import { formatMoney } from './utils';

export function RevenueSection({ revenueSeries }: { revenueSeries: ChartBucket[] }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Ingresos diarios</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Barras apiladas por deporte, sin librerías externas.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-[var(--text)]/60 sm:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Total</div>
            <div className="mt-1 font-semibold text-[var(--text)]">
              {formatMoney(
                revenueSeries.reduce((acc, day) => acc + day.total, 0),
                true
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Padel</div>
            <div className="mt-1 font-semibold text-[var(--text)]">
              {formatMoney(
                revenueSeries.reduce((acc, day) => acc + day.padel, 0),
                true
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">Tennis</div>
            <div className="mt-1 font-semibold text-[var(--text)]">
              {formatMoney(
                revenueSeries.reduce((acc, day) => acc + day.tennis, 0),
                true
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/45">
              Canceladas
            </div>
            <div className="mt-1 font-semibold text-[var(--text)]">
              {revenueSeries.reduce((acc, day) => acc + day.cancelaciones, 0)}
            </div>
          </div>
        </div>
      </div>
      <RevenueChart data={revenueSeries} />
    </section>
  );
}
