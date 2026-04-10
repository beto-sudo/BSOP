ALTER ROLE authenticator SET search_path = public, extensions, rdb;
ALTER ROLE service_role SET search_path = public, extensions, rdb;
ALTER ROLE anon SET search_path = public, extensions, rdb;
ALTER ROLE authenticated SET search_path = public, extensions, rdb;
NOTIFY pgrst, 'reload schema';
