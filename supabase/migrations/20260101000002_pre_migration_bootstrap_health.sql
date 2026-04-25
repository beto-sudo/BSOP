-- ════════════════════════════════════════════════════════════════════════════
-- PRE-MIGRATION BOOTSTRAP — health_* (drift-1.5, 2026-04-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Continuación de 20260101000001_pre_migration_bootstrap.sql. Este archivo
-- existe como migración separada porque el primero ya estaba marcado como
-- aplicado en el Preview Branch antes de incluir las health_* — Supabase
-- tracker no re-aplica versiones existentes, así que necesitamos un nuevo
-- timestamp para que el bootstrap restante corra en branches existentes.
--
-- Las public.health_* originalmente vivían en public (creadas via
-- supabase/health-schema.sql corrido a mano). Después se mueven al schema
-- `health` por 20260423005443, dejando views compat en public.
--
-- En PRODUCCIÓN — donde public.health_* ya son VIEWS — los CREATE TABLE
-- IF NOT EXISTS son no-op (Postgres considera la view existente, NOTICE).
-- En PREVIEW BRANCH crea las tablas que después serán movidas a health.

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id           bigserial PRIMARY KEY,
  metric_name  text NOT NULL,
  date         timestamptz NOT NULL,
  value        real NOT NULL,
  unit         text,
  source       text,
  ingested_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_metrics_upsert ON public.health_metrics (metric_name, date, source);

CREATE TABLE IF NOT EXISTS public.health_workouts (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz,
  duration_minutes real,
  distance_km      real,
  energy_kcal      real,
  heart_rate_avg   real,
  heart_rate_max   real,
  source           text,
  raw_json         jsonb,
  ingested_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_workouts_upsert ON public.health_workouts (name, start_time, source);

CREATE TABLE IF NOT EXISTS public.health_ecg (
  id              bigserial PRIMARY KEY,
  date            timestamptz NOT NULL,
  classification  text,
  heart_rate      real,
  raw_json        jsonb,
  ingested_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_medications (
  id           bigserial PRIMARY KEY,
  date         timestamptz NOT NULL,
  name         text,
  dose         text,
  raw_json     jsonb,
  ingested_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_ingest_log (
  id                  bigserial PRIMARY KEY,
  received_at         timestamptz DEFAULT now(),
  payload_size_bytes  integer,
  metrics_count       integer DEFAULT 0,
  workouts_count      integer DEFAULT 0,
  source_ip           text,
  status              text DEFAULT 'ok'
);

NOTIFY pgrst, 'reload schema';
