import { config } from 'dotenv';
config({ path: '/Users/Beto/BSOP/.env.local' });
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Query: find orders with positive + negative payments (reversal pattern)
// Using raw SQL via rpc or direct query approach
const { data, error } = await supabase.rpc('sql', {
  query: `
    WITH reversal_orders AS (
      SELECT 
        p.order_id,
        p.status,
        p.total_amount,
        p.total_discount,
        p.layout_name,
        p.table_name,
        p.timestamp,
        COUNT(*) FILTER (WHERE pg.amount > 0) AS positive_payments,
        COUNT(*) FILTER (WHERE pg.amount < 0) AS negative_payments,
        SUM(pg.amount) AS net_payments,
        json_agg(
          json_build_object(
            'payment_id', pg.payment_id,
            'method', pg.payment_method,
            'amount', pg.amount,
            'created_at', pg.created_at
          ) ORDER BY pg.created_at
        ) AS payments
      FROM rdb.waitry_pedidos p
      JOIN rdb.waitry_pagos pg ON pg.order_id = p.order_id
      GROUP BY p.order_id, p.status, p.total_amount, p.total_discount,
               p.layout_name, p.table_name, p.timestamp
      HAVING COUNT(*) FILTER (WHERE pg.amount > 0) > 0
         AND COUNT(*) FILTER (WHERE pg.amount < 0) > 0
    )
    SELECT * FROM reversal_orders
    ORDER BY timestamp DESC;
  `,
});

if (error) {
  // Fallback: do it client-side
  console.log('RPC not available, doing client-side query...');

  // Get all payments with negative amounts
  const { data: negPagos } = await supabase
    .schema('rdb')
    .from('waitry_pagos')
    .select('order_id, payment_id, payment_method, amount, created_at')
    .lt('amount', 0);

  if (!negPagos?.length) {
    console.log('No negative payments found');
    process.exit(0);
  }

  console.log(
    `Found ${negPagos.length} negative payments across ${new Set(negPagos.map((p) => p.order_id)).size} orders\n`
  );

  const orderIds = [...new Set(negPagos.map((p) => p.order_id))];

  // Get full payment details for these orders
  const { data: allPagos } = await supabase
    .schema('rdb')
    .from('waitry_pagos')
    .select('order_id, payment_id, payment_method, amount, created_at')
    .in('order_id', orderIds)
    .order('created_at');

  const { data: pedidos } = await supabase
    .schema('rdb')
    .from('waitry_pedidos')
    .select('order_id, status, total_amount, total_discount, layout_name, table_name, timestamp')
    .in('order_id', orderIds)
    .order('timestamp', { ascending: false });

  // Group payments by order
  const paymentsByOrder = {};
  for (const pg of allPagos || []) {
    if (!paymentsByOrder[pg.order_id]) paymentsByOrder[pg.order_id] = [];
    paymentsByOrder[pg.order_id].push(pg);
  }

  for (const ped of pedidos || []) {
    const pags = paymentsByOrder[ped.order_id] || [];
    const net = pags.reduce((s, p) => s + p.amount, 0);
    console.log(`=== Order #${ped.order_id} ===`);
    console.log(
      `  Status: ${ped.status} | Total: $${ped.total_amount} | Discount: $${ped.total_discount} | Net payments: $${net}`
    );
    console.log(`  Layout: ${ped.layout_name} | Table: ${ped.table_name} | Time: ${ped.timestamp}`);
    for (const pg of pags) {
      const sign = pg.amount >= 0 ? '+' : '';
      console.log(`  💳 ${pg.payment_method}: ${sign}$${pg.amount} (${pg.payment_id})`);
    }
    console.log();
  }
} else {
  console.log(JSON.stringify(data, null, 2));
}
