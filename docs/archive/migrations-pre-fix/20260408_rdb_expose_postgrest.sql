-- ============================================================
-- MIGRATION: Expose rdb schema via PostgREST
-- Project: BSOP Supabase
-- Date: 2026-04-08
-- Purpose: Grant anon and authenticated roles usage on rdb
--          so PostgREST can expose it via the REST API.
--
-- IMPORTANT: After running this migration, also add "rdb" to
--   the Extra API Schemas list in the Supabase Dashboard:
--   Settings → API → Extra API Schemas → add "rdb"
--   (or set db_schema in supabase/config.toml for local dev)
-- ============================================================

GRANT USAGE ON SCHEMA rdb TO anon, authenticated;

-- Grant SELECT on all existing tables/views in rdb
GRANT SELECT ON ALL TABLES IN SCHEMA rdb TO anon, authenticated;

-- Grant INSERT/UPDATE/DELETE only to authenticated (for write operations)
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rdb TO authenticated;

-- Ensure future tables/views also inherit these grants
ALTER DEFAULT PRIVILEGES IN SCHEMA rdb
  GRANT SELECT ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA rdb
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
