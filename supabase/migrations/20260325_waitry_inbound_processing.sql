create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_order_id_key') then
    alter table waitry.pedidos add constraint pedidos_order_id_key unique (order_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_order_key') then
    alter table waitry.productos add constraint productos_order_key unique (order_id, product_id, product_name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pagos_order_payment_key') then
    alter table waitry.pagos add constraint pagos_order_payment_key unique (order_id, payment_id);
  end if;
end $$;

create or replace function waitry.to_iso_from_ar(v jsonb)
returns timestamptz
language plpgsql
as $$
declare
  s text;
begin
  if v is null then
    return null;
  end if;

  if jsonb_typeof(v) = 'object' then
    s := coalesce(v->>'date', v->>'datetime', v->>'timestamp', v->>'createdAt', v->>'updatedAt');
  else
    s := trim(both '"' from v::text);
  end if;

  if s is null or btrim(s) = '' then
    return null;
  end if;

  if s ~ '(Z|[+\-][0-9]{2}:[0-9]{2})$' then
    return s::timestamptz;
  end if;

  return replace(s, ' ', 'T')::timestamp at time zone '-03:00';
end;
$$;

create or replace function waitry.process_inbound_row(p_row waitry.inbound)
returns void
language plpgsql
as $$
declare
  p jsonb;
  v_order_id text;
  v_status text;
  v_paid boolean;
  v_timestamp timestamptz;
  v_place_id text;
  v_place_name text;
  v_table_name text;
  v_layout_name text;
  v_total_amount numeric;
  v_total_discount numeric;
  v_service_charge numeric;
  v_tax numeric;
  v_external_delivery_id text;
  v_notes text;
  v_last_action_at timestamptz;
  v_content_hash text;
  item jsonb;
  pay jsonb;
begin
  p := coalesce(p_row.payload_json->'payload', p_row.payload_json);
  v_order_id := coalesce(p->>'orderId', p->'order'->>'id', p->>'id');

  if v_order_id is null then
    raise exception 'No order_id found in inbound row %', p_row.id;
  end if;

  v_status := coalesce(
    p->>'event',
    p->>'status',
    p->>'state',
    p #>> '{orderActions,0,orderActionType,name}'
  );

  v_paid := coalesce((p->>'paid')::boolean, (p->>'isPaid')::boolean, false);
  v_timestamp := waitry.to_iso_from_ar(p->'timestamp');
  v_place_id := coalesce(p #>> '{table,place,placeId}', p #>> '{place,placeId}', p->>'placeId', p #>> '{place,id}');
  v_place_name := coalesce(p #>> '{table,place,name}', p #>> '{place,name}', p->>'placeName', p->>'venueName');
  v_table_name := coalesce(p #>> '{table,name}', p->>'posName', p #>> '{table,tableName}');
  v_layout_name := coalesce(p #>> '{table,layout,name}', p->>'layoutName');
  v_total_amount := coalesce((p->>'totalAmount')::numeric, (p #>> '{totals,total}')::numeric, (p #>> '{order,total}')::numeric);
  v_total_discount := coalesce((p->>'totalDiscount')::numeric, (p #>> '{totals,discount}')::numeric);
  v_service_charge := coalesce((p->>'serviceCharge')::numeric, (p->>'serviceChargeAmount')::numeric, (p #>> '{totals,service}')::numeric);
  v_tax := coalesce((p #>> '{table,place,tax}')::numeric, (p #>> '{totals,tax}')::numeric);
  v_external_delivery_id := coalesce(
    p->>'externalDeliveryId',
    p #>> '{delivery,externalId}',
    p #>> '{delivery,externalDeliveryId}',
    p #>> '{delivery,id}',
    p->>'deliveryId',
    p->>'externalId',
    p #>> '{order,externalDeliveryId}',
    p #>> '{order,delivery,externalId}',
    p #>> '{order,deliveryId}',
    p #>> '{order,externalId}',
    p #>> '{meta,externalDeliveryId}',
    p #>> '{meta,externalId}',
    p #>> '{options,externalDeliveryId}',
    p #>> '{options,externalId}'
  );
  v_notes := coalesce(
    p->>'notes', p->>'note', p->>'comments', p->>'comment',
    p->>'customerNote', p->>'customerNotes', p->>'orderNotes',
    p->>'kitchenNotes', p->>'deliveryNotes', p->>'specialInstructions',
    p->>'instructions', p->>'observations', p->>'observation',
    p->>'posNote', p->>'posNotes',
    p #>> '{order,notes}', p #>> '{order,note}', p #>> '{order,comments}', p #>> '{order,comment}',
    p #>> '{table,note}', p #>> '{table,notes}', p #>> '{place,note}', p #>> '{place,notes}',
    p #>> '{meta,notes}', p #>> '{meta,note}', p #>> '{extra,notes}', p #>> '{extra,note}'
  );

  select max(waitry.to_iso_from_ar(x->'timestamp'))
    into v_last_action_at
  from jsonb_array_elements(coalesce(p->'orderActions', '[]'::jsonb)) x;

  select encode(
    digest(
      coalesce(string_agg(
        coalesce(oi #>> '{item,name}', oi->>'productName', oi->>'name', 'Item') || ':' ||
        coalesce(oi->>'quantity', oi->>'count', '1'),
        '|' order by coalesce(oi #>> '{item,name}', oi->>'productName', oi->>'name', 'Item'),
                    coalesce(oi->>'quantity', oi->>'count', '1')
      ), '')
      || '|' || coalesce(p->>'totalAmount', p #>> '{totals,total}', p #>> '{order,total}', '')
      || '|' || coalesce(p #>> '{table,name}', p->>'posName', p #>> '{table,tableName}', ''),
      'sha256'
    ),
    'hex'
  )
    into v_content_hash
  from jsonb_array_elements(coalesce(p->'orderItems', '[]'::jsonb)) oi;

  insert into waitry.pedidos (
    order_id, status, paid, timestamp, place_id, place_name, table_name,
    layout_name, total_amount, total_discount, service_charge, tax,
    external_delivery_id, notes, last_action_at, content_hash
  ) values (
    v_order_id, v_status, v_paid, v_timestamp, v_place_id, v_place_name, v_table_name,
    v_layout_name, v_total_amount, v_total_discount, v_service_charge, v_tax,
    v_external_delivery_id, v_notes, v_last_action_at, v_content_hash
  )
  on conflict (order_id) do update set
    status = excluded.status,
    paid = excluded.paid,
    timestamp = excluded.timestamp,
    place_id = excluded.place_id,
    place_name = excluded.place_name,
    table_name = excluded.table_name,
    layout_name = excluded.layout_name,
    total_amount = excluded.total_amount,
    total_discount = excluded.total_discount,
    service_charge = excluded.service_charge,
    tax = excluded.tax,
    external_delivery_id = excluded.external_delivery_id,
    notes = excluded.notes,
    last_action_at = excluded.last_action_at,
    content_hash = excluded.content_hash,
    updated_at = now();

  delete from waitry.productos where order_id = v_order_id;
  for item in
    select * from jsonb_array_elements(coalesce(p->'orderItems', '[]'::jsonb))
  loop
    insert into waitry.productos (
      order_id, product_id, product_name, quantity, unit_price, total_price, modifiers, notes
    ) values (
      v_order_id,
      coalesce(item #>> '{item,itemId}', item->>'productId', item->>'itemId', item->>'orderItemId'),
      coalesce(item->>'productName', item->>'name', item #>> '{item,name}', 'Item'),
      coalesce((item->>'quantity')::numeric, (item->>'count')::numeric, 1),
      coalesce((item->>'discountPrice')::numeric, (item->>'price')::numeric, (item #>> '{item,price}')::numeric),
      coalesce((item->>'subtotal')::numeric,
               coalesce((item->>'discountPrice')::numeric, (item->>'price')::numeric, (item #>> '{item,price}')::numeric, 0)
               * coalesce((item->>'quantity')::numeric, (item->>'count')::numeric, 1)),
      coalesce(item->'orderItemVariations', '[]'::jsonb),
      coalesce(item->>'notes', item->>'note', item->>'comment')
    )
    on conflict (order_id, product_id, product_name) do update set
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      modifiers = excluded.modifiers,
      notes = excluded.notes;
  end loop;

  delete from waitry.pagos where order_id = v_order_id;
  for pay in
    select * from jsonb_array_elements(coalesce(p->'payments', '[]'::jsonb))
  loop
    insert into waitry.pagos (
      order_id, payment_id, payment_method, amount, tip, currency, created_at
    ) values (
      v_order_id,
      coalesce(pay->>'paymentId', pay->>'id', pay->>'orderPaymentId'),
      coalesce(pay->>'method', pay->>'type', pay #>> '{paymentType,name}', pay->>'gateway'),
      coalesce((pay->>'amount')::numeric, (pay->>'total')::numeric),
      coalesce((pay->>'tip')::numeric, (pay->>'tipAmount')::numeric, 0),
      coalesce(pay->>'currency', p->>'currency', 'MXN'),
      waitry.to_iso_from_ar(pay->'createdAt')
    )
    on conflict (order_id, payment_id) do update set
      payment_method = excluded.payment_method,
      amount = excluded.amount,
      tip = excluded.tip,
      currency = excluded.currency,
      created_at = excluded.created_at;
  end loop;

  update waitry.inbound
  set processed = true,
      attempts = coalesce(attempts, 0) + 1,
      error = null
  where id = p_row.id;

exception when others then
  update waitry.inbound
  set processed = false,
      attempts = coalesce(attempts, 0) + 1,
      error = sqlerrm
  where id = p_row.id;
  raise;
end;
$$;

create or replace function waitry.trg_process_inbound()
returns trigger
language plpgsql
as $$
begin
  perform waitry.process_inbound_row(new);
  return new;
end;
$$;

drop trigger if exists trg_waitry_inbound_process on waitry.inbound;

create trigger trg_waitry_inbound_process
after insert on waitry.inbound
for each row execute function waitry.trg_process_inbound();
