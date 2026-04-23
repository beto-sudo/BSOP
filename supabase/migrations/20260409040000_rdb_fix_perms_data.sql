-- EDITED 2026-04-23 (drift-1.5): hardened against missing legacy objects so the
-- suite is reproducible from scratch (Supabase Preview Branches, dev local, DR).
-- Original statements assumed that rdb.* base tables and the caja/waitry source
-- schemas existed (they were created via dashboard before migration tracking).
-- They were later moved to erp.* (20260414000002 onward) and dropped
-- (20260415220000), so on a clean DB they do not exist. Each statement now
-- guards on to_regclass() / has_schema_privilege() to no-op when the source
-- is absent. Production state is unaffected: this migration is already applied.

-- Fix rdb permissions, RLS, and missing legacy data copies.
-- Safe to re-run.

create schema if not exists rdb;

grant usage on schema rdb to anon, authenticated, service_role;
grant select on all tables in schema rdb to anon, authenticated, service_role;
grant select on all sequences in schema rdb to anon, authenticated, service_role;

-- Per-table GRANT INSERT/UPDATE/DELETE: skip silently when the legacy table
-- has already been removed. Production saw all of these as base tables; fresh
-- DBs have none of them (later migrations create erp.* equivalents instead).
do $$
declare
  t text;
  tables text[] := array[
    'rdb.cajas','rdb.cortes','rdb.movimientos','rdb.productos',
    'rdb.inventario_movimientos','rdb.proveedores','rdb.requisiciones',
    'rdb.ordenes_compra','rdb.ordenes_compra_items'
  ];
begin
  foreach t in array tables loop
    if to_regclass(t) is not null then
      execute format('grant insert, update, delete on table %s to authenticated', t);
    end if;
  end loop;
end $$;

alter default privileges in schema rdb
  grant select on tables to anon, authenticated, service_role;
alter default privileges in schema rdb
  grant select on sequences to anon, authenticated, service_role;
alter default privileges in schema rdb
  grant insert, update, delete on tables to authenticated;

-- Ensure RLS is enabled on critical base tables.
alter table if exists rdb.cajas enable row level security;
alter table if exists rdb.cortes enable row level security;
alter table if exists rdb.movimientos enable row level security;
alter table if exists rdb.waitry_inbound enable row level security;
alter table if exists rdb.waitry_pedidos enable row level security;
alter table if exists rdb.waitry_productos enable row level security;
alter table if exists rdb.waitry_pagos enable row level security;
alter table if exists rdb.productos enable row level security;
alter table if exists rdb.inventario_movimientos enable row level security;
alter table if exists rdb.proveedores enable row level security;
alter table if exists rdb.requisiciones enable row level security;
alter table if exists rdb.ordenes_compra enable row level security;
alter table if exists rdb.ordenes_compra_items enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'rdb'
      and tablename in (
        'cajas','cortes','movimientos','waitry_inbound','waitry_pedidos','waitry_productos','waitry_pagos',
        'productos','inventario_movimientos','proveedores','requisiciones','ordenes_compra','ordenes_compra_items'
      )
      and policyname like 'fix_rdb_%'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- CREATE POLICY: Postgres has no IF NOT EXISTS for policies, and the target
-- table may be absent on a clean DB. Wrap each in a to_regclass() guard.
do $$
declare
  spec record;
  specs text[][] := array[
    array['cajas','select','for select to anon, authenticated using (true)'],
    array['cortes','select','for select to anon, authenticated using (true)'],
    array['movimientos','select','for select to anon, authenticated using (true)'],
    array['waitry_inbound','select','for select to anon, authenticated using (true)'],
    array['waitry_pedidos','select','for select to anon, authenticated using (true)'],
    array['waitry_productos','select','for select to anon, authenticated using (true)'],
    array['waitry_pagos','select','for select to anon, authenticated using (true)'],
    array['productos','select','for select to anon, authenticated using (true)'],
    array['inventario_movimientos','select','for select to anon, authenticated using (true)'],
    array['proveedores','select','for select to anon, authenticated using (true)'],
    array['requisiciones','select','for select to anon, authenticated using (true)'],
    array['ordenes_compra','select','for select to anon, authenticated using (true)'],
    array['ordenes_compra_items','select','for select to anon, authenticated using (true)'],
    array['cajas','write','for all to authenticated using (true) with check (true)'],
    array['cortes','write','for all to authenticated using (true) with check (true)'],
    array['movimientos','write','for all to authenticated using (true) with check (true)'],
    array['productos','write','for all to authenticated using (true) with check (true)'],
    array['inventario_movimientos','write','for all to authenticated using (true) with check (true)'],
    array['proveedores','write','for all to authenticated using (true) with check (true)'],
    array['requisiciones','write','for all to authenticated using (true) with check (true)'],
    array['ordenes_compra','write','for all to authenticated using (true) with check (true)'],
    array['ordenes_compra_items','write','for all to authenticated using (true) with check (true)']
  ];
  i int;
