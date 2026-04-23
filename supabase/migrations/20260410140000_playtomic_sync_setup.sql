-- EDITED 2026-04-23 (drift-1.5): pg_cron / pg_net no están en Preview Branches.
-- Skip cron setup cuando el schema no existe; el ALTER TABLE sí es seguro.

-- 1. Add family_member_id to booking_participants
ALTER TABLE playtomic.booking_participants ADD COLUMN IF NOT EXISTS family_member_id TEXT;

-- 2-3. Schedule the sync job — only on environments where pg_cron lives.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed (Preview Branch?); skipping playtomic-sync-job schedule.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  PERFORM cron.unschedule('playtomic-sync-job');
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

NOTIFY pgrst, 'reload schema';
