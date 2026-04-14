-- Grant USAGE on erp schema to anon and authenticated roles
GRANT USAGE ON SCHEMA erp TO anon, authenticated;

-- Grants + RLS for all erp tables (idempotent)
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'erp'
  LOOP
    -- Grant permissions
    EXECUTE format('GRANT SELECT ON erp.%I TO anon;', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON erp.%I TO authenticated;', tbl);

    -- Enable RLS
    EXECUTE format('ALTER TABLE erp.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Drop existing policies for this table if they exist
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'erp' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON erp.%I;', pol, tbl);
    END LOOP;

    -- Recreate policies
    EXECUTE format(
      'CREATE POLICY "erp_%s_select" ON erp.%I FOR SELECT TO authenticated USING (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "erp_%s_anon_select" ON erp.%I FOR SELECT TO anon USING (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "erp_%s_insert" ON erp.%I FOR INSERT TO authenticated WITH CHECK (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "erp_%s_update" ON erp.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "erp_%s_delete" ON erp.%I FOR DELETE TO authenticated USING (true);',
      tbl, tbl
    );
  END LOOP;
END;
$$;
