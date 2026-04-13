import { config } from 'dotenv';
config({ path: '/Users/Beto/BSOP/.env.local' });
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: cashNegs } = await supabase.schema('rdb').from('waitry_pagos').select('order_id').eq('payment_method','cash').lt('amount',0);
const orderIds=[...new Set((cashNegs||[]).map(x=>x.order_id))];
const [{data: pagos},{data: pedidos},{data: productos}] = await Promise.all([
 supabase.schema('rdb').from('waitry_pagos').select('order_id,payment_method,amount,created_at').in('order_id',orderIds).order('created_at'),
 supabase.schema('rdb').from('waitry_pedidos').select('order_id,total_amount,total_discount,timestamp,layout_name,table_name,status').in('order_id',orderIds).order('timestamp',{ascending:false}),
 supabase.schema('rdb').from('waitry_productos').select('order_id,id,product_name,quantity,total_price').in('order_id',orderIds)
]);
const pb={}, pr={};
for (const p of pagos||[]) (pb[p.order_id]??=[]).push(p);
for (const r of productos||[]) (pr[r.order_id]??=[]).push(r);
const rows=[];
for (const ped of pedidos||[]) {
 const ps=pb[ped.order_id]||[];
 const products=pr[ped.order_id]||[];
 if (!products.length) continue;
 const cardPos=ps.filter(p=>p.amount>0 && p.payment_method!=='cash');
 const cashNeg=ps.filter(p=>p.amount<0 && p.payment_method==='cash');
 if (!cardPos.length || !cashNeg.length) continue;
 const net=ps.reduce((s,p)=>s+Number(p.amount),0);
 const cardAmount=cardPos.reduce((s,p)=>s+Number(p.amount),0);
 const cashReturned=Math.abs(cashNeg.reduce((s,p)=>s+Number(p.amount),0));
 const exact=cashNeg.some(n=>cardPos.some(c=>Math.abs(Number(c.amount)-Math.abs(Number(n.amount)))<0.01));
 rows.push({
   order_id: ped.order_id,
   timestamp: ped.timestamp,
   status: ped.status,
   layout_name: ped.layout_name,
   table_name: ped.table_name,
   total_amount: Number(ped.total_amount),
   total_discount: Number(ped.total_discount || 0),
   card_methods: [...new Set(cardPos.map(p=>p.payment_method))].join(', '),
   card_amount: Number(cardAmount.toFixed(2)),
   cash_returned: Number(cashReturned.toFixed(2)),
   net_payments: Number(net.toFixed(2)),
   exact_card_cash_match: exact ? 'yes' : 'no',
   product_lines: products.length,
   product_total: Number(products.reduce((s,p)=>s+Number(p.total_price||0),0).toFixed(2)),
   products: products.map(p=>`${p.product_name} x${p.quantity}`).join(' | '),
   payments: ps.map(p=>`${p.payment_method}:${p.amount}`).join(' | ')
 });
}
rows.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
const headers=Object.keys(rows[0]||{});
const esc=(v)=>String(v ?? '').replaceAll('\t',' ').replaceAll('\n',' ');
const tsv=[headers.join('\t'), ...rows.map(r=>headers.map(h=>esc(r[h])).join('\t'))].join('\n');
fs.mkdirSync('/Users/Beto/BSOP/tmp', { recursive: true });
fs.writeFileSync('/Users/Beto/BSOP/tmp/card_cash_reversals.tsv', tsv);
console.log(`/Users/Beto/BSOP/tmp/card_cash_reversals.tsv`);
console.log(`rows=${rows.length}`);
