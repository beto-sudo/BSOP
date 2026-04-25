-- Sprint 4C — InitPlan wrap on rdb.waitry_* SELECT policies.
--
-- Problem
-- -------
-- rdb.v_cortes_lista (the data backing /cortes UI, see
-- components/cortes/cortes-view.tsx → components/cortes/data.ts) was
-- timing out for non-admin RDB members. Reproduced 2026-04-24 via
-- EXPLAIN ANALYZE on date 2026-04-22 (3 cortes), 300-row LIMIT, same
-- predicates as the client:
--
--                       Beto (admin)   Laisha (viewer)   ratio
--   Execution time      782 ms         2157 ms           2.76×
--   Buffers shared hit  77 457         143 615           1.85×
--
-- pg_stat_statements over 116 calls of the same query: mean 2416 ms,
-- max 7926 ms — i.e. the slow tail clips PostgREST's 8s
-- statement_timeout for `authenticated`, which is exactly the error
-- Laisha sees ("canceling statement due to statement timeout").
--
-- Root cause
-- ----------
-- The SELECT policies on rdb.waitry_pedidos / _pagos / _productos /
-- _inbound (created in 20260417232000_rls_rdb_playtomic_cleanup.sql)
-- read:
--
--   USING (core.fn_is_admin()
--          OR core.fn_has_empresa('e52ac307-…'::uuid))
--
-- Both helpers are STABLE SECURITY DEFINER (defined in
-- 20260417220000_core_rls_helpers.sql) but Postgres still emits each
-- call as a per-row Filter expression. Cost asymmetry across roles:
--
--   admin:    fn_is_admin() = TRUE → OR short-circuits cheaply
--   viewer:   fn_is_admin() = FALSE → falls through to fn_has_empresa,
--             which JOINs core.usuarios × core.usuarios_empresas every
--             time it is invoked.
--
-- The plan walks ~11 K rows of waitry_pedidos via Seq Scan plus a
-- 444-loop nested loop pedidos × pagos. The doubling of `Buffers
-- shared hit` for non-admins (143 615 vs 77 457) confirms per-row
-- helper evaluation; the 643 ms vs 210 ms split on the Seq Scan node
-- comes from the same cause.
--
-- Fix
-- ---
-- Same idiom as 20260418000100_db_perf_surgical.sql §2, which wrapped
-- auth.uid() / auth.email() in (SELECT …): wrap each helper call in a
-- scalar subquery so the planner lifts it to an InitPlan and evaluates
-- the boolean once per query, then treats it as a constant filter.
-- The predicate is logically identical; only the plan shape changes.
-- No grant, no schema, no helper-body change.
--
-- Why constant-arg helpers only
-- ------------------------------
-- This wrap works because both helpers here take a constant or no
-- argument. The erp.cortes_caja / erp.movimientos_caja policies use
-- `core.fn_has_empresa(empresa_id)` (column argument) and are NOT
-- touched by this migration — a column-arg call cannot be lifted to
-- an InitPlan, and per the same plan those scans cost ~40 ms total,
-- not the bottleneck. Moving them is a separate, non-trivial fix
-- (e.g. rewriting as `empresa_id IN (SELECT … FROM
-- core.usuarios_empresas)`) and out of scope for this surgical patch.
--
-- Scope (what changes / does not change)
-- --------------------------------------
--   * Touched : SELECT policies on the 4 rdb.waitry_* tables.
--   * Untouched: INSERT / UPDATE / DELETE policies, helper bodies,
--     erp.* policies, every view, every grant, every index.
--
-- Verification
-- ------------
-- Re-run EXPLAIN as Laisha (jwt claims set in tx, see investigation
-- log). Expected: each waitry_* Filter shows an `InitPlan`/`SubPlan`
-- node feeding a constant boolean rather than a per-row function call,
-- and execution time drops to roughly Beto's level (≈ 800 ms). The
-- pg_stat_statements mean for v_cortes_lista should drop accordingly
-- once the cache rotates.
--
-- Rollback
-- --------
-- Single-step: re-run the same DO block with the unwrapped predicate
-- (or simply re-apply 20260417232000 Part 2). Both forms produce the
-- same authorization decision; the rollback would only restore the
-- slow plan shape.

DO $do$
DECLARE
  rdb_uuid constant text := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
  tbl text;
  tables text[] := ARRAY[
    'waitry_pedidos',
    'waitry_pagos',
    'waitry_productos',
    'waitry_inbound'
  ];
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Fresh-DB safety: the rdb.waitry_* tables are ambient and may not
    -- exist in a Preview Branch / DR rebuild. Same guard pattern used
    -- in 20260417232000.
    IF to_regclass('rdb.'||tbl) IS NULL THEN CONTINUE; END IF;

    policy_name := tbl || '_select';

    EXECUTE format('DROP POLICY IF EXISTS %I ON rdb.%I', policy_name, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON rdb.%I FOR SELECT TO authenticated '
      'USING ((SELECT core.fn_is_admin()) '
            'OR (SELECT core.fn_has_empresa(%L::uuid)))',
      policy_name, tbl, rdb_uuid
    );
  END LOOP;
END $do$;
