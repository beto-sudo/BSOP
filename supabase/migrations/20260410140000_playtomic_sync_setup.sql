-- 1. Add family_member_id to booking_participants
ALTER TABLE playtomic.booking_participants ADD COLUMN IF NOT EXISTS family_member_id TEXT;

-- 2. Create pg_net if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Schedule the sync job (every 30 minutes)
-- We use the full URL of the edge function. 
-- Since we deployed with --no-verify-jwt, we don't need the Authorization header.
SELECT cron.unschedule('playtomic-sync-job');
SELECT cron.schedule(
  'playtomic-sync-job',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
        url:='https://ybklderteyhuugzfmxbi.supabase.co/functions/v1/playtomic-sync',
        headers:='{"Content-Type": "application/json"}'::jsonb
    );
  $$
);

NOTIFY pgrst, 'reload schema';
