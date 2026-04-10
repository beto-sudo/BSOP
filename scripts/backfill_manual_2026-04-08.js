const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createClient } = require('/Users/Beto/BSOP/node_modules/@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ybklderteyhuugzfmxbi.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlia2xkZXJ0ZXlodXVnemZteGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4ODEzMywiZXhwIjoyMDcyMzY0MTMzfQ.ZUMZVuuGl7Eva5AB0jUqT7DqdlVfT0b8odXfPNl-e24';
const CODA_API_KEY = process.env.CODA_API_KEY || '6dd6568f-14b9-41d1-b340-2a1974620fe3';
const CODA_DOC_ID = process.env.CODA_DOC_ID || 'yvrM3UilPt';

const EXCEL_PATH = '/Users/Beto/.openclaw/media/inbound/OrderList_20260409062507_Waitry---929a96e4-3156-4634-bad9-0d6446834868.xlsx';
const PDF_PATH = '/Users/Beto/.openclaw/media/inbound/correcto---cf0f0f32-0ca1-4b74-b041-7cf267c99f45.pdf';
const REPORT_PATH = '/Users/Beto/BSOP/backfill_report_manual_2026-04-08.md';
const EXISTING_ORDER_IDS = new Set(['16798456', '16812418', '16812976', '16813286', '16813291']);
const TARGET_ORDER_IDS = new Set(['16813311', '16813308', '16813307', '16813306', '16813303', '16813301', '16813300', '16813298', '16813292', '16813291', '16813290', '16813289', '16813286', '16813285', '16813281', '16813275', '16813273', '16813272', '16813270', '16813264', '16813260', '16813258', '16813215', '16813171', '16813080', '16813062', '16813042', '16812976', '16812961', '16812956', '16812861', '16812746', '16812418', '16812402', '16812372', '16798456', '16813185']);
const EXTRA_PDF_ORDER_IDS = new Set(['16813185']);
const PLACE_ID = 11145;
const TIME_OFFSET = '-06:00';

const CODA = {
  pedidosTable: 'grid-qrrVxRy-_F',
  productosTable: 'grid-JR7mvLylN_',
  pedidosKeyColumns: ['c-c5XrezM2oo'],
  productosKeyColumns: ['c-Vz_DvOHrnr'],
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function buildUrl(base, pathname, params = {}) {
  const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return url.toString();
}
async function requestJson(url, options = {}, attempt = 1) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (res.status === 429 && attempt <= 6) {
    const retryAfter = Number(res.headers.get('retry-after') || '2');
    await sleep(retryAfter * 1000);
    return requestJson(url, options, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${text}`);
  return text ? JSON.parse(text) : null;
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function supabaseGet(table) {
  const { data, error } = await supabase.schema('rdb').from(table).select('*').limit(1);
  if (error) throw error;
  return data || [];
}
async function supabasePost(table, rows) {
  const { data, error } = await supabase.schema('rdb').from(table).insert(rows).select();
  if (error) throw error;
  return data || [];
}
async function fetchExistingOrderIds(table, orderIds) {
  const found = new Set();
  for (const batch of chunk(orderIds, 200)) {
    const { data, error } = await supabase.schema('rdb').from(table).select('order_id').in('order_id', batch);
    if (error) throw error;
    for (const row of data || []) found.add(String(row.order_id));
  }
  return found;
}
async function fetchExistingProductIds(productIds) {
  const found = new Set();
  for (const batch of chunk(productIds, 200)) {
    const { data, error } = await supabase.schema('rdb').from('waitry_productos').select('product_id').in('product_id', batch);
    if (error) throw error;
    for (const row of data || []) found.add(String(row.product_id));
  }
  return found;
}
let lastCodaWriteAt = 0;
async function codaPost(pathname, body) {
  const wait = Math.max(0, 1000 - (Date.now() - lastCodaWriteAt));
  if (wait) await sleep(wait);
  const result = await requestJson(buildUrl('https://coda.io/apis/v1/', pathname), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CODA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  lastCodaWriteAt = Date.now();
  return result;
}
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number(value.toFixed(2));
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}
function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  const str = String(value ?? '').trim().toLowerCase();
  return ['si', 'sí', 'true', '1', 'yes', 'y', 'pagado', 'cerrado', 'completado'].includes(str);
}
function excelTimestampToIso(value) {
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${TIME_OFFSET}`;
}
function pdfTimestampToIso(value) {
  const m = String(value).match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yy, HH, MM, SS] = m;
  return `20${yy}-${mm}-${dd}T${HH}:${MM}:${SS}${TIME_OFFSET}`;
}
function parseExcelOrders() {
  const py = String.raw`
import json, pandas as pd
path = r'''${EXCEL_PATH}'''
df = pd.read_excel(path, header=1)
df = df.astype(object).where(pd.notnull(df), None)
print(json.dumps(df.to_dict(orient='records'), ensure_ascii=False, default=str, allow_nan=False))`;
  const raw = execFileSync('python3', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const rows = JSON.parse(raw);
  return rows.map((row) => ({
    order_id: String(row['Nr']),
    source: 'excel',
    status: 'order_ended',
    paid: normalizeBool(row['Pagado']),
    timestamp: excelTimestampToIso(row['Hora']),
    place_id: PLACE_ID,
    place_name: row['Punto de acceso'] || null,
    table_name: null,
    layout_name: 'MOSTRADOR',
    total_amount: normalizeNumber(row['Total']),
    total_discount: normalizeNumber(row['Total con descuentos']),
    service_charge: 0,
    tax: 0,
    external_delivery_id: row['Nr. entrega'] ? String(row['Nr. entrega']) : null,
    notes: row['Notas cliente'] || null,
    last_action_at: excelTimestampToIso(row['Hora']),
    usuario: row['Camarero'] || row['Usuario'] || null,
  }));
}
function extractPdfText() {
  try {
    return execFileSync('pdftotext', ['-layout', PDF_PATH, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch {
    const py = String.raw`
from pypdf import PdfReader
reader = PdfReader(r'''${PDF_PATH}''')
print("\n".join(page.extract_text() or '' for page in reader.pages))`;
    return execFileSync('python3', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  }
}
function parseProductsFromBlock(orderId, block, defaultTimestamp, defaultUser) {
  const products = [];
  const lines = block.split(/\r?\n/).map(line => line.replace(/\t/g, '    ').trimEnd());
  let carry = '';
  const flushCandidate = (candidate) => {
    const cleaned = candidate.replace(/\s+/g, ' ').trim();
    if (!cleaned || /^(Cantidad|Producto|Variación|Precio|Subtotal|Cargo de servicio|Total con descuentos|Total)$/i.test(cleaned)) return false;
    const m = cleaned.match(/^(\d+)\s+(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})$/);
    if (!m) return false;
    const [, qty, body, price, subtotal] = m;
    let nombre = body.trim();
    let variacion = null;
    if (nombre.includes(' , ')) {
      const parts = nombre.split(/\s+,\s+/);
      nombre = parts.shift().trim();
      variacion = parts.join(', ').trim() || ',';
    } else {
      const paren = nombre.match(/^(.*?)\s*\((.+)\)$/);
      if (paren) {
        nombre = paren[1].trim();
        variacion = paren[2].trim();
      }
    }
    products.push({
      order_id: orderId,
      nombre,
      variacion,
      cantidad: Number(qty),
      precio: normalizeNumber(price),
      discount_price: normalizeNumber(price),
      subtotal: normalizeNumber(subtotal),
      cancelado: false,
      created_at: defaultTimestamp,
      usuario: defaultUser || null,
    });
    return true;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(Cancelado\s+\d+\s+-\s+Punto de acceso:|Cantidad\b|Producto\b|Variación\b|Precio\b|Subtotal\b|Cargo de servicio\b|Total\b|Total con descuentos\b)/i.test(trimmed)) continue;
    const candidate = `${carry} ${trimmed}`.trim();
    if (flushCandidate(candidate)) {
      carry = '';
      continue;
    }
    if (flushCandidate(trimmed)) {
      carry = '';
      continue;
    }
    if (/^\d+\b/.test(trimmed) || carry) carry = candidate;
  }
  return products.map((p, idx) => ({ ...p, item_id: `${idx + 1}` }));
}
function parsePdfProducts(text, orderMap) {
  const blocks = [...text.matchAll(/Cancelado\s+(\d+)\s+-\s+Punto de acceso:\s*(.*?)\s+-\s+Hora:\s*(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+-\s+Usuario:\s*([\s\S]*?)(?=Cancelado\s+\d+\s+-\s+Punto de acceso:|$)/g)];
  const byOrder = new Map();
  for (const match of blocks) {
    const [, orderId, placeName, timeText, block] = match;
    if (!TARGET_ORDER_IDS.has(orderId)) continue;
    const base = orderMap.get(orderId);
    const headerUserMatch = block.match(/^\s*([^\n]+?)\s*(?:\n|$)/);
    const user = headerUserMatch ? headerUserMatch[1].trim() : (base?.usuario || null);
    const createdAt = base?.timestamp || pdfTimestampToIso(timeText);
    const totalDiscountMatch = block.match(/Total con descuentos\s+(\d+\.\d{2})/i);
    const totalMatch = block.match(/\n\s*Total\s+(\d+\.\d{2})/i);
    const products = parseProductsFromBlock(orderId, block, createdAt, user);
    byOrder.set(orderId, {
      placeName: (base?.place_name || placeName || '').trim() || null,
      timestamp: createdAt,
      user,
      total_amount: normalizeNumber(totalMatch?.[1] || totalDiscountMatch?.[1] || 0),
      total_discount: normalizeNumber(totalDiscountMatch?.[1] || totalMatch?.[1] || 0),
      products,
    });
  }
  return byOrder;
}

function buildExtraOrdersFromPdf(productsByOrder, existingOrders) {
  const existing = new Set(existingOrders.map(o => o.order_id));
  const extras = [];
  for (const orderId of EXTRA_PDF_ORDER_IDS) {
    if (existing.has(orderId)) continue;
    const pdf = productsByOrder.get(orderId);
    if (!pdf) continue;
    extras.push({
      order_id: orderId,
      source: 'pdf',
      status: 'order_ended',
      paid: true,
      timestamp: pdf.timestamp,
      place_id: PLACE_ID,
      place_name: pdf.placeName,
      table_name: null,
      layout_name: 'MOSTRADOR',
      total_amount: pdf.total_amount,
      total_discount: pdf.total_discount,
      service_charge: 0,
      tax: 0,
      external_delivery_id: null,
      notes: null,
      last_action_at: pdf.timestamp,
      usuario: pdf.user || null,
    });
  }
  return extras;
}
async function inspectSupabaseColumns() {
  const [pedidos, productos, inbound, pagos] = await Promise.all([
    supabaseGet('waitry_pedidos', { select: '*', limit: 1 }),
    supabaseGet('waitry_productos', { select: '*', limit: 1 }),
    supabaseGet('waitry_inbound', { select: '*', limit: 1 }),
    supabaseGet('waitry_pagos', { select: '*', limit: 1 }),
  ]);
  return {
    waitry_pedidos: Object.keys(pedidos[0] || {}),
    waitry_productos: Object.keys(productos[0] || {}),
    waitry_inbound: Object.keys(inbound[0] || {}),
    waitry_pagos: Object.keys(pagos[0] || {}),
  };
}
function mapPedidoForSupabase(order) {
  return {
    order_id: order.order_id,
    status: order.status,
    paid: order.paid,
    timestamp: order.timestamp,
    place_id: String(order.place_id),
    place_name: order.place_name,
    table_name: order.table_name,
    layout_name: order.layout_name,
    total_amount: order.total_amount,
    total_discount: order.total_discount,
    service_charge: order.service_charge,
    tax: order.tax,
    external_delivery_id: order.external_delivery_id,
    notes: order.notes,
    last_action_at: order.last_action_at,
  };
}
function mapProductoForSupabase(product) {
  return {
    order_id: product.order_id,
    product_id: `${product.order_id}:${product.item_id}`,
    product_name: product.variacion ? `${product.nombre} (${product.variacion})` : product.nombre,
    quantity: product.cantidad,
    unit_price: product.precio,
    total_price: product.subtotal,
    modifiers: product.variacion ? [product.variacion] : [],
    notes: null,
    created_at: product.created_at,
  };
}
function mapInboundForSupabase(order) {
  return {
    order_id: order.order_id,
    event: 'order_ended',
    payload_json: { backfill: true, order_id: order.order_id, source: 'manual_2026-04-08', paid: order.paid },
    payload_hash: sha256(order.order_id),
    received_at: order.timestamp,
    processed: true,
    attempts: 1,
  };
}
function pedidoCells(order) {
  return [
    { column: 'c-c5XrezM2oo', value: String(order.order_id) },
    { column: 'c-xbkZ__XlCn', value: 'order_ended' },
    { column: 'c-MVL9iNtzDN', value: order.paid },
    { column: 'c-9e3LGnM8Xt', value: order.timestamp },
    { column: 'c-1love2nACV', value: PLACE_ID },
    { column: 'c-PSR2hD-Bgd', value: order.place_name || '' },
    { column: 'c-G1M9EA9UnI', value: '' },
    { column: 'c-VG6OClX0SJ', value: 'MOSTRADOR' },
    { column: 'c-F1bs1TAYEe', value: order.total_amount },
    { column: 'c-gf0_uIbSrU', value: order.total_discount },
    { column: 'c-xCAZbSULl1', value: 0 },
    { column: 'c-T_5TNYryCM', value: 0 },
    { column: 'c-bViSP899JZ', value: order.notes || '' },
    { column: 'c-XQ-c9WPDD5', value: order.last_action_at },
  ];
}
function productoCells(product, orderTimestamp) {
  return [
    { column: 'c-Vz_DvOHrnr', value: `${product.order_id}:${product.item_id}` },
    { column: 'c-8BiNoBFp3J', value: String(product.order_id) },
    { column: 'c-R3oGZGYXmj', value: String(product.item_id) },
    { column: 'c--crdKQfErD', value: product.variacion ? `${product.nombre} (${product.variacion})` : product.nombre },
    { column: 'c-Bd5BfhWt--', value: product.cantidad },
    { column: 'c-th_hOTIDhk', value: product.precio },
    { column: 'c-feUk588nG3', value: product.discount_price },
    { column: 'c-DFU8inaAyP', value: product.subtotal },
    { column: 'c-yh4CA1bvYC', value: false },
    { column: 'c-2NBuwn9z7i', value: orderTimestamp },
  ];
}
async function upsertCodaRows(tableId, keyColumns, rows) {
  let processed = 0;
  for (const batch of chunk(rows, 10)) {
    await codaPost(`docs/${CODA_DOC_ID}/tables/${tableId}/rows`, {
      disableParsing: true,
      keyColumns,
      rows: batch.map(cells => ({ cells })),
    });
    processed += batch.length;
  }
  return processed;
}
(async function main() {
  const summary = { errors: [] };
  try {
    const inspected = await inspectSupabaseColumns();
    const excelOrders = parseExcelOrders().filter(o => TARGET_ORDER_IDS.has(o.order_id) && !EXTRA_PDF_ORDER_IDS.has(o.order_id));
    const initialOrderMap = new Map(excelOrders.map(o => [o.order_id, o]));
    const pdfText = extractPdfText();
    const productsByOrder = parsePdfProducts(pdfText, initialOrderMap);
    const extraOrders = buildExtraOrdersFromPdf(productsByOrder, excelOrders);
    const orders = [...excelOrders, ...extraOrders].sort((a, b) => a.order_id.localeCompare(b.order_id));

    const missingOrders = orders.filter(o => !EXISTING_ORDER_IDS.has(o.order_id));
    const existingPedidos = await fetchExistingOrderIds('waitry_pedidos', missingOrders.map(o => o.order_id));
    const existingInbound = await fetchExistingOrderIds('waitry_inbound', missingOrders.map(o => o.order_id));
    const pedidoRows = missingOrders.filter(o => !existingPedidos.has(o.order_id)).map(mapPedidoForSupabase);
    const inboundRows = missingOrders.filter(o => !existingInbound.has(o.order_id)).map(mapInboundForSupabase);
    const productoRows = orders.flatMap(order => (productsByOrder.get(order.order_id)?.products || []).map(mapProductoForSupabase));
    const existingProductIds = await fetchExistingProductIds(productoRows.map(p => p.product_id));
    const newProductoRows = productoRows.filter(p => !existingProductIds.has(p.product_id));

    const insertedPedidos = pedidoRows.length ? await supabasePost('waitry_pedidos', pedidoRows) : [];
    const insertedInbound = inboundRows.length ? await supabasePost('waitry_inbound', inboundRows) : [];
    let insertedProductos = [];
    if (newProductoRows.length) {
      for (const batch of chunk(newProductoRows, 200)) {
        const batchResult = await supabasePost('waitry_productos', batch);
        insertedProductos.push(...batchResult);
      }
    }

    const codaPedidoRows = orders.map(pedidoCells);
    const codaProductoRows = orders.flatMap(order => (productsByOrder.get(order.order_id)?.products || []).map(product => productoCells(product, order.timestamp)));
    const codaPedidosCount = codaPedidoRows.length ? await upsertCodaRows(CODA.pedidosTable, CODA.pedidosKeyColumns, codaPedidoRows) : 0;
    const codaProductosCount = codaProductoRows.length ? await upsertCodaRows(CODA.productosTable, CODA.productosKeyColumns, codaProductoRows) : 0;

    const withProducts = orders.filter(o => (productsByOrder.get(o.order_id)?.products || []).length > 0).map(o => o.order_id);
    const withoutProducts = orders.filter(o => !((productsByOrder.get(o.order_id)?.products || []).length > 0)).map(o => o.order_id);

    const report = `# Backfill manual Waitry 2026-04-08\n\n- PDF fuente usado: ${PDF_PATH}\n- Pedidos parseados del Excel: ${excelOrders.length}\n- Pedidos extra recuperados solo desde PDF: ${extraOrders.length} (${extraOrders.map(o => o.order_id).join(', ') || 'ninguno'})\n- Pedidos totales procesados: ${orders.length}\n- Pedidos ya existentes/skip en Supabase: ${EXISTING_ORDER_IDS.size} (${[...EXISTING_ORDER_IDS].join(', ')})\n- Pedidos insertados en Supabase (rdb.waitry_pedidos): ${insertedPedidos.length}\n- Productos insertados en Supabase (rdb.waitry_productos): ${insertedProductos.length}\n- Registros insertados en Supabase (rdb.waitry_inbound): ${insertedInbound.length}\n- Pagos insertados en Supabase (rdb.waitry_pagos): 0 (sin datos fuente utilizables)\n- Filas upserted en Coda Pedidos: ${codaPedidosCount}\n- Filas upserted en Coda Productos: ${codaProductosCount}\n- Pedidos con productos extraídos del PDF: ${withProducts.length}\n- Pedidos sin datos de productos en PDF: ${withoutProducts.length}\n\n## Pedidos con productos en PDF\n${withProducts.map(id => `- ${id}`).join('\n') || '- Ninguno'}\n\n## Pedidos sin productos en PDF\n${withoutProducts.map(id => `- ${id}`).join('\n') || '- Ninguno'}\n\n## Columnas detectadas por GET en Supabase\n- rdb.waitry_pedidos: ${inspected.waitry_pedidos.join(', ')}\n- rdb.waitry_productos: ${inspected.waitry_productos.join(', ')}\n- rdb.waitry_inbound: ${inspected.waitry_inbound.join(', ')}\n- rdb.waitry_pagos: ${inspected.waitry_pagos.join(', ')}\n\n## Errores\n- Ninguno\n`;
    fs.writeFileSync(REPORT_PATH, report, 'utf8');

    console.log(JSON.stringify({
      ordersParsed: orders.length,
      excelOrdersParsed: excelOrders.length,
      extraOrdersParsed: extraOrders.length,
      supabaseOrdersInserted: insertedPedidos.length,
      supabaseProductsInserted: insertedProductos.length,
      supabaseInboundInserted: insertedInbound.length,
      codaPedidosUpserted: codaPedidosCount,
      codaProductosUpserted: codaProductosCount,
      withProducts: withProducts.length,
      withoutProducts: withoutProducts.length,
      reportPath: REPORT_PATH,
    }, null, 2));
  } catch (error) {
    const failure = `# Backfill manual Waitry 2026-04-08\n\n## Error\n- ${error.stack || error.message}\n`;
    fs.writeFileSync(REPORT_PATH, failure, 'utf8');
    console.error(error);
    process.exit(1);
  }
})();
