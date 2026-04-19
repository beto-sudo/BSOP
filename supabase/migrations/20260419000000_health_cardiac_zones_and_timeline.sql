-- Health dashboard: cardiac zones per workout + monthly timeline.
-- Both are pure-read aggregation helpers (no tables, no writes). They are
-- idempotent via CREATE OR REPLACE and safe to re-run.

-- get_workout_cardiac_zones(from, to, resting_hr, max_hr)
-- Returns time-in-zone breakdown per workout using the raw Heart Rate
-- stream (`health_metrics` metric_name = 'Heart Rate'). Zones follow the
-- Karvonen formula (heart rate reserve) so post-bypass cardiac rehab
-- shows zones relative to Beto's actual RHR and HRmax.
CREATE OR REPLACE FUNCTION public.get_workout_cardiac_zones(
  p_from timestamptz,
  p_to timestamptz,
  p_resting_hr numeric DEFAULT 61,
  p_max_hr numeric DEFAULT 170
)
RETURNS TABLE (
  workout_id bigint,
  workout_name text,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes real,
  distance_km real,
  energy_kcal real,
  avg_hr numeric,
  max_hr_observed numeric,
  samples int,
  z1_samples int,
  z2_samples int,
  z3_samples int,
  z4_samples int,
  z5_samples int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH zones AS (
    SELECT
      p_resting_hr + 0.5 * (p_max_hr - p_resting_hr) AS z2_threshold,
      p_resting_hr + 0.6 * (p_max_hr - p_resting_hr) AS z3_threshold,
      p_resting_hr + 0.7 * (p_max_hr - p_resting_hr) AS z4_threshold,
      p_resting_hr + 0.8 * (p_max_hr - p_resting_hr) AS z5_threshold
  )
  SELECT
    w.id,
    w.name,
    w.start_time,
    w.end_time,
    w.duration_minutes,
    w.distance_km,
    w.energy_kcal,
    AVG(m.value)::numeric AS avg_hr,
    MAX(m.value)::numeric AS max_hr_observed,
    COUNT(m.value)::int AS samples,
    COUNT(m.value) FILTER (WHERE m.value < z.z2_threshold)::int AS z1_samples,
    COUNT(m.value) FILTER (WHERE m.value >= z.z2_threshold AND m.value < z.z3_threshold)::int AS z2_samples,
    COUNT(m.value) FILTER (WHERE m.value >= z.z3_threshold AND m.value < z.z4_threshold)::int AS z3_samples,
    COUNT(m.value) FILTER (WHERE m.value >= z.z4_threshold AND m.value < z.z5_threshold)::int AS z4_samples,
    COUNT(m.value) FILTER (WHERE m.value >= z.z5_threshold)::int AS z5_samples
  FROM public.health_workouts w
  CROSS JOIN zones z
  LEFT JOIN public.health_metrics m
    ON m.metric_name = 'Heart Rate'
   AND m.date >= w.start_time
   AND m.date <= COALESCE(w.end_time, w.start_time + interval '3 hours')
  WHERE w.start_time >= p_from
    AND w.start_time <= p_to
  GROUP BY w.id, w.name, w.start_time, w.end_time, w.duration_minutes, w.distance_km, w.energy_kcal;
$$;

GRANT EXECUTE ON FUNCTION public.get_workout_cardiac_zones(timestamptz, timestamptz, numeric, numeric)
  TO anon, authenticated, service_role;

-- get_health_timeline_monthly(from)
-- Returns monthly rollups for the timeline chart (post-bypass comparison).
-- Uses server-side date_trunc so we send ~N*months rows instead of
-- hundreds of thousands of raw samples.
CREATE OR REPLACE FUNCTION public.get_health_timeline_monthly(
  p_from timestamptz
)
RETURNS TABLE (
  metric_name text,
  month_start date,
  avg_value numeric,
  sample_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    metric_name,
    date_trunc('month', date)::date AS month_start,
    AVG(value)::numeric AS avg_value,
    COUNT(*)::int AS sample_count
  FROM public.health_metrics
  WHERE metric_name IN (
      'Resting Heart Rate',
      'Body Mass',
      'Step Count',
      'Active Energy'
    )
    AND date >= p_from
  GROUP BY metric_name, date_trunc('month', date);
$$;

GRANT EXECUTE ON FUNCTION public.get_health_timeline_monthly(timestamptz)
  TO anon, authenticated, service_role;
