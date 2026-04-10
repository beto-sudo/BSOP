const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CODA_API_KEY = process.env.CODA_API_KEY;
const CODA_DOC_ID = process.env.CODA_DOC_ID;

const DATE_START = '2026-04-08T00:00:00Z';
const DATE_END = '2026-04-09T00:00:00Z';
const REPORT_PATH = '/Users/Beto/BSOP/backfill_report_2026-04-08.md';

const CODA = {
  pedidosTable: 'grid-qrrVxRy-_F',
  productosTable: 'grid-JR7mvLylN_',
  pagosTable: 'grid-NVkBKyMZAd',
  pedidos: {
    idPedido: 'c-c5XrezM2oo',
    status: 'c-xbkZ__XlCn',
    paid: 'c-MVL9iNtzDN',
    timestamp: 'c-9e3LGnM8Xt',
    placeId: 'c-1love2nACV',
    placeName: 'c-PSR2hD-Bgd',
    tableName: 'c-G1M9EA9UnI',
    layoutName: 'c-VG6OClX0SJ',
    totalAmount: 'c-F1bs1TAYEe',
    totalDiscount: 'c-gf0_uIbSrU',
    serviceCharge: 'c-xCAZbSULl1',
    tax: 'c-T_5TNYryCM',
    extDeliveryId: 'c-JtXbilGjP9',
    notes: 'c-bViSP899JZ',
    lastActionAt: 'c-XQ-c9WPDD5',
  },
  productos: {
    pk: 'c-Vz_DvOHrnr',
    idPedido: 'c-8BiNoBFp3J',
    itemId: 'c-R3oGZGYXmj',
    nombre: 'c--crdKQfErD',
    cantidad: 'c-Bd5BfhWt--',
    precio: 'c-th_hOTIDhk',
    discountPrice: 'c-feUk588nG3',
    subtotal: 'c-DFU8inaAyP',
    cancelado: 'c-yh4CA1bvYC',
    timestamp: 'c-2NBuwn9z7i',
    usuario: 'c-E9ZG50UuaC',
  },
  pagos: {
    pk: 'c-Sielbb-7s8',
    idPedido: 'c-rCZLJSEYAl',
    gateway: 'c-mYztdmvKfT',
    methodType: 'c--r7N1AJn1t',
    amount: 'c-cCW_YxwB72',
    status: 'c-0AAz8tyBGv',
    createdAt: 'c-m4D-2Yqubc',
    esRefund: 'c-QpwfCbA3KO',
  },
};

function assertEnv(name, value) {
  if (!value) throw new Error(`Missing env var ${name}`);
}

