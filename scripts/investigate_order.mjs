import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '/Users/Beto/BSOP/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const orderId = '16862115';

const { data: pedido } = await supabase
  .schema('rdb').from('waitry_pedidos').select('*').eq('order_id', orderId).single();
console.log('=== PEDIDO ===');
console.log(JSON.stringify(pedido, null, 2));

const { data: productos } = await supabase
  .schema('rdb').from('waitry_productos').select('*').eq('order_id', orderId);
console.log('\n=== PRODUCTOS ===');
console.log(JSON.stringify(productos, null, 2));

const { data: pagos } = await supabase
  .schema('rdb').from('waitry_pagos').select('*').eq('order_id', orderId);
console.log('\n=== PAGOS ===');
console.log(JSON.stringify(pagos, null, 2));

const { data: inbound } = await supabase
  .schema('rdb').from('waitry_inbound').select('*').textSearch('payload', orderId).limit(20);
console.log('\n=== INBOUND (' + (inbound?.length ?? 0) + ' rows) ===');
if (inbound) {
  for (const row of inbound) {
    console.log('--- event:', row.event_type, '| created:', row.created_at);
    console.log(JSON.stringify(row.payload, null, 2));
  }
}
