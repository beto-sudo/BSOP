#!/usr/bin/env node
import fs from 'node:fs';

const SUPABASE_URL = 'https://ybklderteyhuugzfmxbi.supabase.co';
const ENV_PATH = '/Users/Beto/BSOP/.env.local';
const CSV_PATH = '/Users/Beto/.openclaw/media/inbound/Movimientos_de_Caja---06a15b7b-438f-4913-823e-8b22001f6228.csv';
const SCHEMA = 'rdb';
const BATCH_SIZE = 20;

function getEnvValue(name, fallback = null) {
  const env = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return fallback;
}

const SERVICE_ROLE_KEY = getEnvValue('SUPABASE_SERVICE_ROLE_KEY');
const AUTH_JWT = process.env.SUPABASE_AUTH_JWT || getEnvValue('SUPABASE_AUTH_JWT');
const WRITE_TOKEN = AUTH_JWT || SERVICE_ROLE_KEY;

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
  const normalized = String(value ?? '').trim().replace(/\$/g, '').replace(/,/g, '');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseDateTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let [, month, day, year, hour, minute, period] = match;
  let h = Number(hour);
  if (period.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (period.toUpperCase() === 'AM' && h === 12) h = 0;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(h).padStart(2, '0')}:${minute}:00-06:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : iso;
}

function mapTipo(original) {
  const normalized = String(original ?? '').trim();
  const mapping = {
    'Caja Negra': 'Retiro',
    'Retiro Efectivo': 'Retiro',
    'Aporta Efectivo': 'Depósito',
    'Repartidor': 'Retiro',
    'Proveedor': 'Retiro',
    'Propina': 'Retiro',
  };
  return mapping[normalized] || normalized;
}

function buildNota(tipoOriginal, nota) {
  const parts = [`[tipo_original: ${String(tipoOriginal ?? '').trim() || 'N/A'}]`];
  const cleanedNota = String(nota ?? '').trim();
  if (cleanedNota) parts.push(cleanedNota);
  return parts.join(' ');
}

async function supabaseFetch(endpoint, options = {}, { write = false } = {}) {
  const token = write ? WRITE_TOKEN : SERVICE_ROLE_KEY;
  const headers = {
    apikey: token,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`Supabase ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return { data, headers: response.headers };
}

async function fetchAll(endpoint) {
  const rows = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const { data } = await supabaseFetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`, {
      headers: { 'Accept-Profile': SCHEMA },
    });
    rows.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return rows;
}

async function main() {
  const csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const totalCsvRows = csvRows.length;

  const { data: sampleRows } = await supabaseFetch('/rest/v1/movimientos?limit=1', {
    headers: { 'Accept-Profile': SCHEMA },
  });
  const movimientoColumns = Object.keys(sampleRows[0] || {});

  const cortes = await fetchAll('/rest/v1/cortes?select=id,corte_nombre');
  const corteByName = new Map(cortes.map(row => [String(row.corte_nombre ?? '').trim(), row.id]));

  const ignored = [];
  const transformed = [];
  const errors = [];

  for (const row of csvRows) {
    const corteNombre = String(row['Corte'] ?? '').trim();
    if (corteNombre === 'Deleted Row') {
      ignored.push({ reason: 'Deleted Row', row });
      continue;
    }

    const corteId = corteByName.get(corteNombre);
    if (!corteId) {
      ignored.push({ reason: `corte no encontrado: ${corteNombre || '(vacío)'}`, row });
      continue;
    }

    const fechaHora = parseDateTime(row['Fecha/Hora']);
    const monto = parseMoney(row['Monto']);
    const tipoOriginal = String(row['Tipo'] ?? '').trim();
    const tipo = mapTipo(tipoOriginal);

    if (!fechaHora || monto == null || !tipo) {
      ignored.push({ reason: 'fila inválida (fecha, monto o tipo)', row });
      continue;
    }

    const payload = {
      corte_id: corteId,
      fecha_hora: fechaHora,
      tipo,
      monto,
      nota: buildNota(tipoOriginal, row['Nota']),
      registrado_por: String(row['Registró'] ?? '').trim() || null,
    };

    transformed.push(payload);
  }

  const report = {
    csvPath: CSV_PATH,
    totalCsvRows,
    movimientoColumns,
    cortesCount: cortes.length,
    tokenMode: AUTH_JWT ? 'authenticated_jwt' : 'service_role_only',
    ignoredCount: ignored.length,
    ignored,
    readyToInsert: transformed.length,
    insertedSuccessfully: 0,
    deletedExisting: false,
    errors,
  };

  try {
    await supabaseFetch('/rest/v1/movimientos?id=neq.00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: {
        'Content-Profile': SCHEMA,
        Prefer: 'return=minimal',
      },
    }, { write: true });
    report.deletedExisting = true;
  } catch (error) {
    errors.push({
      stage: 'delete',
      message: error.message,
      details: error.details,
      hint: AUTH_JWT
        ? 'El JWT authenticated tampoco logró borrar. Revisar grants/policies de rdb.movimientos.'
        : 'Falta un JWT de usuario authenticated o grants a service_role para DELETE/INSERT sobre rdb.movimientos.',
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);
    try {
      await supabaseFetch('/rest/v1/movimientos', {
        method: 'POST',
        headers: {
          'Content-Profile': SCHEMA,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      }, { write: true });
      report.insertedSuccessfully += batch.length;
    } catch (error) {
      errors.push({
        stage: 'insert',
        batchStart: i,
        batchSize: batch.length,
        message: error.message,
        details: error.details,
        sample: batch[0],
      });
      break;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
