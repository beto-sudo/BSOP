import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export type HealthMetricRow = {
  id: number;
  metric_name: string;
  date: string;
  value: number;
  unit: string | null;
  source: string | null;
};

export type HealthWorkoutRow = {
  id: number;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  energy_kcal: number | null;
  heart_rate_avg: number | null;
  heart_rate_max: number | null;
  source: string | null;
};

export type VitalsCard = {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
};

export function formatMetricValue(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDurationHours(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function startOfDayIso(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

export async function getHealthDashboardData() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      vitals: [] as HealthMetricRow[],
      summaryMetrics: [] as HealthMetricRow[],
      hrvDaily: [] as HealthMetricRow[],
      restingHrDaily: [] as HealthMetricRow[],
      weightDaily: [] as HealthMetricRow[],
      workouts: [] as HealthWorkoutRow[],
      errors: ['Supabase service role key is not configured.'],
    };
  }

  const todayStart = startOfDayIso(0);
  const sevenDaysAgo = startOfDayIso(6);
  const fourteenDaysAgo = startOfDayIso(13);
  const thirtyDaysAgo = startOfDayIso(29);
  const summaryMetricNames = ['Resting Heart Rate', 'Heart Rate Variability', 'Oxygen Saturation', 'Step Count', 'Apple Exercise Time', 'Sleep Analysis'];

  const [vitalsResult, summaryResult, hrvResult, restingHrResult, weightResult, workoutsResult] = await Promise.all([
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .in('metric_name', summaryMetricNames)
      .gte('date', todayStart)
      .order('date', { ascending: false })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .in('metric_name', summaryMetricNames)
      .gte('date', fourteenDaysAgo)
      .order('date', { ascending: false })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Heart Rate Variability')
      .gte('date', fourteenDaysAgo)
      .order('date', { ascending: true })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Resting Heart Rate')
      .gte('date', fourteenDaysAgo)
      .order('date', { ascending: true })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Body Mass')
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_workouts')
      .select('id, name, start_time, end_time, duration_minutes, distance_km, energy_kcal, heart_rate_avg, heart_rate_max, source')
      .order('start_time', { ascending: false })
      .limit(5)
      .returns<HealthWorkoutRow[]>(),
  ]);

  const errors = [vitalsResult, summaryResult, hrvResult, restingHrResult, weightResult, workoutsResult]
    .flatMap((result) => (result.error ? [result.error.message] : []));

  return {
    vitals: vitalsResult.data ?? [],
    summaryMetrics: summaryResult.data ?? [],
    hrvDaily: (hrvResult.data ?? []).filter((row) => row.date >= sevenDaysAgo),
    restingHrDaily: restingHrResult.data ?? [],
    weightDaily: weightResult.data ?? [],
    workouts: workoutsResult.data ?? [],
    errors,
  };
}
