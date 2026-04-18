-- Sprint 3 PR F — archive tables become read-only for authenticated.
--
-- Context
-- -------
-- Four `rdb.*_archive_2026_04_17` tables were created on 2026-04-17 as
-- snapshots of the RDB → ERP migration. They currently carry two
-- policies each that look like this:
--
--   fix_rdb_<t>_select  SELECT   roles {authenticated, anon}   USING true
--   fix_rdb_<t>_write   ALL cmd  roles {authenticated}         USING true WITH CHECK true
--
-- Every one is flagged by the advisor as `rls_policy_always_true`. The
-- write policy has no business being here — archive snapshots should
-- never mutate — and the anon read is the same enumeration vector we
-- closed on `adjuntos` in Sprint 2.
--
-- Fix: drop both policies per table, replace with a single read-only
-- SELECT policy for authenticated. The data stays accessible for
-- historical queries; nothing can write; anon has no visibility.
--
-- Affected tables (each with 2 policies removed, 1 added):
--   * rdb.proveedores_archive_2026_04_17              (30 rows)
--   * rdb.requisiciones_archive_2026_04_17            (188 rows)
--   * rdb.ordenes_compra_archive_2026_04_17           (160 rows)
--   * rdb.corte_conteo_denominaciones_archive_2026_04_17 (0 rows)
--
-- Rollback: the old broad policies are trivially re-creatable; the data
-- is not touched. If a future migration needs to drop the archives
-- entirely (per the audit's retention plan), these policies get dropped
-- with them.

-- ── proveedores ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fix_rdb_proveedores_select ON rdb.proveedores_archive_2026_04_17;
DROP POLICY IF EXISTS fix_rdb_proveedores_write  ON rdb.proveedores_archive_2026_04_17;
CREATE POLICY proveedores_archive_read
  ON rdb.proveedores_archive_2026_04_17
  FOR SELECT TO authenticated
  USING (true);

-- ── requisiciones ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS fix_rdb_requisiciones_select ON rdb.requisiciones_archive_2026_04_17;
DROP POLICY IF EXISTS fix_rdb_requisiciones_write  ON rdb.requisiciones_archive_2026_04_17;
CREATE POLICY requisiciones_archive_read
  ON rdb.requisiciones_archive_2026_04_17
  FOR SELECT TO authenticated
  USING (true);

-- ── ordenes_compra ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS fix_rdb_ordenes_compra_select ON rdb.ordenes_compra_archive_2026_04_17;
DROP POLICY IF EXISTS fix_rdb_ordenes_compra_write  ON rdb.ordenes_compra_archive_2026_04_17;
CREATE POLICY ordenes_compra_archive_read
  ON rdb.ordenes_compra_archive_2026_04_17
  FOR SELECT TO authenticated
  USING (true);

-- ── corte_conteo_denominaciones (empty, but same treatment) ────────────
DROP POLICY IF EXISTS fix_rdb_corte_conteo_denominaciones_select ON rdb.corte_conteo_denominaciones_archive_2026_04_17;
DROP POLICY IF EXISTS fix_rdb_corte_conteo_denominaciones_write  ON rdb.corte_conteo_denominaciones_archive_2026_04_17;
CREATE POLICY corte_conteo_denominaciones_archive_read
  ON rdb.corte_conteo_denominaciones_archive_2026_04_17
  FOR SELECT TO authenticated
  USING (true);

-- Ensure writes are blocked at the role-grant level too (belt +
-- suspenders): revoke INSERT/UPDATE/DELETE explicitly. authenticated
-- still has SELECT from the schema grant.
REVOKE INSERT, UPDATE, DELETE ON
  rdb.proveedores_archive_2026_04_17,
  rdb.requisiciones_archive_2026_04_17,
  rdb.ordenes_compra_archive_2026_04_17,
  rdb.corte_conteo_denominaciones_archive_2026_04_17
FROM authenticated, anon;
