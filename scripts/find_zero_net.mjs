import { config } from 'dotenv';
config({ path: '/Users/Beto/BSOP/.env.local' });
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find orders where net payments = 0 (product left, no income)
const { data: negPagos } = await supabase
  .schema('rdb').from('waitry_pagos')
  .select('order_id, payment_id, payment_method, amount, created_at')
  .lt('amount', 0);

if (!negPagos?.length) {
  console.log('No negative payments found');
  process.exit(0);
}

const orderIds = [...new Set(negPagos.map(p => p.order_id))];

const { data: allPagos } = await supabase
  .schema('rdb').from('waitry_pagos')
  .select('order_id, payment_id, payment_method, amount, created_at')
  .in('order_id', orderIds)
  .order('created_at');

const { data: pedidos } = await supabase
  .schema('rdb').from('waitry_pedidos')
  .select('order_id, status, total_amount, total_discount, layout_name, table_name, timestamp')
  .in('order_id', orderIds)
  .order('timestamp', { ascending: false });

const paymentsByOrder = {};
for (const pg of allPagos || []) {
  if (!paymentsByOrder[pg.order_id]) paymentsByOrder[pg.order_id] = [];
  paymentsByOrder[pg.order_id].push(pg);
}

// Filter: only orders where net = 0 (no real income)
const zeroNet = (pedidos || []).filter(ped => {
  const pags = paymentsByOrder[ped.order_id] || [];
  const net = pags.reduce((s, p) => s + p.amount, 0);
  return Math.abs(net) < 0.01; // net zero
});

console.log(`=== PEDIDOS CON NETO $0 (producto salió, sin ingreso real) ===`);
console.log(`Total: ${zeroNet.length} pedidos\n`);

for (const ped of zeroNet) {
  const pags = paymentsByOrder[ped.order_id] || [];
  console.log(`Order #${ped.order_id}`);
  console.log(`  Fecha: ${ped.timestamp}`);
  console.log(`  Total: $${ped.total_amount} | Descuento: $${ped.total_discount} | Status: ${ped.status}`);
  console.log(`  Layout: ${ped.layout_name} | Mesa: ${ped.table_name}`);
  for (const pg of pags) {
    const sign = pg.amount >= 0 ? '+' : '';
    console.log(`  💳 ${pg.payment_method}: ${sign}$${pg.amount}`);
  }
  console.log();
}
