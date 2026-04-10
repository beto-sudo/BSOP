#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://ybklderteyhuugzfmxbi.supabase.co';
const ENV_PATH = '/Users/Beto/BSOP/.env.local';
const CSV_PATH = '/Users/Beto/.openclaw/media/inbound/Cortes_de_Caja_2---50e8b9b0-4706-4b87-85d1-d186e83dcdcb.csv';
const BATCH_SIZE = 10;

function getEnvValue(name) {
  const env = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error(`Missing ${name} in ${ENV_PATH}`);
}

const SUPABASE_KEY = getEnvValue('SUPABASE_SERVICE_ROLE_KEY');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some(cell => cell !== '')) rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function parseMoney(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const number = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

async function supabaseFetch(endpoint, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`Supabase ${response.status} ${response.statusText}`);
    error.details = data;
    throw error;
  }

  return { data, headers: response.headers };
}

async function fetchAllCortes() {
  const all = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const { data } = await supabaseFetch(`/rest/v1/cortes?select=id,corte_nombre&order=id.asc&limit=${pageSize}&offset=${offset}`, {
      headers: { 'Accept-Profile': 'rdb' },
    });

    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

async function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const csvRows = parseCsv(csvText);

  const { data: sampleRows } = await supabaseFetch('/rest/v1/cortes?select=*&limit=1', {
    headers: { 'Accept-Profile': 'rdb' },
  });
  const availableColumns = new Set(Object.keys(sampleRows[0] || {}));

  const cortes = await fetchAllCortes();
  const cortesByName = new Map(cortes.map(c => [c.corte_nombre, c.id]));

  const fieldMap = [
    ['ingresos_efectivo', 'Ingresos Efectivo', parseMoney],
    ['ingresos_tarjeta', 'Ingresos Tarjeta', parseMoney],
    ['ingresos_stripe', 'Ingresos Stripe', parseMoney],
    ['ingresos_transferencias', 'Ingresos Transferencias', parseMoney],
    ['total_ingresos', 'Total', parseMoney],
    ['depositos', 'Depositos', parseMoney],
    ['retiros', 'Retiros', parseMoney],
    ['efectivo_esperado', 'Efectivo Esperado', parseMoney],
    ['efectivo_contado', 'Efectivo Contado al Cierre', parseMoney],
    ['efectivo_inicial', 'Efectivo Inicial', parseMoney],
    ['pedidos_count', 'Cantidad de Pedidos', parseInteger],
  ];

  const supportedFields = fieldMap.filter(([column]) => availableColumns.has(column));
  const missingFields = fieldMap.filter(([column]) => !availableColumns.has(column)).map(([column]) => column);
  const canWriteObservaciones = availableColumns.has('observaciones');

  let processed = 0;
  let updated = 0;
  const skipped = [];
  const errors = [];

  for (let i = 0; i < csvRows.length; i += BATCH_SIZE) {
    const batch = csvRows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async row => {
      processed++;
      const corteNombre = (row['ID Corte'] || '').trim();
      if (!corteNombre || !cortesByName.has(corteNombre)) {
        skipped.push(corteNombre || '(sin ID Corte)');
        return;
      }

      const payload = {};
      for (const [column, csvColumn, parser] of supportedFields) {
        payload[column] = parser(row[csvColumn]);
      }

      const observaciones = (row['Observaciones'] || '').trim();
      if (canWriteObservaciones && observaciones) {
        payload.observaciones = observaciones;
      }

      if (!Object.keys(payload).length) {
        skipped.push(`${corteNombre} (sin columnas compatibles para actualizar)`);
        return;
      }

      try {
        await supabaseFetch(`/rest/v1/cortes?corte_nombre=eq.${encodeURIComponent(corteNombre)}`, {
          method: 'PATCH',
          headers: {
            'Accept-Profile': 'rdb',
            'Content-Profile': 'rdb',
            Prefer: 'return=minimal',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        updated++;
      } catch (error) {
        errors.push({ corteNombre, error: error.details || error.message });
      }
    }));
  }

  console.log(JSON.stringify({
    csvPath: CSV_PATH,
    processed,
    updated,
    skippedCount: skipped.length,
    skipped,
    missingFields,
    supportedFields: supportedFields.map(([column]) => column).concat(canWriteObservaciones ? ['observaciones'] : []),
    errors,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