['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CODA_API_KEY', 'CODA_DOC_ID'].forEach((name) => assertEnv(name, process.env[name]));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(base, pathname, params = {}) {
  const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestJson(url, options = {}, attempt = 1) {
  const res = await fetch(url, options);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get('retry-after') || '2');
    await sleep(retryAfter * 1000);
    return requestJson(url, options, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${text}`);
  }

  return body;
}

async function codaGet(pathname, params = {}) {
  const url = buildUrl('https://coda.io/apis/v1/', pathname, params);
  return requestJson(url, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
}

let lastCodaWriteAt = 0;
async function codaPost(pathname, body) {
  const wait = Math.max(0, 1000 - (Date.now() - lastCodaWriteAt));
  if (wait) await sleep(wait);
  const url = buildUrl('https://coda.io/apis/v1/', pathname);
  const result = await requestJson(url, {
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

async function supabaseGet(table, params = {}) {
  const url = buildUrl(`${SUPABASE_URL}/rest/v1/`, table, params);
  return requestJson(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Accept-Profile': 'rdb',
    },
  });
}

async function fetchAllCodaRows(tableId) {
  const rows = [];
  let pageToken;
  do {
    const data = await codaGet(`docs/${CODA_DOC_ID}/tables/${tableId}/rows`, {
      valueFormat: 'simple',
      limit: 500,
      pageToken,
      useColumnNames: false,
    });
    rows.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return rows;
}

function inFilter(values) {
  return `in.(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return value !== 0;
  const str = String(value).toLowerCase();
  return ['true', 't', '1', 'yes', 'y', 'paid', 'cancelado'].includes(str);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isDateInRange(value) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return ts >= new Date(DATE_START).getTime() && ts < new Date(DATE_END).getTime();
}

function orderCells(order) {
  return [
    { column: CODA.pedidos.idPedido, value: String(order.order_id) },
    { column: CODA.pedidos.status, value: order.status ?? '' },
    { column: CODA.pedidos.paid, value: normalizeBool(order.paid) },
    { column: CODA.pedidos.timestamp, value: order.created_at ?? null },
    { column: CODA.pedidos.placeId, value: order.place_id ?? '' },
    { column: CODA.pedidos.placeName, value: order.place_name ?? '' },
    { column: CODA.pedidos.tableName, value: order.table_name ?? '' },
    { column: CODA.pedidos.layoutName, value: order.layout_name ?? '' },
    { column: CODA.pedidos.totalAmount, value: normalizeNumber(order.total_amount) },
    { column: CODA.pedidos.totalDiscount, value: normalizeNumber(order.total_discount) },
    { column: CODA.pedidos.serviceCharge, value: normalizeNumber(order.service_charge) },
    { column: CODA.pedidos.tax, value: normalizeNumber(order.tax) },
    { column: CODA.pedidos.extDeliveryId, value: order.ext_delivery_id ?? '' },
    { column: CODA.pedidos.notes, value: order.notes ?? '' },
    { column: CODA.pedidos.lastActionAt, value: order.last_action_at ?? null },
  ];
}

function productCells(product) {
  const pk = `${product.order_id}:${product.item_id}`;
  return [
    { column: CODA.productos.pk, value: pk },
    { column: CODA.productos.idPedido, value: String(product.order_id) },
    { column: CODA.productos.itemId, value: String(product.item_id) },
    { column: CODA.productos.nombre, value: product.nombre ?? '' },
    { column: CODA.productos.cantidad, value: normalizeNumber(product.cantidad) },
    { column: CODA.productos.precio, value: normalizeNumber(product.precio) },
    { column: CODA.productos.discountPrice, value: normalizeNumber(product.discount_price) },
    { column: CODA.productos.subtotal, value: normalizeNumber(product.subtotal) },
    { column: CODA.productos.cancelado, value: normalizeBool(product.cancelado) },
    { column: CODA.productos.timestamp, value: product.created_at ?? null },
    { column: CODA.productos.usuario, value: product.usuario ?? '' },
  ];
}

function paymentCells(payment) {
  const rawPaymentId = payment.payment_id ?? payment.id ?? payment.paymentId ?? 'unknown';
  const pk = `${payment.order_id}:${rawPaymentId}`;
  return [
    { column: CODA.pagos.pk, value: pk },
    { column: CODA.pagos.idPedido, value: String(payment.order_id) },
    { column: CODA.pagos.gateway, value: payment.gateway ?? 'Waitry' },
    { column: CODA.pagos.methodType, value: payment.metodo ?? payment.method ?? payment.type ?? '' },
    { column: CODA.pagos.amount, value: normalizeNumber(payment.monto ?? payment.amount) },
    { column: CODA.pagos.status, value: payment.status ?? '' },
    { column: CODA.pagos.createdAt, value: payment.created_at ?? null },
    { column: CODA.pagos.esRefund, value: normalizeBool(payment.es_refund ?? payment.esRefund) },
  ];
}

async function upsertRows(tableId, keyColumns, rows) {
  for (const batch of chunk(rows, 10)) {
    await codaPost(`docs/${CODA_DOC_ID}/tables/${tableId}/rows`, {
      disableParsing: true,
      keyColumns,
      rows: batch.map((cells) => ({ cells })),
    });
  }
}

(async function main() {
  const errors = [];
  const summary = {
    rdbOrders: 0,
    codaExisting: 0,
    insertedOrders: 0,
    insertedProducts: 0,
    insertedPayments: 0,
    missingOrderIds: [],
  };

  try {
    const codaRows = await fetchAllCodaRows(CODA.pedidosTable);
    const existingIds = new Set(
      codaRows
        .filter((row) => isDateInRange(row.values?.[CODA.pedidos.timestamp]))
        .map((row) => row.values?.[CODA.pedidos.idPedido])
        .filter(Boolean)
        .map(String)
    );
    summary.codaExisting = existingIds.size;

    const orders = await supabaseGet('waitry_pedidos', {
      select: '*',
      and: `(created_at.gte.${DATE_START},created_at.lt.${DATE_END})`,
      order: 'created_at.asc',
      limit: 1000,
    });
    summary.rdbOrders = orders.length;

    const missingOrders = orders.filter((order) => !existingIds.has(String(order.order_id)));
    summary.insertedOrders = missingOrders.length;
    summary.missingOrderIds = missingOrders.map((o) => String(o.order_id));

    let products = [];
    let payments = [];
    if (missingOrders.length) {
      const orderIds = missingOrders.map((o) => String(o.order_id));
      for (const ids of chunk(orderIds, 25)) {
        const [productChunk, paymentChunk] = await Promise.all([
          supabaseGet('waitry_productos', {
            select: '*',
            order_id: inFilter(ids),
            order: 'created_at.asc',
            limit: 5000,
          }),
          supabaseGet('waitry_pagos', {
            select: '*',
            order_id: inFilter(ids),
            order: 'created_at.asc',
            limit: 5000,
          }),
        ]);
        products.push(...productChunk);
        payments.push(...paymentChunk);
      }
    }

    summary.insertedProducts = products.length;
    summary.insertedPayments = payments.length;

    if (missingOrders.length) {
      await upsertRows(CODA.pedidosTable, [CODA.pedidos.idPedido], missingOrders.map(orderCells));
      await upsertRows(CODA.productosTable, [CODA.productos.pk], products.map(productCells));
      await upsertRows(CODA.pagosTable, [CODA.pagos.pk], payments.map(paymentCells));
    }
  } catch (error) {
    errors.push(error.stack || String(error));
  }

  const report = [
    '# Backfill report 2026-04-08',
    '',
    `- RDB pedidos ayer: ${summary.rdbOrders}`,
    `- Ya existentes en Coda: ${summary.codaExisting}`,
    `- Pedidos insertados/upserted: ${summary.insertedOrders}`,
    `- Productos insertados/upserted: ${summary.insertedProducts}`,
    `- Pagos insertados/upserted: ${summary.insertedPayments}`,
    '',
    '## Order IDs procesados',
    summary.missingOrderIds.length ? summary.missingOrderIds.join(', ') : '_Ninguno_',
    '',
    '## Errores',
    errors.length ? errors.map((err, i) => `${i + 1}. ${err}`).join('\n\n') : '_Sin errores_',
    '',
    `Generado: ${new Date().toISOString()}`,
  ].join('\n');

  fs.writeFileSync(REPORT_PATH, report);
  console.log(JSON.stringify({ summary, errors, reportPath: REPORT_PATH }, null, 2));

  if (errors.length) process.exit(1);
})();
