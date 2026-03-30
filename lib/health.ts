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

export type HealthRangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export type HealthDateRange = {
  preset: HealthRangePreset;
  from?: string;
  to?: string;
};

export type HealthDashboardRange = {
  vitalsFromIso: string;
  vitalsLabel: string;
  trendFromIso: string;
  trendLabel: string;
  trendDays: number;
  requestedFrom?: string;
  requestedTo?: string;
  preset: HealthRangePreset;
};

const SUMMARY_METRIC_NAMES = ['Resting Heart Rate', 'Heart Rate Variability', 'Oxygen Saturation', 'Step Count', 'Apple Exercise Time', 'Sleep Analysis'];

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

function endOfDayIso(dateInput: string) {
  const date = new Date(`${dateInput}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function startOfDateIso(dateInput: string) {
  const date = new Date(`${dateInput}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveHealthDashboardRange(input?: Partial<HealthDateRange>): HealthDashboardRange {
  const preset = input?.preset ?? '7d';

  if (preset === 'today') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(0),
      trendLabel: 'Today',
      trendDays: 1,
    };
  }

  if (preset === '30d') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(29),
      trendLabel: 'Last 30 Days',
      trendDays: 30,
    };
  }

  if (preset === '90d') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(89),
      trendLabel: 'Last 90 Days',
      trendDays: 90,
    };
  }

  if (preset === 'custom') {
    const from = input?.from ? startOfDateIso(input.from) : null;
    const to = input?.to ? endOfDayIso(input.to) : null;

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const trendDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
      const label = `${input?.from} → ${input?.to}`;
      return {
        preset,
        vitalsFromIso: from,
        vitalsLabel: label,
        trendFromIso: from,
        trendLabel: label,
        trendDays,
        requestedFrom: input?.from,
        requestedTo: input?.to,
      };
    }
  }

  return {
    preset: '7d',
    vitalsFromIso: startOfDayIso(0),
    vitalsLabel: 'Today',
    trendFromIso: startOfDayIso(6),
    trendLabel: 'Last 7 Days',
    trendDays: 7,
  };
}

export async function getHealthDashboardData(rangeInput?: Partial<HealthDateRange>) {
  const range = resolveHealthDashboardRange(rangeInput);
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
      range,
    };
  }

  const weightFromIso = range.preset === 'custom' ? range.trendFromIso : startOfDayIso(Math.min(Math.max(range.trendDays - 1, 29), 89));

  const [vitalsResult, summaryResult, hrvResult, restingHrResult, weightResult, workoutsResult] = await Promise.all([
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .in('metric_name', SUMMARY_METRIC_NAMES)
      .gte('date', range.vitalsFromIso)
      .order('date', { ascending: false })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .in('metric_name', SUMMARY_METRIC_NAMES)
      .gte('date', range.trendFromIso)
      .order('date', { ascending: false })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Heart Rate Variability')
      .gte('date', range.trendFromIso)
      .order('date', { ascending: true })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Resting Heart Rate')
      .gte('date', range.trendFromIso)
      .order('date', { ascending: true })
      .returns<HealthMetricRow[]>(),
    supabase
      .from('health_metrics')
      .select('id, metric_name, date, value, unit, source')
      .eq('metric_name', 'Body Mass')
      .gte('date', weightFromIso)
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
    hrvDaily: hrvResult.data ?? [],
    restingHrDaily: restingHrResult.data ?? [],
    weightDaily: weightResult.data ?? [],
    workouts: workoutsResult.data ?? [],
    errors,
    range,
  };
}
