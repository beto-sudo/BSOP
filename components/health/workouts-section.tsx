import { Activity, BedDouble } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { formatMetricValue, type HealthWorkoutRow } from '@/lib/health';
import { EmptyState } from './empty-state';
import { StatPill } from './stat-pill';

type WorkoutSummary = {
  total: number;
  duration: number;
  energy: number;
  distance: number;
  mix: Array<[string, number]>;
};

export function WorkoutsSection({
  workouts,
  workoutSummary,
  rangeLabel,
}: {
  workouts: HealthWorkoutRow[];
  workoutSummary: WorkoutSummary;
  rangeLabel: string;
}) {
  return (
    <section className="mt-10 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Surface className="p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
          <BedDouble className="h-5 w-5 text-green-600 dark:text-green-200" />
          <div>
            <h2 className="text-lg font-semibold">Workouts</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">Filtered by the active date range.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatPill label="Total" value={`${workoutSummary.total}`} />
          <StatPill label="Duration" value={`${Math.round(workoutSummary.duration)} min`} />
          <StatPill label="Distance" value={`${formatMetricValue(workoutSummary.distance, 1)} km`} />
          <StatPill label="Energy" value={`${Math.round(workoutSummary.energy)} kcal`} />
        </div>

        {workouts.length ? (
          <div className="space-y-4">
            {workouts.slice(0, 5).map((workout) => (
              <div key={`${workout.name}-${workout.start_time}`} className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 dark:border-white/8 dark:bg-white/4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[var(--text)] dark:text-white">{workout.name}</div>
                    <div className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/45">{new Date(workout.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)] dark:border-white/10 dark:bg-black/20 dark:text-white/60">{workout.source ?? 'Unknown source'}</div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    ['Duration', workout.duration_minutes == null ? '—' : `${Math.round(workout.duration_minutes)} min`],
                    ['Energy', workout.energy_kcal == null ? '—' : `${Math.round(workout.energy_kcal)} kcal`],
                    ['Distance', workout.distance_km == null ? '—' : `${workout.distance_km.toFixed(1)} km`],
                    ['Avg HR', workout.heart_rate_avg == null ? '—' : `${Math.round(workout.heart_rate_avg)} bpm`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 dark:border-white/6 dark:bg-black/10">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">{label}</div>
                      <div className="mt-2 text-sm font-medium text-[var(--text)] dark:text-white/85">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No workouts in this range" copy="Once workout exports arrive inside the selected window, sessions will show here with duration, energy, distance, and heart rate." />
        )}
      </Surface>

      <Surface className="p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-center gap-3 text-[var(--text)] dark:text-white">
          <Activity className="h-5 w-5 text-green-600 dark:text-green-200" />
          <h2 className="text-lg font-semibold">Workout mix</h2>
        </div>
        {workoutSummary.mix.length ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 dark:border-white/8 dark:bg-white/4">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">Top type</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--text)] dark:text-white">{workoutSummary.mix[0]?.[0]}</div>
              <div className="mt-1 text-sm text-[var(--muted-foreground)] dark:text-white/50">{workoutSummary.mix[0]?.[1]} sessions in {rangeLabel.toLowerCase()}</div>
            </div>
            {workoutSummary.mix.slice(0, 6).map(([name, count]) => {
              const width = `${(count / Math.max(workoutSummary.total, 1)) * 100}%`;
              return (
                <div key={name}>
                  <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted-foreground)] dark:text-white/70">
                    <span>{name}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-white/8">
                    <div className="h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No workout mix yet" copy="Workout distribution will appear here once the selected range includes sessions." />
        )}
      </Surface>
    </section>
  );
}
