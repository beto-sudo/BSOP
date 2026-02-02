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

const { createClient } = require("@supabase/supabase-js");
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
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const LIMIT = Number(process.env.CODA_LIMIT || 500);
const TABLE_IDS = (process.env.CODA_TABLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  const rows = tables.map((t) => ({
    doc_id: CODA_DOC_ID,
    table_id: t.id,
    table_name: t.name,
    table_type: t.tableType, // 'table' | 'view'
    parent_page: t.parent?.name || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .schema("staging")
    .from("coda_tables")
    .upsert(rows, { onConflict: "doc_id,table_id" });

  if (error) throw error;
}

async function syncTableRows(tableId) {
  // Mark state as running-ish by clearing last_error.
  await supabase
    .schema("staging")
    .from("coda_sync_state")
    .upsert(
      {
        doc_id: CODA_DOC_ID,
        table_id: tableId,
        last_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doc_id,table_id" }
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
      const upserts = items.map((r) => ({
        doc_id: CODA_DOC_ID,
        table_id: tableId,
        row_id: r.id,
        raw: r,
        updated_at_coda: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .schema("staging")
        .from("coda_rows")
        .upsert(upserts, { onConflict: "doc_id,table_id,row_id" });

      if (error) throw error;
      total += items.length;
    }

    pageToken = data.nextPageToken || null;
    if (!pageToken) break;
  }

  await supabase
    .schema("staging")
    .from("coda_sync_state")
    .upsert(
      {
        doc_id: CODA_DOC_ID,
        table_id: tableId,
        cursor: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doc_id,table_id" }
    );

  return total;
}

async function main() {
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
    console.log("No CODA_TABLE_IDS provided; skipping row sync (meta only).\n" +
      "Set CODA_TABLE_IDS to sync specific base tables.");
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
      await supabase
        .schema("staging")
        .from("coda_sync_state")
        .upsert(
          {
            doc_id: CODA_DOC_ID,
            table_id: t.id,
            last_error: String(err?.message || err).slice(0, 2000),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "doc_id,table_id" }
        );
      throw err;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
