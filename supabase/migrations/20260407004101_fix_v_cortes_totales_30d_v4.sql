-- ════════════════════════════════════════════════════════════════════════════
-- HISTÓRICO 20260407004101 — no-op stub (drift-3, 2026-04-25)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Iteración v4 del view 30d.
--
-- El SQL original referencia schemas legacy (waitry.*, caja.*, inventario.*,
-- rdb.*_legacy) que fueron consolidados/droppeados por
-- 20260408000000_rdb_consolidation y posteriores. Re-correrlo en una DB fresca
-- (Preview Branch, dev local, DR) falla porque los targets ya no existen.
--
-- El cuerpo SQL original vive en supabase_migrations.schema_migrations.statements
-- como audit trail. Para auditar:
--   SELECT statements FROM supabase_migrations.schema_migrations
--   WHERE version = '20260407004101';
--
-- Ver supabase/GOVERNANCE.md §4 (Bootstrap & histórico legacy).

SELECT 1 WHERE false; -- explicit no-op
