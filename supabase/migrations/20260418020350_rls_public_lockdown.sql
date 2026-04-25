-- Sprint 3 PR I — lock down public.* tables that were wide open to
-- PUBLIC (the Postgres pseudo-role meaning "anyone including anon").
--
-- EDITED 2026-04-23 (drift-1.5): all targets here (public.health_*,
-- public.usage_*, public.trip_*, public.expense_splits, public.user_presence)
-- are ambient. Some have been dropped/moved by later migrations. Wrap each
-- table block in a to_regclass() guard so a fresh DB (Preview Branch /
-- dev local) does not fail.
--
-- Three groups handled here:
--
-- 1. Personal data (health_*, usage_*) — admin-only.
-- 2. Travel / expense sharing (trip_*, expense_splits) — share-token scope.
-- 3. user_presence — kept authenticated-only.

-- ══════════════════════════════════════════════════════════════════
-- Part 1 — public.health_*   (Apple Health data, admin-only)
-- Part 2 — public.usage_*    (AI usage telemetry, admin-only — later dropped)
-- ══════════════════════════════════════════════════════════════════
DO $do$
DECLARE
  spec record;
  -- table | new_policy_name
  specs text[][] := ARRAY[
    ['public.health_metrics',     'health_metrics_admin_read'],
    ['public.health_workouts',    'health_workouts_admin_read'],
    ['public.health_ecg',         'health_ecg_admin_read'],
    ['public.health_medications', 'health_medications_admin_read'],
    ['public.health_ingest_log',  'health_ingest_log_admin_read'],
    ['public.usage_daily',        'usage_daily_admin_read'],
    ['public.usage_daily_models', 'usage_daily_models_admin_read'],
    ['public.usage_by_model',     'usage_by_model_admin_read'],
    ['public.usage_by_provider',  'usage_by_provider_admin_read'],
    ['public.usage_messages',     'usage_messages_admin_read'],
    ['public.usage_summary',      'usage_summary_admin_read']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regclass(specs[i][1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read" ON %s', specs[i][1]);
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (core.fn_is_admin())',
      specs[i][2], specs[i][1]
    );
    EXECUTE format('REVOKE ALL ON %s FROM anon, PUBLIC', specs[i][1]);
    EXECUTE format('GRANT SELECT ON %s TO authenticated', specs[i][1]);
  END LOOP;
END $do$;

-- ══════════════════════════════════════════════════════════════════
-- Part 3 — public.trip_* + expense_splits  (share-token scoping)
-- All ambient and later dropped by 20260423011302.
-- ══════════════════════════════════════════════════════════════════
DO $do$ BEGIN
  IF to_regclass('public.trip_share_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow read on trip_share_tokens"   ON public.trip_share_tokens;
    DROP POLICY IF EXISTS "Allow insert on trip_share_tokens" ON public.trip_share_tokens;
    CREATE POLICY trip_share_tokens_auth_all ON public.trip_share_tokens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY trip_share_tokens_anon_read ON public.trip_share_tokens
      FOR SELECT TO anon USING (true);
  END IF;
END $do$;

DO $do$ BEGIN
  IF to_regclass('public.trip_participants') IS NOT NULL
     AND to_regclass('public.trip_share_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow all on trip_participants" ON public.trip_participants;
    CREATE POLICY trip_participants_auth_all ON public.trip_participants
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY trip_participants_anon_read ON public.trip_participants
      FOR SELECT TO anon
      USING (trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens));
  END IF;
END $do$;

DO $do$ BEGIN
  IF to_regclass('public.trip_expenses') IS NOT NULL
     AND to_regclass('public.trip_share_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow all on trip_expenses" ON public.trip_expenses;
    CREATE POLICY trip_expenses_auth_all ON public.trip_expenses
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY trip_expenses_anon_read ON public.trip_expenses
      FOR SELECT TO anon
      USING (trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens));
  END IF;
END $do$;

DO $do$ BEGIN
  IF to_regclass('public.expense_splits') IS NOT NULL
     AND to_regclass('public.trip_expenses') IS NOT NULL
     AND to_regclass('public.trip_share_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow all on expense_splits" ON public.expense_splits;
    CREATE POLICY expense_splits_auth_all ON public.expense_splits
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY expense_splits_anon_read ON public.expense_splits
      FOR SELECT TO anon
      USING (expense_id IN (
        SELECT id FROM public.trip_expenses
         WHERE trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens)
      ));
  END IF;
END $do$;

-- ══════════════════════════════════════════════════════════════════
-- Part 4 — user_presence  (cosmetic: authenticated-only, explicit)
-- Originally public.user_presence, moved to core.user_presence by
-- 20260423005835_move_profile_user_presence_to_core.sql.
-- ══════════════════════════════════════════════════════════════════
DO $do$ BEGIN
  IF to_regclass('public.user_presence') IS NOT NULL THEN
    DROP POLICY IF EXISTS presence_select_all ON public.user_presence;
    CREATE POLICY user_presence_auth_read ON public.user_presence
      FOR SELECT TO authenticated
      USING ((SELECT auth.role()) = 'authenticated');
  END IF;
END $do$;
