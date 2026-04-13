import { config } from 'dotenv';
config({ path: '/Users/Beto/BSOP/.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: cashNegs, error: negError } = await supabase
  .schema('rdb').from('waitry_pagos')
  .select('order_id, payment_id, payment_method, amount, created_at')
  .eq('payment_method', 'cash')
  .lt('amount', 0);

if (negError) throw negError;
if (!cashNegs?.length) {
  console.log(JSON.stringify({ totalOrders: 0, rows: [] }, null, 2));
  process.exit(0);
}

const orderIds = [...new Set(cashNegs.map(p => p.order_id))];

const [{ data: pagos, error: pagosError }, { data: pedidos, error: pedidosError }, { data: productos, error: productosError }] = await Promise.all([
  supabase.schema('rdb').from('waitry_pagos')
    .select('order_id, payment_id, payment_method, amount, created_at')
    .in('order_id', orderIds)
    .order('created_at'),
  supabase.schema('rdb').from('waitry_pedidos')
    .select('order_id, status, total_amount, total_discount, layout_name, table_name, timestamp')
    .in('order_id', orderIds)
    .order('timestamp', { ascending: false }),
  supabase.schema('rdb').from('waitry_productos')
    .select('order_id, product_id, quantity, total_price')
    .in('order_id', orderIds)
]);

if (pagosError) throw pagosError;
if (pedidosError) throw pedidosError;
if (productosError) throw productosError;

const pagosByOrder = new Map();
for (const p of pagos || []) {
  if (!pagosByOrder.has(p.order_id)) pagosByOrder.set(p.order_id, []);
  pagosByOrder.get(p.order_id).push(p);
}

const productosByOrder = new Map();
for (const pr of productos || []) {
  if (!productosByOrder.has(pr.order_id)) productosByOrder.set(pr.order_id, []);
  productosByOrder.get(pr.order_id).push(pr);
}

const rows = [];
for (const ped of pedidos || []) {
  const orderPagos = pagosByOrder.get(ped.order_id) || [];
  const orderProductos = productosByOrder.get(ped.order_id) || [];

  const cardPos = orderPagos.filter(p => p.amount > 0 && p.payment_method !== 'cash');
  const cashNeg = orderPagos.filter(p => p.payment_method === 'cash' && p.amount < 0);

  if (!cardPos.length || !cashNeg.length || !orderProductos.length) continue;

  const totalPositive = orderPagos.filter(p => p.amount > 0).reduce((s, p) => s + Number(p.amount), 0);
  const totalNegative = orderPagos.filter(p => p.amount < 0).reduce((s, p) => s + Number(p.amount), 0);
  const netPayments = totalPositive + totalNegative;

  const exactCashBackMatch = cashNeg.some(neg =>
    cardPos.some(card => Math.abs(Number(card.amount) - Math.abs(Number(neg.amount))) < 0.01)
  );

  const cardMethods = [...new Set(cardPos.map(p => p.payment_method))].join(', ');
  const cardAmount = cardPos.reduce((s, p) => s + Number(p.amount), 0);
  const cashReturned = Math.abs(cashNeg.reduce((s, p) => s + Number(p.amount), 0));
  const productLines = orderProductos.length;
  const productTotal = orderProductos.reduce((s, p) => s + Number(p.total_price || 0), 0);

  rows.push({
    order_id: ped.order_id,
    timestamp: ped.timestamp,
    status: ped.status,
    layout_name: ped.layout_name,
    table_name: ped.table_name,
    total_amount: Number(ped.total_amount),
    total_discount: Number(ped.total_discount || 0),
    product_lines: productLines,
    product_total: Number(productTotal.toFixed(2)),
    card_methods: cardMethods,
    card_amount: Number(cardAmount.toFixed(2)),
    cash_returned: Number(cashReturned.toFixed(2)),
    net_payments: Number(netPayments.toFixed(2)),
    exact_cashback_match: exactCashBackMatch,
    payments: orderPagos.map(p => ({ method: p.payment_method, amount: Number(p.amount), created_at: p.created_at }))
  });
}

rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

const exact = rows.filter(r => r.exact_cashback_match);
const zeroNet = exact.filter(r => Math.abs(r.net_payments) < 0.01);
const partialNet = exact.filter(r => Math.abs(r.net_payments) >= 0.01);

console.log(JSON.stringify({
  totalOrdersWithCardAndCashReturn: rows.length,
  exactCardCashMatch: exact.length,
  zeroNet: zeroNet.length,
  partialNet: partialNet.length,
  rows: exact
}, null, 2));
