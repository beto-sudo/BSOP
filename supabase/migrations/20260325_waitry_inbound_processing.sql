-- ════════════════════════════════════════════════════════════════════════════
-- HISTÓRICO 20260325 — no-op stub (drift-3, 2026-04-25)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Triggers de procesamiento del inbound waitry (pre-rdb_consolidation).
--
-- El SQL original referencia schemas legacy (waitry.*, caja.*, inventario.*,
-- rdb.*_legacy) que fueron consolidados/droppeados por
-- 20260408000000_rdb_consolidation y posteriores. Re-correrlo en una DB fresca
-- (Preview Branch, dev local, DR) falla porque los targets ya no existen.
--
-- El cuerpo SQL original vive en supabase_migrations.schema_migrations.statements
-- como audit trail. Para auditar:
--   SELECT statements FROM supabase_migrations.schema_migrations
--   WHERE version = '20260325';
--
-- Ver supabase/GOVERNANCE.md §4 (Bootstrap & histórico legacy).

SELECT 1 WHERE false; -- explicit no-op
