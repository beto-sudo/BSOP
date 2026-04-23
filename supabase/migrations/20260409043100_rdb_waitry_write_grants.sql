-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_* are ambient pre-migration
-- tables; guard each grant.
-- Restore write access for waitry tables in rdb.
-- Safe to re-run.

grant usage on schema rdb to anon, authenticated, service_role;

do $$
declare
  t text;
  tables text[] := array[
    'rdb.waitry_pedidos','rdb.waitry_productos','rdb.waitry_inbound','rdb.waitry_pagos'
  ];
begin
  foreach t in array tables loop
    if to_regclass(t) is not null then
      execute format(
        'grant select, insert, update, delete on table %s to authenticated, service_role', t
      );
    end if;
  end loop;
end $$;

alter default privileges in schema rdb
  grant select, insert, update, delete on tables to authenticated, service_role;
