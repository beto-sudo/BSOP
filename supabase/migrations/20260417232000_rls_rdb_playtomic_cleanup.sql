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
-- ══════════════════════════════════════════════════════════════════

-- waitry_inbound
DROP POLICY IF EXISTS fix_rdb_waitry_inbound_select ON rdb.waitry_inbound;
CREATE POLICY waitry_inbound_select ON rdb.waitry_inbound
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- waitry_pagos
DROP POLICY IF EXISTS fix_rdb_waitry_pagos_select ON rdb.waitry_pagos;
CREATE POLICY waitry_pagos_select ON rdb.waitry_pagos
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- waitry_pedidos
DROP POLICY IF EXISTS fix_rdb_waitry_pedidos_select ON rdb.waitry_pedidos;
CREATE POLICY waitry_pedidos_select ON rdb.waitry_pedidos
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- waitry_productos
DROP POLICY IF EXISTS fix_rdb_waitry_productos_select ON rdb.waitry_productos;
CREATE POLICY waitry_productos_select ON rdb.waitry_productos
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- productos_waitry_map (mapping table between Waitry products and ERP)
DROP POLICY IF EXISTS fix_rdb_productos_map_select ON rdb.productos_waitry_map;
DROP POLICY IF EXISTS fix_rdb_productos_map_write  ON rdb.productos_waitry_map;
CREATE POLICY productos_waitry_map_select ON rdb.productos_waitry_map
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY productos_waitry_map_write ON rdb.productos_waitry_map
  FOR ALL TO authenticated
  USING      (core.fn_is_admin()
              OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin()
              OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- waitry_duplicate_candidates (workbench for dedup effort)
DROP POLICY IF EXISTS fix_rdb_duplicate_candidates_select ON rdb.waitry_duplicate_candidates;
DROP POLICY IF EXISTS fix_rdb_duplicate_candidates_write  ON rdb.waitry_duplicate_candidates;
CREATE POLICY waitry_duplicate_candidates_select ON rdb.waitry_duplicate_candidates
  FOR SELECT TO authenticated
  USING (core.fn_is_admin()
         OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));
CREATE POLICY waitry_duplicate_candidates_write ON rdb.waitry_duplicate_candidates
  FOR ALL TO authenticated
  USING      (core.fn_is_admin()
              OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin()
              OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

-- Revoke anon access at the grant level as belt-and-suspenders.
REVOKE SELECT, INSERT, UPDATE, DELETE ON
  rdb.waitry_inbound,
  rdb.waitry_pagos,
  rdb.waitry_pedidos,
  rdb.waitry_productos,
  rdb.productos_waitry_map,
  rdb.waitry_duplicate_candidates
FROM anon;

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
