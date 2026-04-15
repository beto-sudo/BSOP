-- ============================================================
-- Cleanup: drop legacy core.tasks and related tables
-- All task functionality now lives in erp.tasks + erp.task_updates
-- ============================================================

-- Drop dependents first
DROP TABLE IF EXISTS core.task_adjuntos CASCADE;
DROP TABLE IF EXISTS core.task_comentarios CASCADE;
DROP TABLE IF EXISTS core.tasks CASCADE;

-- Drop shared lookup tables (only used by legacy core.tasks UI)
DROP TABLE IF EXISTS shared.categorias CASCADE;
DROP TABLE IF EXISTS shared.estados CASCADE;
DROP TABLE IF EXISTS shared.prioridades CASCADE;
