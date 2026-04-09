-- Restore write access for waitry tables in rdb.
-- Safe to re-run.

grant usage on schema rdb to anon, authenticated, service_role;

grant select, insert, update, delete on table
  rdb.waitry_pedidos,
  rdb.waitry_productos,
  rdb.waitry_inbound,
  rdb.waitry_pagos
to authenticated, service_role;

alter default privileges in schema rdb
  grant select, insert, update, delete on tables to authenticated, service_role;
