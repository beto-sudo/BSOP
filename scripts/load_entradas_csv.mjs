import fs from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = 'https://ybklderteyhuugzfmxbi.supabase.co';
const ENV_PATH = '/Users/Beto/BSOP/.env.local';
const CSV_PATH = '/Users/Beto/.openclaw/media/inbound/Entradas_2---d87faa3a-359b-4741-8e3a-8e41af9ba153.csv';
const BATCH_SIZE = 200;

function parseEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      continue;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((r) => r.some((value) => value !== ''))
    .map((r) => Object.fromEntries(headers.map((header, idx) => [header, r[idx] ?? ''])));
}

function parseMoney(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseQuantity(value) {
  const cleaned = String(value ?? '').replace(/[,\s]/g, '');
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseCsvDate(value) {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) throw new Error(`Fecha inválida: ${value}`);
  let [, month, day, year, hour, minute, meridiem] = match;
  let h = Number(hour);
  if (meridiem.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
  const iso = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), h, Number(minute), 0)).toISOString();
  return iso;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchTable(serviceRoleKey, table, select, limit = 2000) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Accept-Profile': 'rdb',
    },
  });

  if (!response.ok) {
    throw new Error(`Error fetching ${table}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function insertBatch(serviceRoleKey, batch, batchNumber) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/inventario_movimientos`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'rdb',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Batch ${batchNumber} failed (${response.status}): ${body}`);
  }
}

async function main() {
  const env = parseEnv(await fs.readFile(ENV_PATH, 'utf8'));
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no encontrado');

  const csvText = await fs.readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(csvText);
  const products = await fetchTable(serviceRoleKey, 'productos', 'id,nombre');
  const ordenesCompra = await fetchTable(serviceRoleKey, 'ordenes_compra', 'id,folio');

  const exactMap = new Map();
  const lowerMap = new Map();
  for (const product of products) {
    if (!product?.nombre || !product?.id) continue;
    exactMap.set(product.nombre, product.id);
    lowerMap.set(product.nombre.toLowerCase(), product.id);
  }

  const ocMap = new Map();
  for (const oc of ordenesCompra) {
    if (!oc?.id || !oc?.folio) continue;
    ocMap.set(String(oc.folio).trim(), oc.id);
  }

  const skippedMissing = new Set();
  const skippedOc = new Set();
  const prepared = [];
  let zeroQuantitySkipped = 0;
  let processed = 0;

  for (const row of rows) {
    processed++;
    const cantidad = parseQuantity(row['Cantidad Recibida']);
    if (cantidad === 0) {
      zeroQuantitySkipped++;
      continue;
    }

    const productName = String(row['Producto'] ?? '').trim();
    const productoId = exactMap.get(productName) ?? lowerMap.get(productName.toLowerCase());
    if (!productoId) {
      skippedMissing.add(productName);
      continue;
    }

    const ocFolio = String(row['Orden de Compra'] ?? '').trim();
    const ocId = ocFolio ? (ocMap.get(ocFolio) ?? null) : null;
    if (ocFolio && !ocId) skippedOc.add(ocFolio);

    prepared.push({
      producto_id: productoId,
      tipo: String(row['Tipo Movimiento'] ?? '').trim() === 'Ajuste' ? 'ajuste' : 'entrada',
      cantidad,
      costo_unitario: parseMoney(row['Precio Unitario']),
      fecha: parseCsvDate(row['Fecha Entrada']),
      oc_id: ocId,
      notas: String(row['Notas'] ?? '').trim() || null,
    });
  }

  const batches = chunk(prepared, BATCH_SIZE);
  let inserted = 0;
  const batchErrors = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNumber = i + 1;
    try {
      await insertBatch(serviceRoleKey, batch, batchNumber);
      inserted += batch.length;
      console.log(`Batch ${batchNumber}/${batches.length} insertado: ${batch.length}`);
    } catch (error) {
      batchErrors.push(error.message);
      console.error(error.message);
    }
  }

  const summary = {
    csv_path: CSV_PATH,
    total_filas_procesadas: processed,
    total_preparadas_para_insert: prepared.length,
    total_insertadas: inserted,
    total_omitidas_cantidad_cero: zeroQuantitySkipped,
    total_productos_no_encontrados: skippedMissing.size,
    productos_no_encontrados: [...skippedMissing].sort(),
    total_ocs_no_encontradas: skippedOc.size,
    ocs_no_encontradas: [...skippedOc].sort(),
    errores_batches: batchErrors,
  };

  console.log('\nResumen:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
