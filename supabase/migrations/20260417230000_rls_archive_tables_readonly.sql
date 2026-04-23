-- Sprint 3 PR F — archive tables become read-only for authenticated.
--
-- EDITED 2026-04-23 (drift-1.5): the rdb.*_archive_2026_04_17 tables are
-- ambient (created via dashboard during the RDB→ERP migration on 2026-04-17,
-- not via tracked migration). They don't exist on a fresh DB, so wrap each
-- per-table policy block in a to_regclass() guard.
--
-- Context
-- -------
-- Four `rdb.*_archive_2026_04_17` tables were created on 2026-04-17 as
-- snapshots of the RDB → ERP migration. They currently carry two
-- policies each: a permissive write and an anon-readable select. Both are
-- flagged by the advisor as `rls_policy_always_true`. This migration
-- replaces them with a single read-only policy for authenticated.

DO $do$
DECLARE
  spec record;
  specs text[][] := ARRAY[
    ['rdb.proveedores_archive_2026_04_17',                 'proveedores',                 'fix_rdb_proveedores_select',                 'fix_rdb_proveedores_write',                 'proveedores_archive_read'],
    ['rdb.requisiciones_archive_2026_04_17',               'requisiciones',               'fix_rdb_requisiciones_select',               'fix_rdb_requisiciones_write',               'requisiciones_archive_read'],
    ['rdb.ordenes_compra_archive_2026_04_17',              'ordenes_compra',              'fix_rdb_ordenes_compra_select',              'fix_rdb_ordenes_compra_write',              'ordenes_compra_archive_read'],
    ['rdb.corte_conteo_denominaciones_archive_2026_04_17', 'corte_conteo_denominaciones', 'fix_rdb_corte_conteo_denominaciones_select', 'fix_rdb_corte_conteo_denominaciones_write', 'corte_conteo_denominaciones_archive_read']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regclass(specs[i][1]) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', specs[i][3], specs[i][1]);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', specs[i][4], specs[i][1]);
      EXECUTE format(
        'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (true)',
        specs[i][5], specs[i][1]
      );
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE ON %s FROM authenticated, anon',
        specs[i][1]
      );
    END IF;
  END LOOP;
END $do$;
