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

export type WorkoutCardiacZones = {
  workout_id: number;
  workout_name: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  energy_kcal: number | null;
  avg_hr: number | null;
  max_hr_observed: number | null;
  samples: number;
  z1_samples: number;
  z2_samples: number;
  z3_samples: number;
  z4_samples: number;
  z5_samples: number;
};

export type TimelineMonthlyRow = {
  metric_name: string;
  month_start: string;
  avg_value: number;
  sample_count: number;
};

export type HealthRangePreset = 'today' | '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export type HealthDateRange = {
  preset: HealthRangePreset;
  from?: string;
  to?: string;
};

export type HealthDashboardRange = {
  vitalsFromIso: string;
  vitalsToIso: string;
  vitalsLabel: string;
  trendFromIso: string;
  trendToIso: string;
  trendLabel: string;
  trendDays: number;
  requestedFrom?: string;
  requestedTo?: string;
  preset: HealthRangePreset;
};

// Beto-specific defaults (post-bypass cardiac rehab context). Max HR uses
// 220 - age (50 in 2026). RHR baseline is the long-term average observed
// in the dataset. These feed the Karvonen zone calculation.
export const CARDIAC_RESTING_HR = 61;
export const CARDIAC_MAX_HR = 170;
export const CARDIAC_BYPASS_ISO = '2024-07-01';

const SLEEP_STAGE_METRICS = ['Sleep Core', 'Sleep Deep', 'Sleep REM', 'Sleep Awake'] as const;

// Pulled fresh for the hero "latest" cards. Everything here is cheap to
// hit because each name has its own index lookup in health_metrics.
const LATEST_METRIC_NAMES = [
  'Resting Heart Rate',
  'Heart Rate Variability',
  'Oxygen Saturation',
  'Step Count',
  'Blood Pressure Systolic',
  'Blood Pressure Diastolic',
  'Body Mass',
  'Body Fat Percentage',
  'Body Mass Index',
  'VO2 Max',
  'Walking Heart Rate Average',
  'Apple Sleeping Wrist Temperature',
  'Respiratory Rate',
  'Breathing Disturbances',
  'Six Minute Walking Test Distance',
  'Active Energy',
  'Basal Energy Burned',
  'Apple Exercise Time',
  'Apple Stand Time',
  'Apple Stand Hour',
  'Flights Climbed',
  'Walking Running Distance',
  'Time In Daylight',
  'Physical Effort',
  'lean_body_mass',
];

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

export function resolveHealthDashboardRange(
  input?: Partial<HealthDateRange>
): HealthDashboardRange {
  const preset = input?.preset ?? '7d';
  const nowIso = new Date().toISOString();

  if (preset === 'today') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsToIso: nowIso,
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(0),
      trendToIso: nowIso,
      trendLabel: 'Today',
      trendDays: 1,
    };
  }

  if (preset === '30d') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsToIso: nowIso,
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(29),
      trendToIso: nowIso,
      trendLabel: 'Last 30 Days',
      trendDays: 30,
    };
  }

  if (preset === '90d') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsToIso: nowIso,
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(89),
      trendToIso: nowIso,
      trendLabel: 'Last 90 Days',
      trendDays: 90,
    };
  }

  if (preset === '1y') {
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsToIso: nowIso,
      vitalsLabel: 'Today',
      trendFromIso: startOfDayIso(364),
      trendToIso: nowIso,
      trendLabel: 'Last 365 Days',
      trendDays: 365,
    };
  }

  if (preset === 'all') {
    const epoch = new Date('2011-01-01T00:00:00.000Z').toISOString();
    return {
      preset,
      vitalsFromIso: startOfDayIso(0),
      vitalsToIso: nowIso,
      vitalsLabel: 'Today',
      trendFromIso: epoch,
      trendToIso: nowIso,
      trendLabel: 'All history',
      trendDays: Math.max(1, Math.round((Date.now() - Date.parse(epoch)) / 86_400_000)),
    };
  }

  if (preset === 'custom') {
    const from = input?.from ? startOfDateIso(input.from) : null;
    const to = input?.to ? endOfDayIso(input.to) : null;

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const trendDays = Math.max(
        1,
        Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
      );
      const label = `${input?.from} → ${input?.to}`;
      return {
        preset,
        vitalsFromIso: from,
        vitalsToIso: to,
        vitalsLabel: label,
        trendFromIso: from,
        trendToIso: to,
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
    vitalsToIso: nowIso,
    vitalsLabel: 'Today',
    trendFromIso: startOfDayIso(6),
    trendToIso: nowIso,
    trendLabel: 'Last 7 Days',
    trendDays: 7,
  };
}

