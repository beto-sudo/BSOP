-- ============================================================
-- CLEANUP FINAL: Borrado de Schemas Legados (Coda V2 descartado)
-- ============================================================

-- BORRADO DE SCHEMAS LEGADOS (CASCADE)
DROP SCHEMA IF EXISTS waitry CASCADE;
DROP SCHEMA IF EXISTS caja CASCADE;
DROP SCHEMA IF EXISTS inventario CASCADE;
DROP SCHEMA IF EXISTS staging CASCADE;

-- Grants finales de seguridad para rdb
GRANT ALL ON ALL TABLES IN SCHEMA rdb TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA rdb TO anon, authenticated;
GRANT USAGE ON SCHEMA rdb TO anon, authenticated, service_role;