begin
  for i in 1 .. array_length(specs, 1) loop
    if to_regclass('rdb.' || specs[i][1]) is not null then
      execute format(
        'create policy fix_rdb_%I_%I on rdb.%I %s',
        specs[i][1], specs[i][2], specs[i][1], specs[i][3]
      );
    end if;
  end loop;
end $$;

-- Legacy data backfill — only runs when both source (caja/waitry) and target
-- (rdb) tables exist. On a fresh DB, both sides are absent so the block is a
-- no-op. In production this was applied when both sides existed and the data
-- was copied; later migrations promoted it into the erp.* schema.
do $$
begin
  if to_regclass('caja.cajas') is not null and to_regclass('rdb.cajas') is not null then
    insert into rdb.cajas (id, nombre)
    select c.id, c.nombre
    from caja.cajas c
    left join rdb.cajas r on r.id = c.id
    where r.id is null
    on conflict (id) do nothing;
  end if;

  if to_regclass('caja.cortes') is not null and to_regclass('rdb.cortes') is not null then
    insert into rdb.cortes (
      id, fecha_operativa, caja_nombre, caja_id, hora_inicio, hora_fin,
      responsable_apertura, responsable_cierre, efectivo_inicial, efectivo_contado, estado
    )
    select
      c.id, c.fecha_operativa, c.caja_nombre, c.caja_id, c.hora_inicio, c.hora_fin,
      c.responsable_apertura, c.responsable_cierre, c.efectivo_inicial, c.efectivo_contado, c.estado
    from caja.cortes c
    left join rdb.cortes r on r.id = c.id
    where r.id is null
    on conflict (id) do nothing;
  end if;

  if to_regclass('caja.movimientos') is not null and to_regclass('rdb.movimientos') is not null then
    insert into rdb.movimientos (id, corte_id, fecha_hora, tipo, monto, nota, registrado_por)
    select m.id, m.corte_id, m.fecha_hora, m.tipo, m.monto, m.nota, m.registrado_por
    from caja.movimientos m
    left join rdb.movimientos r on r.id = m.id
    where r.id is null
    on conflict (id) do nothing;
  end if;

  if to_regclass('waitry.inbound') is not null and to_regclass('rdb.waitry_inbound') is not null then
    insert into rdb.waitry_inbound (
      id, order_id, event, payload_json, payload_hash, received_at, processed, attempts, error, created_at
    )
    select i.id, i.order_id, i.event, i.payload_json, i.payload_hash, i.received_at, i.processed, i.attempts, i.error, i.created_at
    from waitry.inbound i
    left join rdb.waitry_inbound r on r.order_id = i.order_id
    where r.order_id is null
    on conflict (order_id) do nothing;
  end if;

  if to_regclass('waitry.pedidos') is not null and to_regclass('rdb.waitry_pedidos') is not null then
    insert into rdb.waitry_pedidos (
      id, order_id, status, paid, "timestamp", place_id, place_name, table_name, layout_name,
      total_amount, total_discount, service_charge, tax, external_delivery_id, notes,
      last_action_at, content_hash, created_at, updated_at
    )
    select
      p.id, p.order_id, p.status, p.paid, p."timestamp", p.place_id, p.place_name, p.table_name, p.layout_name,
      p.total_amount, p.total_discount, p.service_charge, p.tax, p.external_delivery_id, p.notes,
      p.last_action_at, p.content_hash, p.created_at, p.updated_at
    from waitry.pedidos p
    left join rdb.waitry_pedidos r on r.order_id = p.order_id
    where r.order_id is null
    on conflict (order_id) do nothing;
  end if;

  if to_regclass('waitry.productos') is not null and to_regclass('rdb.waitry_productos') is not null then
    insert into rdb.waitry_productos (
      id, order_id, product_id, product_name, quantity, unit_price, total_price, modifiers, notes, created_at
    )
    select
      p.id, p.order_id, p.product_id, p.product_name, p.quantity, p.unit_price, p.total_price, p.modifiers, p.notes, p.created_at
    from waitry.productos p
    left join rdb.waitry_productos r
      on r.order_id = p.order_id
     and coalesce(r.product_id, '') = coalesce(p.product_id, '')
     and r.product_name = p.product_name
    where r.id is null
    on conflict (order_id, product_id, product_name) do nothing;
  end if;

  if to_regclass('waitry.pagos') is not null and to_regclass('rdb.waitry_pagos') is not null then
    insert into rdb.waitry_pagos (
      id, order_id, payment_id, payment_method, amount, tip, currency, created_at
    )
    select
      p.id, p.order_id, p.payment_id, p.payment_method, p.amount, p.tip, p.currency, p.created_at
    from waitry.pagos p
    left join rdb.waitry_pagos r on r.order_id = p.order_id and r.payment_id = p.payment_id
    where r.id is null
    on conflict (order_id, payment_id) do nothing;
  end if;
end $$;
