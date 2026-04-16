-- Recreate empty shared schema so PostgREST can load its cache
-- The schema was dropped but may still be listed in API exposed schemas
CREATE SCHEMA IF NOT EXISTS shared;
GRANT USAGE ON SCHEMA shared TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
