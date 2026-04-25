-- ════════════════════════════════════════════════════════════════════════════
-- HISTÓRICO 20260405185048 — no-op stub (drift-3, 2026-04-25)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fix de timezone en caja.v_cortes_totales / v_cortes_productos.
--
-- El SQL original referencia schemas legacy (waitry.*, caja.*, inventario.*,
-- rdb.*_legacy) que fueron consolidados/droppeados por
-- 20260408000000_rdb_consolidation y posteriores. Re-correrlo en una DB fresca
-- (Preview Branch, dev local, DR) falla porque los targets ya no existen.
--
-- El cuerpo SQL original vive en supabase_migrations.schema_migrations.statements
-- como audit trail. Para auditar:
--   SELECT statements FROM supabase_migrations.schema_migrations
--   WHERE version = '20260405185048';
--
-- Ver supabase/GOVERNANCE.md §4 (Bootstrap & histórico legacy).

SELECT 1 WHERE false; -- explicit no-op
