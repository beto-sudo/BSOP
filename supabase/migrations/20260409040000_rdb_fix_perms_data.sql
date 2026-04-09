-- Fix rdb permissions, RLS, and missing legacy data copies.
-- Safe to re-run.

create schema if not exists rdb;

grant usage on schema rdb to anon, authenticated, service_role;
grant select on all tables in schema rdb to anon, authenticated, service_role;
grant select on all sequences in schema rdb to anon, authenticated, service_role;
grant insert, update, delete on table
  rdb.cajas,
  rdb.cortes,
  rdb.movimientos,
  rdb.productos,
  rdb.inventario_movimientos,
  rdb.proveedores,
  rdb.requisiciones,
  rdb.ordenes_compra,
  rdb.ordenes_compra_items
to authenticated;

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

create policy fix_rdb_cajas_select on rdb.cajas for select to anon, authenticated using (true);
create policy fix_rdb_cortes_select on rdb.cortes for select to anon, authenticated using (true);
create policy fix_rdb_movimientos_select on rdb.movimientos for select to anon, authenticated using (true);
create policy fix_rdb_waitry_inbound_select on rdb.waitry_inbound for select to anon, authenticated using (true);
create policy fix_rdb_waitry_pedidos_select on rdb.waitry_pedidos for select to anon, authenticated using (true);
create policy fix_rdb_waitry_productos_select on rdb.waitry_productos for select to anon, authenticated using (true);
create policy fix_rdb_waitry_pagos_select on rdb.waitry_pagos for select to anon, authenticated using (true);
create policy fix_rdb_productos_select on rdb.productos for select to anon, authenticated using (true);
create policy fix_rdb_inventario_movimientos_select on rdb.inventario_movimientos for select to anon, authenticated using (true);
create policy fix_rdb_proveedores_select on rdb.proveedores for select to anon, authenticated using (true);
create policy fix_rdb_requisiciones_select on rdb.requisiciones for select to anon, authenticated using (true);
create policy fix_rdb_ordenes_compra_select on rdb.ordenes_compra for select to anon, authenticated using (true);
create policy fix_rdb_ordenes_compra_items_select on rdb.ordenes_compra_items for select to anon, authenticated using (true);

create policy fix_rdb_cajas_write on rdb.cajas for all to authenticated using (true) with check (true);
create policy fix_rdb_cortes_write on rdb.cortes for all to authenticated using (true) with check (true);
create policy fix_rdb_movimientos_write on rdb.movimientos for all to authenticated using (true) with check (true);
create policy fix_rdb_productos_write on rdb.productos for all to authenticated using (true) with check (true);
create policy fix_rdb_inventario_movimientos_write on rdb.inventario_movimientos for all to authenticated using (true) with check (true);
create policy fix_rdb_proveedores_write on rdb.proveedores for all to authenticated using (true) with check (true);
create policy fix_rdb_requisiciones_write on rdb.requisiciones for all to authenticated using (true) with check (true);
create policy fix_rdb_ordenes_compra_write on rdb.ordenes_compra for all to authenticated using (true) with check (true);
create policy fix_rdb_ordenes_compra_items_write on rdb.ordenes_compra_items for all to authenticated using (true) with check (true);

-- Legacy data backfill.
insert into rdb.cajas (id, nombre)
select c.id, c.nombre
from caja.cajas c
left join rdb.cajas r on r.id = c.id
where r.id is null
on conflict (id) do nothing;

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

insert into rdb.movimientos (id, corte_id, fecha_hora, tipo, monto, nota, registrado_por)
select m.id, m.corte_id, m.fecha_hora, m.tipo, m.monto, m.nota, m.registrado_por
from caja.movimientos m
left join rdb.movimientos r on r.id = m.id
where r.id is null
on conflict (id) do nothing;

insert into rdb.waitry_inbound (
  id, order_id, event, payload_json, payload_hash, received_at, processed, attempts, error, created_at
)
select i.id, i.order_id, i.event, i.payload_json, i.payload_hash, i.received_at, i.processed, i.attempts, i.error, i.created_at
from waitry.inbound i
left join rdb.waitry_inbound r on r.order_id = i.order_id
where r.order_id is null
on conflict (order_id) do nothing;

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

insert into rdb.waitry_pagos (
  id, order_id, payment_id, payment_method, amount, tip, currency, created_at
)
select
  p.id, p.order_id, p.payment_id, p.payment_method, p.amount, p.tip, p.currency, p.created_at
from waitry.pagos p
left join rdb.waitry_pagos r on r.order_id = p.order_id and r.payment_id = p.payment_id
where r.id is null
on conflict (order_id, payment_id) do nothing;
