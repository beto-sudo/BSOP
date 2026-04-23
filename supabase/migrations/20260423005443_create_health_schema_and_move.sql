-- Sprint drift-1 · Mig 2 de 6
-- Aisla las tablas de Apple Health en su propio schema (`health`) y deja
-- un compat layer de vistas insertables en `public` para que el ingest
-- (POST /api/health/ingest, que pega PostgREST via supabase-js) siga
-- funcionando sin cambios de código. Shims vigentes hasta 2026-05-06.

-- ── Schema ──────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS health AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA health TO authenticated, service_role, anon, authenticator;

-- ── Move tables ─────────────────────────────────────────────────────
ALTER TABLE public.health_metrics     SET SCHEMA health;
ALTER TABLE public.health_workouts    SET SCHEMA health;
ALTER TABLE public.health_ecg         SET SCHEMA health;
ALTER TABLE public.health_medications SET SCHEMA health;
ALTER TABLE public.health_ingest_log  SET SCHEMA health;

-- Grants en las tablas movidas (authenticator SELECT, authenticated/service_role/postgres full)
GRANT SELECT                         ON ALL TABLES IN SCHEMA health TO authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA health TO authenticated, service_role;

-- ── Update RPC functions to target health.* directly ────────────────
-- Las funciones son SECURITY DEFINER y las llama lib/health.ts vía supabase.rpc(...).
-- Se mantienen en public (el cliente llama sin prefix) pero el body apunta a health.*
-- para no depender de los compat shims.

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
SET search_path = pg_catalog, public, health
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
  FROM health.health_workouts w
  CROSS JOIN zones z
  LEFT JOIN health.health_metrics m
    ON m.metric_name = 'Heart Rate'
   AND m.date >= w.start_time
   AND m.date <= COALESCE(w.end_time, w.start_time + interval '3 hours')
  WHERE w.start_time >= p_from
    AND w.start_time <= p_to
  GROUP BY w.id, w.name, w.start_time, w.end_time, w.duration_minutes, w.distance_km, w.energy_kcal;
$$;

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
SET search_path = pg_catalog, public, health
AS $$
  SELECT
    metric_name,
    date_trunc('month', date)::date AS month_start,
    AVG(value)::numeric AS avg_value,
    COUNT(*)::int AS sample_count
  FROM health.health_metrics
  WHERE metric_name IN (
      'Resting Heart Rate',
      'Body Mass',
      'Step Count',
      'Active Energy'
    )
    AND date >= p_from
  GROUP BY metric_name, date_trunc('month', date);
$$;

CREATE OR REPLACE FUNCTION public.get_latest_health_metrics(p_names text[])
RETURNS TABLE (
  id bigint,
  metric_name text,
  date timestamptz,
  value real,
  unit text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, health
AS $$
  SELECT DISTINCT ON (m.metric_name)
    m.id, m.metric_name, m.date, m.value, m.unit, m.source
  FROM health.health_metrics m
  WHERE m.metric_name = ANY(p_names)
  ORDER BY m.metric_name, m.date DESC;
$$;

-- ── Compat views en public (SHIMS — drop 2026-05-06) ────────────────
-- Vistas simples (SELECT *) con security_invoker=on son auto-updatable
-- en Postgres: INSERT/UPDATE/DELETE/UPSERT se traducen a la tabla base.
-- Eso permite que /api/health/ingest siga haciendo .from('health_metrics').upsert(...)
-- sin cambios de código. Al dropear las vistas, migrar el cliente a supabase.schema('health').from(...).

CREATE OR REPLACE VIEW public.health_metrics
  WITH (security_invoker = on)
  AS SELECT * FROM health.health_metrics;
COMMENT ON VIEW public.health_metrics IS
  'TEMPORAL SHIM — drop on 2026-05-06 after /api/health/ingest migrates to supabase.schema(''health'').';

CREATE OR REPLACE VIEW public.health_workouts
  WITH (security_invoker = on)
  AS SELECT * FROM health.health_workouts;
COMMENT ON VIEW public.health_workouts IS
  'TEMPORAL SHIM — drop on 2026-05-06 after /api/health/ingest migrates to supabase.schema(''health'').';

CREATE OR REPLACE VIEW public.health_ecg
  WITH (security_invoker = on)
  AS SELECT * FROM health.health_ecg;
COMMENT ON VIEW public.health_ecg IS
  'TEMPORAL SHIM — drop on 2026-05-06 after /api/health/ingest migrates to supabase.schema(''health'').';

CREATE OR REPLACE VIEW public.health_medications
  WITH (security_invoker = on)
  AS SELECT * FROM health.health_medications;
COMMENT ON VIEW public.health_medications IS
  'TEMPORAL SHIM — drop on 2026-05-06 after /api/health/ingest migrates to supabase.schema(''health'').';

CREATE OR REPLACE VIEW public.health_ingest_log
  WITH (security_invoker = on)
  AS SELECT * FROM health.health_ingest_log;
COMMENT ON VIEW public.health_ingest_log IS
  'TEMPORAL SHIM — drop on 2026-05-06 after /api/health/ingest migrates to supabase.schema(''health'').';

-- Grants en las compat views (réplica de lo que tenían las tablas en public)
GRANT SELECT                         ON public.health_metrics, public.health_workouts,
                                        public.health_ecg, public.health_medications,
                                        public.health_ingest_log
                                     TO authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_metrics, public.health_workouts,
                                        public.health_ecg, public.health_medications,
                                        public.health_ingest_log
                                     TO authenticated, service_role;
