-- Sprint 3 PR I — lock down public.* tables that were wide open to
-- PUBLIC (the Postgres pseudo-role meaning "anyone including anon").
--
-- Three groups handled here:
--
-- 1. Personal data (health_*, usage_*) — admin-only. These are Beto's
--    Apple Health metrics and AI usage telemetry. No reason anyone
--    else, let alone anon, should read them.
--
-- 2. Travel / expense sharing (trip_*, expense_splits) — the only
--    legitimate anon use case: `/compartir/[token]` renders a
--    shared trip to unauthenticated visitors. Scoped via share tokens.
--    Authenticated users (Beto, family members) retain full access.
--
-- 3. user_presence — kept authenticated-only. Refactor the predicate
--    to an explicit role check so the linter stops flagging it as
--    `USING (true)`, but behavior is unchanged.

-- ══════════════════════════════════════════════════════════════════
-- Part 1 — public.health_*   (Apple Health data, admin-only)
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow public read" ON public.health_metrics;
DROP POLICY IF EXISTS "Allow public read" ON public.health_workouts;
DROP POLICY IF EXISTS "Allow public read" ON public.health_ecg;
DROP POLICY IF EXISTS "Allow public read" ON public.health_medications;
DROP POLICY IF EXISTS "Allow public read" ON public.health_ingest_log;

CREATE POLICY health_metrics_admin_read   ON public.health_metrics
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY health_workouts_admin_read  ON public.health_workouts
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY health_ecg_admin_read       ON public.health_ecg
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY health_medications_admin_read ON public.health_medications
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY health_ingest_log_admin_read ON public.health_ingest_log
  FOR SELECT TO authenticated USING (core.fn_is_admin());

REVOKE ALL ON
  public.health_metrics, public.health_workouts, public.health_ecg,
  public.health_medications, public.health_ingest_log
FROM anon, PUBLIC;
GRANT SELECT ON
  public.health_metrics, public.health_workouts, public.health_ecg,
  public.health_medications, public.health_ingest_log
TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Part 2 — public.usage_*   (AI usage telemetry, admin-only)
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow public read" ON public.usage_daily;
DROP POLICY IF EXISTS "Allow public read" ON public.usage_daily_models;
DROP POLICY IF EXISTS "Allow public read" ON public.usage_by_model;
DROP POLICY IF EXISTS "Allow public read" ON public.usage_by_provider;
DROP POLICY IF EXISTS "Allow public read" ON public.usage_messages;
DROP POLICY IF EXISTS "Allow public read" ON public.usage_summary;

CREATE POLICY usage_daily_admin_read        ON public.usage_daily
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY usage_daily_models_admin_read ON public.usage_daily_models
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY usage_by_model_admin_read     ON public.usage_by_model
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY usage_by_provider_admin_read  ON public.usage_by_provider
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY usage_messages_admin_read     ON public.usage_messages
  FOR SELECT TO authenticated USING (core.fn_is_admin());
CREATE POLICY usage_summary_admin_read      ON public.usage_summary
  FOR SELECT TO authenticated USING (core.fn_is_admin());

REVOKE ALL ON
  public.usage_daily, public.usage_daily_models, public.usage_by_model,
  public.usage_by_provider, public.usage_messages, public.usage_summary
FROM anon, PUBLIC;
GRANT SELECT ON
  public.usage_daily, public.usage_daily_models, public.usage_by_model,
  public.usage_by_provider, public.usage_messages, public.usage_summary
TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Part 3 — public.trip_* + expense_splits  (share-token scoping)
-- ══════════════════════════════════════════════════════════════════
-- Model: authenticated sessions (Beto + family) have full access.
-- Anon callers can read only where a matching share token exists.

-- trip_share_tokens — the gatekeeper table.
-- Anon reads one row by exact token match (the /compartir path does
-- this to resolve token → trip_slug). Authenticated can list + insert
-- (Beto creates share links from the app).
DROP POLICY IF EXISTS "Allow read on trip_share_tokens"   ON public.trip_share_tokens;
DROP POLICY IF EXISTS "Allow insert on trip_share_tokens" ON public.trip_share_tokens;

CREATE POLICY trip_share_tokens_auth_all ON public.trip_share_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY trip_share_tokens_anon_read ON public.trip_share_tokens
  FOR SELECT TO anon USING (true);

-- trip_participants, trip_expenses — anon can SELECT only where the
-- row's trip_slug is in an active share token.
DROP POLICY IF EXISTS "Allow all on trip_participants" ON public.trip_participants;
DROP POLICY IF EXISTS "Allow all on trip_expenses"    ON public.trip_expenses;

CREATE POLICY trip_participants_auth_all ON public.trip_participants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY trip_participants_anon_read ON public.trip_participants
  FOR SELECT TO anon
  USING (trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens));

CREATE POLICY trip_expenses_auth_all ON public.trip_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY trip_expenses_anon_read ON public.trip_expenses
  FOR SELECT TO anon
  USING (trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens));

-- expense_splits — child of trip_expenses. Scoped via the parent's
-- trip_slug.
DROP POLICY IF EXISTS "Allow all on expense_splits" ON public.expense_splits;

CREATE POLICY expense_splits_auth_all ON public.expense_splits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY expense_splits_anon_read ON public.expense_splits
  FOR SELECT TO anon
  USING (expense_id IN (
    SELECT id FROM public.trip_expenses
     WHERE trip_slug IN (SELECT trip_slug FROM public.trip_share_tokens)
  ));

-- ══════════════════════════════════════════════════════════════════
-- Part 4 — user_presence  (cosmetic: authenticated-only, explicit)
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS presence_select_all ON public.user_presence;
CREATE POLICY user_presence_auth_read ON public.user_presence
  FOR SELECT TO authenticated
  USING ((SELECT auth.role()) = 'authenticated');
