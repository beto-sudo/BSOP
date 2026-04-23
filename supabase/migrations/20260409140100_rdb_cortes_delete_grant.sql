-- EDITED 2026-04-23 (drift-1.5): rdb.cortes is ambient; skip when absent.
DO $$
BEGIN
  IF to_regclass('rdb.cortes') IS NOT NULL THEN
    GRANT DELETE ON rdb.cortes TO service_role;
  END IF;
END $$;