function metricSeries(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  name: string,
  fromIso: string,
  toIso: string
) {
  if (!supabase) return Promise.resolve({ data: [] as HealthMetricRow[], error: null });
  return supabase
    .from('health_metrics')
    .select('id, metric_name, date, value, unit, source')
    .eq('metric_name', name)
    .gte('date', fromIso)
    .lte('date', toIso)
    .order('date', { ascending: true })
    .returns<HealthMetricRow[]>();
}

function metricSeriesIn(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  names: readonly string[],
  fromIso: string,
  toIso: string
) {
  if (!supabase) return Promise.resolve({ data: [] as HealthMetricRow[], error: null });
  return supabase
    .from('health_metrics')
    .select('id, metric_name, date, value, unit, source')
    .in('metric_name', names as string[])
    .gte('date', fromIso)
    .lte('date', toIso)
    .order('date', { ascending: true })
    .returns<HealthMetricRow[]>();
}

export type HealthDashboardData = {
  range: HealthDashboardRange;
  latest: Record<string, HealthMetricRow | null>;
  // Recovery hero: pulls last 14 days regardless of the active range so
  // "Sleep / HRV / RHR" cards always reflect last night even if the user
  // selected "today" or a custom range with no recent data. The 14-day
  // window also gives current-vs-previous deltas a stable base so the
  // recovery flag (HRV drop > 10%, RHR rise > 5 bpm) can fire on any
  // active range.
  heroSleepStages: HealthMetricRow[];
  heroHrv: HealthMetricRow[];
  heroRestingHr: HealthMetricRow[];
  // Recovery
  sleepStages: HealthMetricRow[];
  hrv: HealthMetricRow[];
  restingHr: HealthMetricRow[];
  wristTemp: HealthMetricRow[];
  // Cardiac fitness
  walkingHrAvg: HealthMetricRow[];
  vo2Max: HealthMetricRow[];
  sixMinWalk: HealthMetricRow[];
  zones: WorkoutCardiacZones[];
  workouts: HealthWorkoutRow[];
  // Functional movement (gait quality + stair power)
  walkingSpeed: HealthMetricRow[];
  walkingAsymmetry: HealthMetricRow[];
  walkingDoubleSupport: HealthMetricRow[];
  stairSpeedUp: HealthMetricRow[];
  stairSpeedDown: HealthMetricRow[];
  // Body composition
  weight: HealthMetricRow[];
  bodyFat: HealthMetricRow[];
  bmi: HealthMetricRow[];
  leanMass: HealthMetricRow[];
  // Vitals & respiration
  bpSystolic: HealthMetricRow[];
  bpDiastolic: HealthMetricRow[];
  spo2: HealthMetricRow[];
  respiratoryRate: HealthMetricRow[];
  breathing: HealthMetricRow[];
  // Activity
  steps: HealthMetricRow[];
  flights: HealthMetricRow[];
  distance: HealthMetricRow[];
  activeEnergy: HealthMetricRow[];
  basalEnergy: HealthMetricRow[];
  exerciseTime: HealthMetricRow[];
  standTime: HealthMetricRow[];
  standHours: HealthMetricRow[];
  daylight: HealthMetricRow[];
  physicalEffort: HealthMetricRow[];
  // Timeline
  timeline: TimelineMonthlyRow[];
  errors: string[];
};

const EMPTY_DATA_SUFFIX: Omit<HealthDashboardData, 'range' | 'errors'> = {
  latest: {},
  heroSleepStages: [],
  heroHrv: [],
  heroRestingHr: [],
  sleepStages: [],
  hrv: [],
  restingHr: [],
  wristTemp: [],
  walkingHrAvg: [],
  vo2Max: [],
  sixMinWalk: [],
  zones: [],
  workouts: [],
  walkingSpeed: [],
  walkingAsymmetry: [],
  walkingDoubleSupport: [],
  stairSpeedUp: [],
  stairSpeedDown: [],
  weight: [],
  bodyFat: [],
  bmi: [],
  leanMass: [],
  bpSystolic: [],
  bpDiastolic: [],
  spo2: [],
  respiratoryRate: [],
  breathing: [],
  steps: [],
  flights: [],
  distance: [],
  activeEnergy: [],
  basalEnergy: [],
  exerciseTime: [],
  standTime: [],
  standHours: [],
  daylight: [],
  physicalEffort: [],
  timeline: [],
};

