-- Grant completo a movimientos para service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON rdb.movimientos TO service_role, authenticated, anon;
