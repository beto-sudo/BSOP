-- ============================================================
-- Final cleanup: drop all remaining legacy/unused tables
-- ============================================================

-- erp: empty task_comentarios (replaced by erp.task_updates)
DROP TABLE IF EXISTS erp.task_comentarios CASCADE;

-- rdb: legacy tables (data already migrated to erp)
DROP TABLE IF EXISTS rdb.inventario_movimientos_legacy CASCADE;
DROP TABLE IF EXISTS rdb.ordenes_compra_items_legacy CASCADE;
DROP TABLE IF EXISTS rdb.requisiciones_items_legacy CASCADE;
DROP TABLE IF EXISTS rdb.movimientos_legacy CASCADE;
DROP TABLE IF EXISTS rdb.cortes_legacy CASCADE;
DROP TABLE IF EXISTS rdb.productos_legacy CASCADE;
DROP TABLE IF EXISTS rdb.cajas_legacy CASCADE;

-- shared: empty schema (already empty, drop it)
DROP SCHEMA IF EXISTS shared CASCADE;

NOTIFY pgrst, 'reload schema';
