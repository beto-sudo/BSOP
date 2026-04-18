-- Sprint 4B — Surgical DB performance fixes
-- Ref: docs/AUDIT_SUPABASE_2026-04-17.md §3.2
--
-- Three independent, low-risk fixes bundled into one migration:
--   1. Drop 3 duplicate indexes flagged by the advisor (duplicate_index).
--   2. Wrap auth.uid() / auth.email() / auth.role() calls in RLS policies
--      so the planner evaluates them once per query, not per row
--      (auth_rls_initplan — 8 warnings).
--   3. Consolidate 2 tables where a FOR ALL policy overlaps with a
--      FOR SELECT policy producing the same predicate, by narrowing
--      the FOR ALL policy to write-only (multiple_permissive_policies).
--
-- Advisor before: duplicate_index=3, auth_rls_initplan=8,
--                 multiple_permissive_policies=2
-- Advisor after : all three should drop to 0.


-- ════════════════════════════════════════════════════════════════════
-- Section 1 — Drop duplicate indexes
-- ════════════════════════════════════════════════════════════════════
-- For each pair, keep the canonical name (table-matching, shorter) and
-- drop the legacy / double-prefixed sibling.

-- erp.corte_conteo_denominaciones:
--   keep erp_corte_conteo_corte_id_idx (matches table name)
--   drop erp_conteo_corte_id_idx       (older, ambiguous name)
DROP INDEX IF EXISTS erp.erp_conteo_corte_id_idx;

-- rdb.waitry_pagos:
--   keep waitry_pagos_order_id_idx
--   drop rdb_waitry_pagos_order_id_idx (redundant schema prefix)
DROP INDEX IF EXISTS rdb.rdb_waitry_pagos_order_id_idx;

-- rdb.waitry_pedidos:
--   keep waitry_pedidos_order_id_idx
--   drop rdb_waitry_pedidos_order_id_idx (redundant schema prefix)
DROP INDEX IF EXISTS rdb.rdb_waitry_pedidos_order_id_idx;


-- ════════════════════════════════════════════════════════════════════
-- Section 2 — Wrap auth.<fn>() calls in RLS predicates
-- ════════════════════════════════════════════════════════════════════
-- The planner treats (SELECT auth.uid()) as an InitPlan evaluated
-- once per query rather than per row. Behavior is unchanged; only
-- the plan shape changes.

-- ── public.profile ──────────────────────────────────────────────────
DROP POLICY IF EXISTS profile_select_own ON public.profile;
CREATE POLICY profile_select_own ON public.profile
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profile_update_own ON public.profile;
CREATE POLICY profile_update_own ON public.profile
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

-- ── public.user_presence ───────────────────────────────────────────
DROP POLICY IF EXISTS presence_update_own ON public.user_presence;
CREATE POLICY presence_update_own ON public.user_presence
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS presence_upsert_own ON public.user_presence;
CREATE POLICY presence_upsert_own ON public.user_presence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── core.audit_log ─────────────────────────────────────────────────
DROP POLICY IF EXISTS audit_select ON core.audit_log;
CREATE POLICY audit_select ON core.audit_log
  FOR SELECT TO authenticated
  USING (empresa_id IN (
    SELECT ue.empresa_id
    FROM core.usuarios_empresas ue
    WHERE ue.usuario_id = (SELECT auth.uid())
  ));

-- ── core.usuarios ──────────────────────────────────────────────────
-- Uses auth.email() rather than auth.uid(), but same initplan pattern.
DROP POLICY IF EXISTS usuarios_select_own ON core.usuarios;
CREATE POLICY usuarios_select_own ON core.usuarios
  FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT auth.email())));

-- ── core.usuarios_empresas ─────────────────────────────────────────
-- The auth.email() call is inside a subquery already, but the advisor
-- still flags it because the auth.email() reference itself is
-- per-row. Wrapping the outer subquery selector makes it an InitPlan.
DROP POLICY IF EXISTS usuarios_empresas_select_own ON core.usuarios_empresas;
CREATE POLICY usuarios_empresas_select_own ON core.usuarios_empresas
  FOR SELECT TO authenticated
  USING (usuario_id = (
    SELECT usuarios.id
    FROM core.usuarios
    WHERE lower(usuarios.email) = lower((SELECT auth.email()))
    LIMIT 1
  ));

-- ── core.permisos_usuario_excepcion ────────────────────────────────
DROP POLICY IF EXISTS permisos_usuario_excepcion_select_own ON core.permisos_usuario_excepcion;
CREATE POLICY permisos_usuario_excepcion_select_own ON core.permisos_usuario_excepcion
  FOR SELECT TO authenticated
  USING (usuario_id = (
    SELECT usuarios.id
    FROM core.usuarios
    WHERE lower(usuarios.email) = lower((SELECT auth.email()))
    LIMIT 1
  ));


-- ════════════════════════════════════════════════════════════════════
-- Section 3 — Consolidate overlapping permissive policies
-- ════════════════════════════════════════════════════════════════════
-- On both tables a `_write` policy is FOR ALL (covers SELECT, INSERT,
-- UPDATE, DELETE) and a `_select` policy is FOR SELECT — both for
-- role `authenticated` with the SAME predicate, so Postgres OR's them
-- on every SELECT. Narrow `_write` to the write-only commands; the
-- SELECT path is then served only by `_select`.

-- ── rdb.productos_waitry_map ───────────────────────────────────────
DROP POLICY IF EXISTS productos_waitry_map_write ON rdb.productos_waitry_map;
CREATE POLICY productos_waitry_map_insert ON rdb.productos_waitry_map
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY productos_waitry_map_update ON rdb.productos_waitry_map
  FOR UPDATE TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY productos_waitry_map_delete ON rdb.productos_waitry_map
  FOR DELETE TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- ── rdb.waitry_duplicate_candidates ────────────────────────────────
DROP POLICY IF EXISTS waitry_duplicate_candidates_write ON rdb.waitry_duplicate_candidates;
CREATE POLICY waitry_duplicate_candidates_insert ON rdb.waitry_duplicate_candidates
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY waitry_duplicate_candidates_update ON rdb.waitry_duplicate_candidates
  FOR UPDATE TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY waitry_duplicate_candidates_delete ON rdb.waitry_duplicate_candidates
  FOR DELETE TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
