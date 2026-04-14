-- Ensure service_role can manage documentos for scripted imports/backfills.

GRANT USAGE ON SCHEMA core TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.documentos TO service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
