-- EDITED 2026-04-23 (drift-1.5): rdb.cortes is ambient; skip when absent.
-- Permitir UPDATE en rdb.cortes para service_role y authenticated
DO $$
BEGIN
  IF to_regclass('rdb.cortes') IS NOT NULL THEN
    GRANT UPDATE ON rdb.cortes TO service_role, authenticated;
    -- También permitir DELETE (necesario para limpieza de registros de prueba y operación)
    GRANT DELETE ON rdb.cortes TO service_role;
  END IF;
END $$;
