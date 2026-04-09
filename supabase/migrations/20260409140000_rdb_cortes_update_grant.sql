-- Permitir UPDATE en rdb.cortes para service_role y authenticated
GRANT UPDATE ON rdb.cortes TO service_role, authenticated;
-- También permitir DELETE (necesario para limpieza de registros de prueba y operación)
GRANT DELETE ON rdb.cortes TO service_role;
