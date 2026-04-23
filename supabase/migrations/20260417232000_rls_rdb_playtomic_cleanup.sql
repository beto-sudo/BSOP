-- Sprint 3 PR E + H combined — rdb operational + playtomic scoping,
-- plus drop of three unused rdb.inv_* tables.
--
-- Rationale
-- ---------
-- Both schemas share the same "all-RDB" scoping story: every row in
-- rdb.* and playtomic.* belongs to one empresa (Rincón del Bosque,
-- id e52ac307-9373-4115-b65e-1178f0c4e1aa). The authenticated SELECT
-- policies currently allow any logged-in user from any empresa to
-- list the data — a DILESA-only user has no business seeing Waitry
-- POS payloads or Playtomic booking history.
--
-- The fix pattern applied throughout:
--
--   USING (core.fn_is_admin() OR core.fn_has_empresa('<rdb uuid>'))
--
-- Admins bypass; RDB members pass; everyone else gets empty results.
-- Anon access is removed entirely. service_role_all policies are left
-- alone because service_role bypasses RLS anyway — the advisor still
-- flags their `USING (true)` literal but any rewrite would be cosmetic.
--
-- Dropped tables (unused scaffold, 0 rows each):
--   * rdb.inv_productos     — replaced by erp.productos
--   * rdb.inv_entradas      — replaced by erp.movimientos_inventario
--   * rdb.inv_ajustes       — replaced by erp.movimientos_inventario
--
-- Safety
-- ------
--   * Edge functions use service_role (verified). The webhook path
--     and crons are unaffected.
--   * No client-side code touches rdb.inv_* (verified via grep).
--   * Playtomic data is only rendered to users who already have RDB
--     access in the UI; we're not removing any access that was
--     legitimate before.

-- ══════════════════════════════════════════════════════════════════
-- Part 1 — drop unused rdb.inv_* tables (0 rows each)
-- ══════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS rdb.inv_ajustes  CASCADE;
DROP TABLE IF EXISTS rdb.inv_entradas CASCADE;
DROP TABLE IF EXISTS rdb.inv_productos CASCADE;

-- ══════════════════════════════════════════════════════════════════
-- Part 2 — rdb operational tables (waitry_*, productos_waitry_map,
--          waitry_duplicate_candidates) — admin or RDB member only
-- EDITED 2026-04-23 (drift-1.5): all rdb.waitry_* are ambient. Wrap
-- each table's policy block in a to_regclass() guard so a fresh DB
-- without the upstream tables doesn't fail.
-- ══════════════════════════════════════════════════════════════════

DO $do$
DECLARE
  spec record;
  rdb_uuid constant text := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
  -- table | old_select_policy | old_write_policy(or '') | new_select_policy | new_write_policy(or '')
  specs text[][] := ARRAY[
    ['rdb.waitry_inbound',              'fix_rdb_waitry_inbound_select',     '',                                  'waitry_inbound_select',              ''],
    ['rdb.waitry_pagos',                'fix_rdb_waitry_pagos_select',       '',                                  'waitry_pagos_select',                ''],
    ['rdb.waitry_pedidos',              'fix_rdb_waitry_pedidos_select',     '',                                  'waitry_pedidos_select',              ''],
    ['rdb.waitry_productos',            'fix_rdb_waitry_productos_select',   '',                                  'waitry_productos_select',            ''],
    ['rdb.productos_waitry_map',        'fix_rdb_productos_map_select',      'fix_rdb_productos_map_write',       'productos_waitry_map_select',        'productos_waitry_map_write'],
    ['rdb.waitry_duplicate_candidates', 'fix_rdb_duplicate_candidates_select','fix_rdb_duplicate_candidates_write','waitry_duplicate_candidates_select','waitry_duplicate_candidates_write']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regclass(specs[i][1]) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', specs[i][2], specs[i][1]);
    IF specs[i][3] <> '' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', specs[i][3], specs[i][1]);
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (core.fn_is_admin() OR core.fn_has_empresa(%L::uuid))',
      specs[i][4], specs[i][1], rdb_uuid
    );
    IF specs[i][5] <> '' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s FOR ALL TO authenticated USING (core.fn_is_admin() OR core.fn_has_empresa(%L::uuid)) WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa(%L::uuid))',
        specs[i][5], specs[i][1], rdb_uuid, rdb_uuid
      );
    END IF;

    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON %s FROM anon', specs[i][1]);
  END LOOP;
END $do$;

-- ══════════════════════════════════════════════════════════════════
-- Part 3 — playtomic tables, all RDB-scoped
-- ══════════════════════════════════════════════════════════════════

-- bookings
DROP POLICY IF EXISTS playtomic_bookings_authenticated_select ON playtomic.bookings;
CREATE POLICY bookings_select ON playtomic.bookings
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- players
DROP POLICY IF EXISTS playtomic_players_authenticated_select ON playtomic.players;
CREATE POLICY players_select ON playtomic.players
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- booking_participants
DROP POLICY IF EXISTS playtomic_booking_participants_authenticated_select ON playtomic.booking_participants;
CREATE POLICY booking_participants_select ON playtomic.booking_participants
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- resources
DROP POLICY IF EXISTS playtomic_resources_authenticated_select ON playtomic.resources;
CREATE POLICY resources_select ON playtomic.resources
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- sync_log (ops metadata — admins only, not even empresa members)
DROP POLICY IF EXISTS playtomic_sync_log_authenticated_select ON playtomic.sync_log;
CREATE POLICY sync_log_select ON playtomic.sync_log
  FOR SELECT TO authenticated
  USING (core.fn_is_admin());
