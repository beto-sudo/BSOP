import { CancellationHourChart, CancellationWeekdayChart } from './cancellation-charts';
import type { CancellationAnalysis } from './derivations';

export function CancellationSection({
  analysis,
  totalBookings,
}: {
  analysis: CancellationAnalysis;
  totalBookings: number;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Análisis de Cancelaciones</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Patrones y tendencias en reservas canceladas dentro del periodo seleccionado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
            Total cancelaciones
          </div>
          <div className="mt-2 text-3xl font-semibold text-[var(--text)]">
            {analysis.canceledCount}
          </div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            Reservas marcadas como canceladas.
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
            Tasa de cancelación
          </div>
          <div className="mt-2 text-3xl font-semibold text-[var(--text)]">
            {analysis.cancellationRate.toFixed(1)}%
          </div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            Sobre {totalBookings} reservas del periodo.
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
            Padel vs Tennis
          </div>
          <div className="mt-2 space-y-1 text-sm text-[var(--text)]">
            <div className="flex items-center justify-between gap-3">
              <span>Padel</span>
              <span className="font-medium">
                {analysis.sports.PADEL.canceled} (
                {analysis.sports.PADEL.total
                  ? ((analysis.sports.PADEL.canceled / analysis.sports.PADEL.total) * 100).toFixed(
                      1
                    )
                  : '0.0'}
                %)
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Tennis</span>
              <span className="font-medium">
                {analysis.sports.TENNIS.canceled} (
                {analysis.sports.TENNIS.total
                  ? (
                      (analysis.sports.TENNIS.canceled / analysis.sports.TENNIS.total) *
                      100
                    ).toFixed(1)
                  : '0.0'}
                %)
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-[var(--card)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
            Duración cancelada promedio
          </div>
          <div className="mt-2 text-3xl font-semibold text-[var(--text)]">
            {analysis.avgCanceledDuration.toFixed(0)} min
          </div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            Promedio de minutos en reservas canceladas.
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <CancellationWeekdayChart data={analysis.cancellationsByWeekday} />
        <CancellationHourChart data={analysis.cancellationsByHour} />
      </div>
    </section>
  );
}
