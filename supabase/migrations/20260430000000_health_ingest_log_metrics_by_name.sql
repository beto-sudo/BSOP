-- Add per-metric_name received/normalized counters to health_ingest_log.
--
-- Why: today the log only stores aggregate counters (metrics_count,
-- workouts_count). When HAE silently changes the shape of a single metric
-- (as it did 2026-04-23 with sleep_analysis), every sample of that metric
-- is dropped by the normalizer but the row still inserts as status=ok with
-- a smaller-than-expected metrics_count. There is no per-name visibility,
-- so the next outage may go unnoticed for days.
--
-- Shape: {"sleep_analysis": {"received": 7, "normalized": 34},
--         "step_count":     {"received": 1234, "normalized": 1234},
--         ...}
--
-- received   = # of samples HAE included for that metric_name
-- normalized = # of records the normalizer produced (can be > received
--              when one sample expands into multiple stages, e.g.
--              aggregated sleep_analysis → 5 stage records).
--
-- Diagnostic rule: `received > 0 AND normalized = 0` for any metric_name
-- pins a silent-drop bug → either HAE changed shape or the normalizer
-- regressed.
--
-- Note: the writable surface for the ingest endpoint is
-- public.health_ingest_log, which is a SELECT-only-style auto-updatable
-- view over the real table health.health_ingest_log. Postgres propagates
-- INSERTs through the view, so we ALTER the base table and CREATE OR
-- REPLACE the view to expose the new column. PostgREST is reloaded at the
-- end so supabase-js sees the updated shape immediately.

ALTER TABLE health.health_ingest_log
  ADD COLUMN IF NOT EXISTS metrics_by_name jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN health.health_ingest_log.metrics_by_name IS
  'Per-metric_name received/normalized counters. Empty object {} for rows ingested before 2026-04-30.';

CREATE OR REPLACE VIEW public.health_ingest_log AS
SELECT
  id,
  received_at,
  payload_size_bytes,
  metrics_count,
  workouts_count,
  source_ip,
  status,
  metrics_by_name
FROM health.health_ingest_log;

NOTIFY pgrst, 'reload schema';
