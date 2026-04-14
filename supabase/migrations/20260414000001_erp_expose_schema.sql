-- Expose erp schema to PostgREST
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, rdb, playtomic, core, shared, erp';
NOTIFY pgrst, 'reload schema';
