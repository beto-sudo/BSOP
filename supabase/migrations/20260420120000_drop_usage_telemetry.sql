-- ══════════════════════════════════════════════════════════════════
-- Drop OpenClaw usage telemetry tables
-- ══════════════════════════════════════════════════════════════════
-- These tables were populated by scripts/sync-usage-to-supabase.py from
-- local ~/.openclaw transcripts to power /usage and /agents dashboards.
-- The feature is deprecated: dashboards, API routes, data files, and
-- sync scripts have been removed from the repo. These tables are no
-- longer read or written by any surface of the app, so we drop them.
-- ══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.usage_daily_models CASCADE;
DROP TABLE IF EXISTS public.usage_messages     CASCADE;
DROP TABLE IF EXISTS public.usage_by_provider  CASCADE;
DROP TABLE IF EXISTS public.usage_by_model     CASCADE;
DROP TABLE IF EXISTS public.usage_daily        CASCADE;
DROP TABLE IF EXISTS public.usage_summary      CASCADE;
