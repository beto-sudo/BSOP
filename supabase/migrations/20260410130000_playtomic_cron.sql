-- Create pg_net if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Unschedule just in case it already exists
SELECT cron.unschedule('playtomic-sync-job');

-- Schedule the job to run every 30 minutes
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
