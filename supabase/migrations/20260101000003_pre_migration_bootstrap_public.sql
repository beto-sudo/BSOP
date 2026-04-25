-- ════════════════════════════════════════════════════════════════════════════
-- PRE-MIGRATION BOOTSTRAP — public.profile / public.user_presence
-- (drift-1.5, 2026-04-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Continuación de los bootstraps previos. Estas dos tablas eran ambient en
-- public — después fueron movidas a core.* por
-- 20260423005835_move_profile_user_presence_to_core.sql.
-- En PROD ya son views compat (no tablas), así que CREATE TABLE IF NOT EXISTS
-- es no-op (Postgres NOTICE: relation already exists, skipping).
-- En PREVIEW BRANCH crea las tablas para que la migration de move funcione.

CREATE TABLE IF NOT EXISTS public.profile (
  id          uuid PRIMARY KEY,
  email       text NOT NULL DEFAULT '',
  first_name  text DEFAULT '',
  last_name   text DEFAULT '',
  avatar_url  text,
  locale      text DEFAULT 'es-MX',
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id         uuid PRIMARY KEY,
  email           text NOT NULL,
  display_name    text,
  avatar_url      text,
  current_path    text NOT NULL DEFAULT '/',
  current_module  text NOT NULL DEFAULT 'Overview',
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
