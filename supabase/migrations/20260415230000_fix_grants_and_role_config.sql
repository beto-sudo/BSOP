-- ============================================================
-- Fix: Restore grants and clean role configs after schema cleanup
-- 
-- The DROP ... CASCADE in previous migrations inadvertently removed
-- grants from Supabase API roles, and stale pgrst.db_schema entries
-- in role configs caused PostgREST PGRST002 crash loop.
-- ============================================================

-- 1. Schema USAGE grants
GRANT USAGE ON SCHEMA core TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA erp TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA rdb TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA playtomic TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, authenticator;

-- 2. Table/view grants
GRANT SELECT ON ALL TABLES IN SCHEMA core TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA erp TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA rdb TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA playtomic TO anon, authenticated, service_role, authenticator;

GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA erp TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rdb TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA playtomic TO authenticated, service_role;

-- 3. Function grants
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA erp TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rdb TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Sequence grants
GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA erp TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA rdb TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 5. Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rdb GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rdb GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- 6. Clean stale role configs (pgrst.db_schema pointing to dropped schemas)
ALTER ROLE anon RESET "pgrst.db_schema";
ALTER ROLE authenticated RESET "pgrst.db_schema";
ALTER ROLE authenticator RESET "pgrst.db_schema";
ALTER ROLE authenticator RESET "pgrst.db_schemas";

-- 7. Fix search_path for API roles
ALTER ROLE anon SET search_path = 'public, extensions';
ALTER ROLE authenticated SET search_path = 'public, extensions';
ALTER ROLE service_role SET search_path = 'public, extensions';
ALTER ROLE authenticator SET search_path = 'public, extensions';

-- 8. Fix statement_timeout for authenticator (must be integer-castable for PostgREST)
ALTER ROLE authenticator SET statement_timeout = '120000';
ALTER ROLE authenticator SET lock_timeout = '8s';

-- 9. Reload PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
