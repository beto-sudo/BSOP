#!/usr/bin/env node
/*
  Coda → Supabase staging sync (initial core)

  Writes to:
    - staging.coda_tables
    - staging.coda_rows
    - staging.coda_sync_state

  Env required:
    CODA_API_TOKEN
    CODA_DOC_ID
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

  Optional:
    CODA_TABLE_IDS (comma-separated)  # restrict row sync to these table ids
    CODA_LIMIT (default 500)
*/

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Minimal .env.local loader for running as a plain Node script.
// - Does not override existing process.env keys.
// - Supports simple KEY=VALUE lines.
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const idx = s.indexOf("=");
    if (idx <= 0) continue;
    const k = s.slice(0, idx).trim();
    let v = s.slice(idx + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

const CODA_API_TOKEN = requireEnv("CODA_API_TOKEN");
const CODA_DOC_ID = requireEnv("CODA_DOC_ID");

// Prefer direct SQL so we can write to non-public schemas (staging/erp).
// Use Session Pooler DATABASE_URL.
const DATABASE_URL = requireEnv("DATABASE_URL");

const LIMIT = Number(process.env.CODA_LIMIT || 500);
const TABLE_IDS = (process.env.CODA_TABLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pg = new Client({ connectionString: DATABASE_URL });

async function codaFetch(path, params = {}) {
  const url = new URL(`https://coda.io/apis/v1${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${CODA_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coda API ${res.status} ${res.statusText}: ${text.slice(0, 2000)}`);
  }
  return res.json();
}

async function upsertTablesMeta(tables) {
  const now = new Date().toISOString();
  // Use a simple loop; batch inserts can be added later.
  for (const t of tables) {
    await pg.query(
      `insert into staging.coda_tables (doc_id, table_id, table_name, table_type, parent_page, updated_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (doc_id, table_id)
       do update set table_name=excluded.table_name,
                     table_type=excluded.table_type,
                     parent_page=excluded.parent_page,
                     updated_at=excluded.updated_at`,
      [CODA_DOC_ID, t.id, t.name, t.tableType, t.parent?.name || null, now]
    );
  }
}

async function syncTableRows(tableId) {
  // Mark state as running-ish by clearing last_error.
  await pg.query(
    `insert into staging.coda_sync_state (doc_id, table_id, last_sync_at, last_error, updated_at)
     values ($1,$2,$3,$4,$5)
     on conflict (doc_id, table_id)
     do update set last_sync_at=excluded.last_sync_at,
                   last_error=excluded.last_error,
                   updated_at=excluded.updated_at`,
    [CODA_DOC_ID, tableId, new Date().toISOString(), null, new Date().toISOString()]
  );

  let pageToken = null;
  let total = 0;

  for (;;) {
    const data = await codaFetch(`/docs/${CODA_DOC_ID}/tables/${tableId}/rows`, {
      limit: LIMIT,
      pageToken,
      useColumnNames: true,
      valueFormat: "rich",
    });

    const items = data.items || [];
    if (items.length) {
      for (const r of items) {
        await pg.query(
          `insert into staging.coda_rows (doc_id, table_id, row_id, raw, updated_at_coda, updated_at)
           values ($1,$2,$3,$4::jsonb,$5,$6)
           on conflict (doc_id, table_id, row_id)
           do update set raw=excluded.raw,
                         updated_at_coda=excluded.updated_at_coda,
                         updated_at=excluded.updated_at`,
          [
            CODA_DOC_ID,
            tableId,
            r.id,
            JSON.stringify(r),
            r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
            new Date().toISOString(),
          ]
        );
      }
      total += items.length;
    }

    pageToken = data.nextPageToken || null;
    if (!pageToken) break;
  }

  await pg.query(
    `insert into staging.coda_sync_state (doc_id, table_id, cursor, last_success_at, last_error, updated_at)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (doc_id, table_id)
     do update set cursor=excluded.cursor,
                   last_success_at=excluded.last_success_at,
                   last_error=excluded.last_error,
                   updated_at=excluded.updated_at`,
    [CODA_DOC_ID, tableId, null, new Date().toISOString(), null, new Date().toISOString()]
  );

  return total;
}

async function main() {
  await pg.connect();

  const tablesResp = await codaFetch(`/docs/${CODA_DOC_ID}/tables`);
  const tables = tablesResp.items || [];

  console.log(`Coda tables found: ${tables.length}`);
  await upsertTablesMeta(tables);

  const baseTables = tables.filter((t) => t.tableType === "table");
  console.log(`Base tables (tableType=table): ${baseTables.length}`);

  const selected = TABLE_IDS.length
    ? baseTables.filter((t) => TABLE_IDS.includes(t.id))
    : [];

  if (!TABLE_IDS.length) {
    console.log(
      "No CODA_TABLE_IDS provided; skipping row sync (meta only).\n" +
        "Set CODA_TABLE_IDS to sync specific base tables."
    );
    await pg.end();
    return;
  }

  const missing = TABLE_IDS.filter((id) => !baseTables.some((t) => t.id === id));
  if (missing.length) {
    console.warn(`Warning: ${missing.length} table ids not found as base tables:`, missing);
  }

  for (const t of selected) {
    console.log(`Syncing rows: ${t.name} (${t.id}) ...`);
    try {
      const n = await syncTableRows(t.id);
      console.log(`  upserted ${n} rows`);
    } catch (err) {
      console.error(`  ERROR syncing ${t.id}:`, err?.message || err);
      await pg.query(
        `insert into staging.coda_sync_state (doc_id, table_id, last_error, updated_at)
         values ($1,$2,$3,$4)
         on conflict (doc_id, table_id)
         do update set last_error=excluded.last_error,
                       updated_at=excluded.updated_at`,
        [CODA_DOC_ID, t.id, String(err?.message || err).slice(0, 2000), new Date().toISOString()]
      );
      await pg.end();
      throw err;
    }
  }

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
