DROP VIEW IF EXISTS rdb.v_cortes_productos CASCADE;
DROP VIEW IF EXISTS rdb.v_cortes_totales_sync CASCADE;
NOTIFY pgrst, 'reload schema';
