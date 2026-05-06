-- ════════════════════════════════════════════════════════════════════
-- Fix: cron playtomic-sync-job recibe HTTP 401 desde 2026-05-04 15:09 UTC
-- ════════════════════════════════════════════════════════════════════
--
-- Causa raíz:
--   PR #405 redeployó la edge function `playtomic-sync` con la config
--   actual de `supabase/config.toml` (`verify_jwt = true`). Antes de ese
--   deploy la función estaba expuesta sin verificación JWT (config viejo
--   del primer deploy). Desde el redeploy, todo invocador sin header
--   `Authorization: Bearer <jwt>` recibe 401.
--
--   El cron `playtomic-sync-job` (programado por
--   20260410130000_playtomic_cron.sql) llamaba `net.http_post` SIN
--   Authorization. Entonces el HTTP responde 401, la función nunca corre,
--   `playtomic.sync_log` no recibe entries nuevas, y el dashboard de
--   /rdb/playtomic se quedó stale.
--
-- Diagnóstico rápido:
--   - `cron.job_run_details` muestra status=succeeded cada 30 min, pero
--     eso solo dice que el SQL `SELECT net.http_post(...)` corrió OK.
--   - `net._http_response` muestra `status_code=401` en cada llamada
--     desde el deploy (TTL de la tabla limpia las anteriores 200).
--
-- Fix:
--   Reschedule del cron incluyendo `Authorization: Bearer <anon_key>`
--   en el header. El JWT anon key es un JWT firmado con el secret del
--   proyecto Supabase, suficiente para pasar `verify_jwt = true`. La
--   edge function internamente usa service_role para escribir en
--   `playtomic.bookings` (bypassa RLS), independiente del JWT con que
--   se invoca.
--
-- Manejo del secret:
--   El anon key NO se hardcodea en esta migración (regla del repo: cero
--   secrets en archivos commiteados, aunque éste sea público en cliente).
--   Lo leemos en runtime de `vault.decrypted_secrets` con name
--   `playtomic_cron_jwt`. Beto insertó la entrada manualmente desde el
--   Dashboard de Supabase (Project Settings → Vault) antes de aplicar
--   esta migración.
--
-- Si el secret rota:
--   Cuando Beto rote el JWT secret del proyecto Supabase, el anon key
--   cambia. Acción: actualizar el valor del secret `playtomic_cron_jwt`
--   en el Dashboard de Vault. El cron lo recoge en la siguiente
--   ejecución (lee `vault.decrypted_secrets` cada vez).
--
-- Reversibilidad: total. Para revertir, aplicar de nuevo la versión sin
-- header del cron (la del archivo 20260410130000_playtomic_cron.sql).

DO $do$
DECLARE
  v_secret_id uuid;
BEGIN
  -- Skip silencioso en Preview Branches (no tienen pg_cron / pg_net /
  -- vault, idéntico al patrón ya establecido en migraciones del cron).
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed (Preview Branch?); skipping cron reschedule.';
    RETURN;
  END IF;

  -- Defensa-en-profundidad: si el secret no existe, abortar con mensaje
  -- claro en vez de programar un cron que va a fallar silenciosamente
  -- la próxima vez que corra.
  SELECT id INTO v_secret_id
  FROM vault.decrypted_secrets
  WHERE name = 'playtomic_cron_jwt'
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION
      'Vault secret `playtomic_cron_jwt` no existe. Antes de aplicar esta '
      'migración, crear la entrada en Supabase Dashboard → Vault con el '
      'JWT anon key del proyecto. Ver comentario en este archivo.';
  END IF;

  -- pg_net debería ya estar (lo crea 20260410130000_playtomic_cron.sql).
  -- Idempotente por si acaso.
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  -- Reschedule. unschedule previo es idempotente.
  --
  -- timeout_milliseconds=30000: el default de pg_net es 5s y el sync de
  -- Playtomic tarda ~9s (lookback de 60d + 14d, ~1100 bookings por
  -- corrida). Sin este timeout extendido, pg_net cierra la conexión
  -- antes de que la edge function responda — el sync funcionaba pero
  -- `net._http_response` quedaba con `error_msg='Timeout of 5000 ms'`.
  -- 30s da headroom amplio.
  PERFORM cron.unschedule('playtomic-sync-job');
  PERFORM cron.schedule(
    'playtomic-sync-job',
    '*/30 * * * *',
    $sql$
      SELECT net.http_post(
          url:='https://ybklderteyhuugzfmxbi.supabase.co/functions/v1/playtomic-sync',
          headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'playtomic_cron_jwt'
              LIMIT 1
            )
          ),
          timeout_milliseconds:=30000
      );
    $sql$
  );

  RAISE NOTICE 'Cron playtomic-sync-job reprogramado con Authorization header desde vault.';
END $do$;
