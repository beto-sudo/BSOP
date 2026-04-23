-- EDITED 2026-04-23 (drift-1.5): pg_cron / pg_net no están disponibles en
-- Supabase Preview Branches (sólo viven en el proyecto principal). Skip
-- silencioso cuando los schemas no existen — los crons reales sólo importan
-- en prod. Lo correcto en branch es no programar nada.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed (Preview Branch?); skipping playtomic-sync-job schedule.';
    RETURN;
  END IF;

  -- Create pg_net if it doesn't exist (only attempt when running where pg_cron lives)
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  -- Unschedule just in case it already exists
  PERFORM cron.unschedule('playtomic-sync-job');

  -- Schedule the job to run every 30 minutes
  PERFORM cron.schedule(
    'playtomic-sync-job',
    '*/30 * * * *',
    $sql$
      SELECT net.http_post(
          url:='https://ybklderteyhuugzfmxbi.supabase.co/functions/v1/playtomic-sync',
          headers:='{"Content-Type": "application/json"}'::jsonb
      );
    $sql$
  );
END $do$;
