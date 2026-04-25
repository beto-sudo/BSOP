-- Sprint 3 PR C+D combined — scope every authenticated RLS policy on
-- the 51 erp.* tables to the caller's empresa membership (or admin).
--
-- Why they travel together
-- ------------------------
-- SELECT scoping and write scoping share the exact same risk profile:
-- if `core.fn_has_empresa` / `fn_is_admin` misbehaves, both reads and
-- writes break the same way at the same time. Separating them into two
-- PRs would just double the merge risk for zero review benefit —
-- reviewers would have to reason about the helper twice.
--
-- Pattern applied to every erp.<t>:
--   erp_<t>_select — FOR SELECT TO authenticated
--     USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--   erp_<t>_insert — FOR INSERT TO authenticated
--     WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--   erp_<t>_update — FOR UPDATE TO authenticated
--     USING  (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--     WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--   erp_<t>_delete — FOR DELETE TO authenticated
--     USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--
-- Safety
-- ------
--   * Every erp.* table has an `empresa_id` column (verified with an
--     information_schema query before writing this migration).
--   * `core.fn_has_empresa` / `fn_is_admin` are STABLE; Postgres caches
--     the result per statement so a SELECT over 10 K rows doesn't
--     re-evaluate auth.jwt() per row.
--   * Edge functions (waitry-webhook, sync-cortes) hit the DB with
--     SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely — this
--     migration cannot break the webhook / cron path.
--   * All current active users have rows in core.usuarios_empresas
--     (verified). Admins (Beto, Adalberto.ss) bypass via fn_is_admin.
--     Viewers see their own empresas' data; that matches the intended
--     UX. No cross-empresa reads exist in the app.
--
-- Rollback
-- --------
-- If something breaks, the fastest restore is a single DO block that
-- recreates the pre-migration `USING (true)` policies — documented at
-- the bottom of this file.

DO $$
DECLARE r record;
BEGIN
  -- 1. Drop every existing authenticated policy on every erp table.
  --    Names vary (erp_<t>_{select,insert,update,delete},
  --    task_updates_authenticated, etc.) so we discover them dynamically.
  FOR r IN
    SELECT c.relname AS tbl, p.polname AS pname
      FROM pg_policy p
      JOIN pg_class c    ON c.oid  = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'erp'
       AND 'authenticated' = ANY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON erp.%I;', r.pname, r.tbl);
  END LOOP;

  -- 2. Recreate the uniform empresa-scoped 4-policy set on every erp
  --    base table.
  FOR r IN
    SELECT tablename AS tbl FROM pg_tables WHERE schemaname = 'erp'
  LOOP
    EXECUTE format(
      'CREATE POLICY erp_%I_select ON erp.%I '
      'FOR SELECT TO authenticated '
      'USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());',
      r.tbl, r.tbl
    );
    EXECUTE format(
      'CREATE POLICY erp_%I_insert ON erp.%I '
      'FOR INSERT TO authenticated '
      'WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());',
      r.tbl, r.tbl
    );
    EXECUTE format(
      'CREATE POLICY erp_%I_update ON erp.%I '
      'FOR UPDATE TO authenticated '
      'USING  (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()) '
      'WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());',
      r.tbl, r.tbl
    );
    EXECUTE format(
      'CREATE POLICY erp_%I_delete ON erp.%I '
      'FOR DELETE TO authenticated '
      'USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());',
      r.tbl, r.tbl
    );
  END LOOP;
END $$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ Rollback — only if an unexpected regression surfaces in prod.    ║
-- ║ Run the exact block below as a migration, swapping the policy    ║
-- ║ predicates back to USING (true) / WITH CHECK (true):             ║
-- ║                                                                   ║
-- ║ DO $$ DECLARE r record;                                           ║
-- ║ BEGIN                                                             ║
-- ║   FOR r IN SELECT tablename AS tbl FROM pg_tables                 ║
-- ║            WHERE schemaname = 'erp'                               ║
-- ║   LOOP                                                            ║
-- ║     EXECUTE format('DROP POLICY IF EXISTS erp_%I_select ON erp.%I;', r.tbl, r.tbl); ║
-- ║     EXECUTE format('DROP POLICY IF EXISTS erp_%I_insert ON erp.%I;', r.tbl, r.tbl); ║
-- ║     EXECUTE format('DROP POLICY IF EXISTS erp_%I_update ON erp.%I;', r.tbl, r.tbl); ║
-- ║     EXECUTE format('DROP POLICY IF EXISTS erp_%I_delete ON erp.%I;', r.tbl, r.tbl); ║
-- ║     EXECUTE format('CREATE POLICY erp_%I_select ON erp.%I FOR SELECT TO authenticated USING (true);', r.tbl, r.tbl); ║
-- ║     EXECUTE format('CREATE POLICY erp_%I_insert ON erp.%I FOR INSERT TO authenticated WITH CHECK (true);', r.tbl, r.tbl); ║
-- ║     EXECUTE format('CREATE POLICY erp_%I_update ON erp.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', r.tbl, r.tbl); ║
-- ║     EXECUTE format('CREATE POLICY erp_%I_delete ON erp.%I FOR DELETE TO authenticated USING (true);', r.tbl, r.tbl); ║
-- ║   END LOOP;                                                       ║
-- ║ END $$;                                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
