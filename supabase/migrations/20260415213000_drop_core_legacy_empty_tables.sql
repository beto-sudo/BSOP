-- ============================================================
-- Cleanup: drop empty legacy tables from core and shared
-- All functionality lives in erp schema now
-- ============================================================

-- core: legacy junta tables (all empty, replaced by erp.juntas)
DROP TABLE IF EXISTS core.junta_adjuntos CASCADE;
DROP TABLE IF EXISTS core.junta_participantes CASCADE;
DROP TABLE IF EXISTS core.junta_tareas CASCADE;
DROP TABLE IF EXISTS core.juntas CASCADE;

-- core: legacy empleados (empty, replaced by erp.empleados)
DROP TABLE IF EXISTS core.empleados CASCADE;

-- core: unused empty tables
DROP TABLE IF EXISTS core.notifications CASCADE;
DROP TABLE IF EXISTS core.attachments CASCADE;

-- shared: last remaining table, no code references
DROP TABLE IF EXISTS shared.monedas CASCADE;

-- Drop shared schema if empty
DROP SCHEMA IF EXISTS shared CASCADE;
