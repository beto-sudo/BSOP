-- ============================================================
-- Cleanup: drop legacy core.documentos
-- All documents have been migrated to erp.documentos
-- ============================================================

DROP TABLE IF EXISTS core.documentos CASCADE;
