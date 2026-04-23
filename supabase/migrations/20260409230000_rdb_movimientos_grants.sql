-- EDITED 2026-04-23 (drift-1.5): rdb.movimientos is ambient.
DO $$
BEGIN
  IF to_regclass('rdb.movimientos') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rdb.movimientos TO service_role, authenticated, anon;
  END IF;
END $$;