export async function getHealthDashboardData(
  rangeInput?: Partial<HealthDateRange>
): Promise<HealthDashboardData> {
  const range = resolveHealthDashboardRange(rangeInput);
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      range,
      errors: ['Supabase service role key is not configured.'],
      ...EMPTY_DATA_SUFFIX,
    };
  }

  const from = range.trendFromIso;
  const to = range.trendToIso;
  // Timeline is pinned to a 24-month pre/post-bypass window regardless of
  // the trend preset, because it answers a different question ("what does
  // recovery look like?"). Rolling it with the trend selector would hide
  // the post-surgery delta on short ranges.
  const timelineFrom = new Date(Date.now() - 730 * 86_400_000).toISOString();
  // Hero sleep window is also range-independent: the "last night" card must
  // show the most recent sleep even if the active range is "today" and
  // there is no sleep yet.
  const heroSleepFrom = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [
    latestResult,
    heroSleepRes,
    heroHrvRes,
    heroRestingHrRes,
    sleepStagesRes,
    hrvRes,
    restingHrRes,
    wristTempRes,
    walkingHrAvgRes,
    vo2MaxRes,
    sixMinWalkRes,
    workoutsRes,
    zonesRes,
    walkingSpeedRes,
    walkingAsymmetryRes,
    walkingDoubleSupportRes,
    stairSpeedUpRes,
    stairSpeedDownRes,
    weightRes,
    bodyFatRes,
    bmiRes,
    leanMassRes,
    bpSysRes,
    bpDiaRes,
    spo2Res,
    respiratoryRes,
    breathingRes,
    stepsRes,
    flightsRes,
    distanceRes,
    activeEnergyRes,
    basalEnergyRes,
    exerciseTimeRes,
    standTimeRes,
    standHoursRes,
    daylightRes,
    physicalEffortRes,
    timelineRes,
  ] = await Promise.all([
    // One row per metric_name (the newest), via a DISTINCT ON RPC. The
    // previous approach (LIMIT 500 of all metrics mixed) was dominated by
    // high-frequency metrics (Heart Rate, Respiratory Rate) and silently
    // dropped low-frequency ones like VO2 Max, BP, Wrist Temp, which then
    // rendered as "Sin datos" on the hero even though they existed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_latest_health_metrics', {
      p_names: LATEST_METRIC_NAMES,
    }),
    metricSeriesIn(supabase, SLEEP_STAGE_METRICS, heroSleepFrom, new Date().toISOString()),
    metricSeries(supabase, 'Heart Rate Variability', heroSleepFrom, new Date().toISOString()),
    metricSeries(supabase, 'Resting Heart Rate', heroSleepFrom, new Date().toISOString()),
    metricSeriesIn(supabase, SLEEP_STAGE_METRICS, from, to),
    metricSeries(supabase, 'Heart Rate Variability', from, to),
    metricSeries(supabase, 'Resting Heart Rate', from, to),
    metricSeries(supabase, 'Apple Sleeping Wrist Temperature', from, to),
    metricSeries(supabase, 'Walking Heart Rate Average', from, to),
    metricSeries(supabase, 'VO2 Max', from, to),
    metricSeries(supabase, 'Six Minute Walking Test Distance', from, to),
    supabase
      .from('health_workouts')
      .select(
        'id, name, start_time, end_time, duration_minutes, distance_km, energy_kcal, heart_rate_avg, heart_rate_max, source'
      )
      .gte('start_time', from)
      .lte('start_time', to)
      .order('start_time', { ascending: false })
      .returns<HealthWorkoutRow[]>(),
    // RPC signatures are not in the generated supabase types, so we cast to
    // `any` here and parse the returned rows into our own DTO below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_workout_cardiac_zones', {
      p_from: from,
      p_to: to,
      p_resting_hr: CARDIAC_RESTING_HR,
      p_max_hr: CARDIAC_MAX_HR,
    }),
    metricSeries(supabase, 'Walking Speed', from, to),
    metricSeries(supabase, 'Walking Asymmetry Percentage', from, to),
    metricSeries(supabase, 'Walking Double Support Percentage', from, to),
    metricSeries(supabase, 'Stair Speed Up', from, to),
    metricSeries(supabase, 'Stair Speed Down', from, to),
    metricSeries(supabase, 'Body Mass', from, to),
    metricSeries(supabase, 'Body Fat Percentage', from, to),
    metricSeries(supabase, 'Body Mass Index', from, to),
    metricSeries(supabase, 'lean_body_mass', from, to),
    metricSeries(supabase, 'Blood Pressure Systolic', from, to),
    metricSeries(supabase, 'Blood Pressure Diastolic', from, to),
    metricSeries(supabase, 'Oxygen Saturation', from, to),
    metricSeries(supabase, 'Respiratory Rate', from, to),
    metricSeries(supabase, 'Breathing Disturbances', from, to),
    metricSeries(supabase, 'Step Count', from, to),
    metricSeries(supabase, 'Flights Climbed', from, to),
    metricSeries(supabase, 'Walking Running Distance', from, to),
    metricSeries(supabase, 'Active Energy', from, to),
    metricSeries(supabase, 'Basal Energy Burned', from, to),
    metricSeries(supabase, 'Apple Exercise Time', from, to),
    metricSeries(supabase, 'Apple Stand Time', from, to),
    metricSeries(supabase, 'Apple Stand Hour', from, to),
    metricSeries(supabase, 'Time In Daylight', from, to),
    metricSeries(supabase, 'Physical Effort', from, to),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_health_timeline_monthly', { p_from: timelineFrom }),
  ]);

  const latest: Record<string, HealthMetricRow | null> = {};
  for (const row of (latestResult.data as HealthMetricRow[] | null) ?? []) {
    latest[row.metric_name] = row;
  }

  const zonesRows = ((zonesRes.data as WorkoutCardiacZones[] | null) ?? []).map((row) => ({
    ...row,
    avg_hr: row.avg_hr == null ? null : Number(row.avg_hr),
    max_hr_observed: row.max_hr_observed == null ? null : Number(row.max_hr_observed),
  }));

  const timeline = ((timelineRes.data as TimelineMonthlyRow[] | null) ?? []).map((row) => ({
    ...row,
    avg_value: Number(row.avg_value),
  }));

  const errors = [
    latestResult.error?.message,
    heroSleepRes.error?.message,
    heroHrvRes.error?.message,
    heroRestingHrRes.error?.message,
    sleepStagesRes.error?.message,
    hrvRes.error?.message,
    restingHrRes.error?.message,
    wristTempRes.error?.message,
    walkingHrAvgRes.error?.message,
    vo2MaxRes.error?.message,
    sixMinWalkRes.error?.message,
    workoutsRes.error?.message,
    zonesRes.error?.message,
    walkingSpeedRes.error?.message,
    walkingAsymmetryRes.error?.message,
    walkingDoubleSupportRes.error?.message,
    stairSpeedUpRes.error?.message,
    stairSpeedDownRes.error?.message,
    weightRes.error?.message,
    bodyFatRes.error?.message,
    bmiRes.error?.message,
    leanMassRes.error?.message,
    bpSysRes.error?.message,
    bpDiaRes.error?.message,
    spo2Res.error?.message,
    respiratoryRes.error?.message,
    breathingRes.error?.message,
    stepsRes.error?.message,
    flightsRes.error?.message,
    distanceRes.error?.message,
    activeEnergyRes.error?.message,
    basalEnergyRes.error?.message,
    exerciseTimeRes.error?.message,
    standTimeRes.error?.message,
    standHoursRes.error?.message,
    daylightRes.error?.message,
    physicalEffortRes.error?.message,
    timelineRes.error?.message,
  ].filter((m): m is string => !!m);

  return {
    range,
    latest,
    heroSleepStages: heroSleepRes.data ?? [],
    heroHrv: heroHrvRes.data ?? [],
    heroRestingHr: heroRestingHrRes.data ?? [],
    sleepStages: sleepStagesRes.data ?? [],
    hrv: hrvRes.data ?? [],
    restingHr: restingHrRes.data ?? [],
    wristTemp: wristTempRes.data ?? [],
    walkingHrAvg: walkingHrAvgRes.data ?? [],
    vo2Max: vo2MaxRes.data ?? [],
    sixMinWalk: sixMinWalkRes.data ?? [],
    zones: zonesRows,
    workouts: workoutsRes.data ?? [],
    walkingSpeed: walkingSpeedRes.data ?? [],
    walkingAsymmetry: walkingAsymmetryRes.data ?? [],
    walkingDoubleSupport: walkingDoubleSupportRes.data ?? [],
    stairSpeedUp: stairSpeedUpRes.data ?? [],
    stairSpeedDown: stairSpeedDownRes.data ?? [],
    weight: weightRes.data ?? [],
    bodyFat: bodyFatRes.data ?? [],
    bmi: bmiRes.data ?? [],
    leanMass: leanMassRes.data ?? [],
    bpSystolic: bpSysRes.data ?? [],
    bpDiastolic: bpDiaRes.data ?? [],
    spo2: spo2Res.data ?? [],
    respiratoryRate: respiratoryRes.data ?? [],
    breathing: breathingRes.data ?? [],
    steps: stepsRes.data ?? [],
    flights: flightsRes.data ?? [],
    distance: distanceRes.data ?? [],
    activeEnergy: activeEnergyRes.data ?? [],
    basalEnergy: basalEnergyRes.data ?? [],
    exerciseTime: exerciseTimeRes.data ?? [],
    standTime: standTimeRes.data ?? [],
    standHours: standHoursRes.data ?? [],
    daylight: daylightRes.data ?? [],
    physicalEffort: physicalEffortRes.data ?? [],
    timeline,
    errors,
  };
}
