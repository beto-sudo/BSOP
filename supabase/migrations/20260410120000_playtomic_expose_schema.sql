ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, rdb, playtomic';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
