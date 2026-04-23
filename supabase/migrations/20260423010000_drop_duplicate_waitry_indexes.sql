-- Sprint drift-1 · Mig 6 de 6
-- Elimina índices duplicados en rdb.waitry_*:
--   · waitry_inbound_order_id_idx      → cubierto por waitry_inbound_order_id_unique
--   · waitry_pedidos_order_id_idx      → cubierto por waitry_pedidos_order_id_unique
--   · waitry_pedidos_timestamp_idx     → duplicado funcional de rdb_waitry_pedidos_timestamp_idx
--
-- IMPORTANTE: CONCURRENTLY no puede correr dentro de un bloque transaccional.
-- Este archivo NO debe tener BEGIN/COMMIT. El runner de Supabase CLI lo
-- aplica en autocommit mientras no lo envuelva explícitamente.

DROP INDEX CONCURRENTLY IF EXISTS rdb.waitry_inbound_order_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS rdb.waitry_pedidos_order_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS rdb.waitry_pedidos_timestamp_idx;
