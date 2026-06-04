/**
 * Importer idempotente — base de info de péptidos (iniciativa sanren-peptides).
 *
 * Lee las 3 Google Sheets públicas del grupo STG (COA testing, vendors+precios,
 * insumos) y las carga a peptides.* con fecha "as of" (imported_at).
 *
 * Snapshot-replace para tests/vendors/insumos (data de fuente comunitaria que se
 * refresca entera). El catálogo peptides.peptidos se UPSERTEA por nombre
 * (preserva descripciones curadas); peptides.notas NO se toca.
 *
 * Re-ejecutable on-demand (re-sync). NO corre en CI ni en preview — data personal.
 * Fuente viva: re-pull = re-sync. Los IDs de las sheets son los del mensaje
 * "FREE STUFF HERE" del grupo STG (2026-06-03).
 *
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/import_peptides_stg.ts
 *   npx tsx --env-file=.env.local scripts/import_peptides_stg.ts
 *
 * Limitación conocida v1: el export CSV de Google da el TEXTO del hyperlink, no
 * la URL, para insumos.url y vendors.fuente_url. La COA "Lab URL" sí trae URL.
 * El link vendor↔COA por código es best-effort (códigos heterogéneos en la fuente).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const SHEET_TESTS =
  'https://docs.google.com/spreadsheets/d/1PfQ8okHxJlVUEXEYvRQQ2JuVJeI58Birykpk13DjGzc/export?format=csv';
const SHEET_VENDORS =
  'https://docs.google.com/spreadsheets/d/1jGZmQYG717aalrqTKqL4d8jh7p2LICtqcnaSpSTZU4c/export?format=csv';
const SHEET_INSUMOS =
  'https://docs.google.com/spreadsheets/d/1QnBH-X1MX68OHm0B6HAQYvxhhpsJFHtFSQmzYUEHh30/export?format=csv';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

// ── CSV parser (maneja comillas, comas y saltos de línea embebidos) ──────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (s: string | undefined): string | null => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};
const num = (s: string | undefined): number | null => {
  const t = (s ?? '').replace(/[$,%\s]/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
// MM/DD/YYYY → YYYY-MM-DD
const dateISO = (s: string | undefined): string | null => {
  const m = (s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const mm = m[1].padStart(2, '0');
  const dd = m[2].padStart(2, '0');
  const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yy}-${mm}-${dd}`;
};
const bool3 = (s: string | undefined): boolean | null => {
  const t = (s ?? '').trim();
  if (!t) return null;
  return /yes|warehouse/i.test(t);
};

async function fetchCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Fetch ${url} → HTTP ${res.status}`);
  const text = await res.text();
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error(`Fetch ${url} devolvió HTML (¿sheet no pública o ID mal transcrito?)`);
  }
  return parseCsv(text);
}

// Código de vendor para el link blando con la COA. Formato heterogéneo en la
// fuente: "Aavant (ACR)" (código en paréntesis) vs "SSA (Shanghai Sigma Audley)"
// (código al inicio). Heurística: el código es el token CORTO en MAYÚSCULAS;
// se prefiere el inicio, si no el paréntesis. Best-effort (no todos casan, ej.
// la COA usa "BFF/AMO" para "BFF (Formerly AMO)").
function vendorCode(nombre: string): string {
  const isCode = (s: string) => /^[A-Z0-9/]{2,6}$/.test(s);
  const lead = nombre.split(/\s+/)[0].replace(/[^A-Za-z0-9/]/g, '');
  if (isCode(lead)) return lead;
  const paren = nombre.match(/\(([^)]+)\)/);
  if (paren) {
    const p = paren[1].split(/[,/]/)[0].trim();
    if (isCode(p)) return p;
  }
  return lead;
}

interface TestRow {
  vendor_codigo: string | null;
  peptido: string | null;
  test_date: string | null;
  batch: string | null;
  expected_mass_mg: number | null;
  mass_mg: number | null;
  purity_pct: number | null;
  tfa: string | null;
  endotoxin: string | null;
  test_lab: string | null;
  file_name: string | null;
  lab_url: string | null;
  imported_at: string;
}
interface VendorRow {
  codigo: string;
  nombre: string;
  estado: string;
  precio_mg: number | null;
  precio_mg_sale: number | null;
  metodos_pago: string | null;
  us_warehouse: boolean | null;
  china_warehouse: boolean | null;
  eu_warehouse: boolean | null;
  primer_contacto: string | null;
  notas: string | null;
  imported_at: string;
}
interface InsumoRow {
  proveedor: string;
  url: string | null;
  productos: string | null;
  imported_at: string;
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const sbp = (sb as { schema: (s: string) => ReturnType<typeof sb.schema> }).schema('peptides');
  const now = new Date().toISOString();

  // ── 1) TESTS / COA ──
  const testsRaw = await fetchCsv(SHEET_TESTS);
  const tHeader = (testsRaw[0] ?? []).map((h) => h.trim().toLowerCase());
  const ix = (name: string) => tHeader.indexOf(name.toLowerCase());
  const col = {
    vendor: ix('Vendor'),
    pep: ix('Peptide'),
    date: ix('Test Date'),
    batch: ix('Batch'),
    exp: ix('Expected Mass mg'),
    mass: ix('Mass mg'),
    pur: ix('Purity %'),
    tfa: ix('TFA'),
    endo: ix('Endotoxin'),
    lab: ix('Test Lab'),
    file: ix('File Name'),
    url: ix('Lab URL'),
  };
  const tests: TestRow[] = testsRaw
    .slice(1)
    .filter((r) => clean(r[col.pep]))
    .map((r) => ({
      vendor_codigo: clean(r[col.vendor]),
      peptido: clean(r[col.pep]),
      test_date: dateISO(r[col.date]),
      batch: clean(r[col.batch]),
      expected_mass_mg: num(r[col.exp]),
      mass_mg: num(r[col.mass]),
      purity_pct: num(r[col.pur]),
      tfa: clean(r[col.tfa]),
      endotoxin: clean(r[col.endo]),
      test_lab: clean(r[col.lab]),
      file_name: clean(r[col.file]),
      lab_url: clean(r[col.url]),
      imported_at: now,
    }));

  // ── 2) VENDORS (header multi-fila; divider "removed from STG") ──
  const vendorsRaw = await fetchCsv(SHEET_VENDORS);
  let removed = false;
  const vendorsMap = new Map<string, VendorRow>();
  for (const r of vendorsRaw) {
    const name = clean(r[0]);
    if (!name) continue;
    if (/removed from STG/i.test(name)) {
      removed = true;
      continue;
    }
    if (/minimally vetted|not an endorsement|^vendors$/i.test(name)) continue;
    const notas = clean(r[11]);
    const hasSignal =
      clean(r[1]) || clean(r[2]) || notas || clean(r[6]) || clean(r[7]) || clean(r[8]);
    if (!hasSignal) continue;
    const codigo = vendorCode(name);
    vendorsMap.set(codigo, {
      codigo,
      nombre: name,
      estado: removed ? 'removido' : notas && /WARNING|⚠/i.test(notas) ? 'warning' : 'activo',
      precio_mg: num(r[2]),
      precio_mg_sale: num(r[1]),
      metodos_pago: clean(r[4]),
      us_warehouse: bool3(r[6]),
      china_warehouse: bool3(r[7]),
      eu_warehouse: bool3(r[8]),
      primer_contacto: clean(r[9]),
      notas,
      imported_at: now,
    });
  }
  const vendors = [...vendorsMap.values()];

  // ── 3) INSUMOS ──
  const insumosRaw = await fetchCsv(SHEET_INSUMOS);
  const insumosMap = new Map<string, InsumoRow>();
  for (const r of insumosRaw.slice(1)) {
    const prov = clean(r[0]);
    if (!prov || /supply vendor list/i.test(prov)) continue;
    insumosMap.set(prov, {
      proveedor: prov,
      url: clean(r[1]),
      productos: clean(r[2]),
      imported_at: now,
    });
  }
  const insumos = [...insumosMap.values()];

  // ── 4) PEPTIDOS (catálogo) — distinct de tests ──
  const pepNames = [...new Set(tests.map((t) => t.peptido).filter((p): p is string => !!p))];

  console.log(
    `Parseado: ${tests.length} tests · ${vendors.length} vendors · ${insumos.length} insumos · ${pepNames.length} péptidos distintos`
  );

  if (DRY_RUN) {
    console.log('[DRY_RUN] tests sample:', tests.slice(0, 2));
    console.log(
      '[DRY_RUN] vendors sample:',
      vendors.slice(0, 5).map((v) => ({
        codigo: v.codigo,
        nombre: v.nombre,
        estado: v.estado,
        precio_mg: v.precio_mg,
      }))
    );
    console.log(
      '[DRY_RUN] vendors estados:',
      vendors.reduce<Record<string, number>>(
        (a, v) => ((a[v.estado] = (a[v.estado] ?? 0) + 1), a),
        {}
      )
    );
    console.log('[DRY_RUN] insumos sample:', insumos.slice(0, 3));
    console.log('[DRY_RUN] peptidos:', pepNames.slice(0, 25));
    return;
  }

  // snapshot-replace tests/vendors/insumos
  for (const table of ['tests', 'vendors', 'insumos'] as const) {
    const { error } = await sbp.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`delete ${table}: ${error.message}`);
  }
  const chunk = <T>(a: T[], n: number): T[][] =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(tests, 500)) {
    const { error } = await sbp.from('tests').insert(c);
    if (error) throw new Error(`insert tests: ${error.message}`);
  }
  if (vendors.length) {
    const { error } = await sbp.from('vendors').insert(vendors);
    if (error) throw new Error(`insert vendors: ${error.message}`);
  }
  if (insumos.length) {
    const { error } = await sbp.from('insumos').insert(insumos);
    if (error) throw new Error(`insert insumos: ${error.message}`);
  }
  for (const nombre of pepNames) {
    const { error } = await sbp
      .from('peptidos')
      .upsert({ nombre }, { onConflict: 'nombre', ignoreDuplicates: true });
    if (error) throw new Error(`upsert peptido ${nombre}: ${error.message}`);
  }

  console.log(
    `✓ Importado: ${tests.length} tests, ${vendors.length} vendors, ${insumos.length} insumos, ${pepNames.length} péptidos. (as of ${now})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
