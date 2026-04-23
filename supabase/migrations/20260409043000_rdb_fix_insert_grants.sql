-- EDITED 2026-04-23 (drift-1.5): hardened — rdb.waitry_* are ambient (created
-- via dashboard pre-migration tracking) and missing on a fresh DB. The grants
-- and policies below now no-op when the target table is absent.
do $$
declare
  t text;
  tables text[] := array['rdb.waitry_pedidos','rdb.waitry_productos','rdb.waitry_pagos','rdb.waitry_inbound'];
begin
  foreach t in array tables loop
    if to_regclass(t) is not null then
      execute format('grant insert, update on %s to service_role', t);
      execute format('drop policy if exists %I on %s', 'service_role_all_' || split_part(t, '.', 2), t);
      execute format(
        'create policy %I on %s to service_role using (true) with check (true)',
        'service_role_all_' || split_part(t, '.', 2), t
      );
    end if;
  end loop;
end $$;
