/**
 * migrate_dilesa_escrituras.ts
 *
 * Pulls Escrituras data from the DILESA Coda workspace (Doc ZNxWl_DI2D),
 * table 'grid-bUehiUcFiZ', and maps it to erp.documentos in BSOP Supabase.
 *
 * Vincula notario_proveedor_id cuando la notaría del documento coincide con
 * una entrada del catálogo ERP (erp.personas + erp.proveedores, categoria='notaria').
 * Para poblar ese catálogo primero, ejecuta: migrate_dilesa_notarias.ts
 *
 * Prerequisites:
 *   CODA_API_KEY              – Coda personal API token
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *   DILESA_EMPRESA_ID         – UUID of the DILESA row in core.empresas
 *                               (run: SELECT id FROM core.empresas WHERE slug='dilesa')
 *
 * Usage:
 *   npx tsx scripts/migrate_dilesa_escrituras.ts
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_escrituras.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DILESA_EMPRESA_ID = process.env.DILESA_EMPRESA_ID ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC_ID = 'ZNxWl_DI2D';
const TABLE_ID = 'grid-bUehiUcFiZ';

// ─── Validation ───────────────────────────────────────────────────────────────

if (!CODA_API_KEY) throw new Error('Missing CODA_API_KEY');
if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!DILESA_EMPRESA_ID) throw new Error('Missing DILESA_EMPRESA_ID');

// ─── Coda API types ───────────────────────────────────────────────────────────

interface CodaRow {
  id: string;
  name: string;
  values: Record<string, unknown>;
}

interface CodaColumn {
  id: string;
  name: string;
}

// ─── Coda API helpers ─────────────────────────────────────────────────────────

async function codaGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://coda.io/apis/v1${path}`, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coda API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function fetchColumns(tableId: string): Promise<Map<string, string>> {
  const data = await codaGet<{ items: CodaColumn[] }>(
    `/docs/${CODA_DOC_ID}/tables/${tableId}/columns`,
  );
  const map = new Map<string, string>();
  for (const col of data.items) {
    map.set(col.name.toLowerCase().trim(), col.id);
    map.set(col.id, col.name.toLowerCase().trim()); // reverse lookup
  }
  return map;
}

async function fetchAllRows(tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | undefined;

  do {
    const url = `/docs/${CODA_DOC_ID}/tables/${tableId}/rows?limit=500&valueFormat=simpleWithArrays${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await codaGet<{ items: CodaRow[]; nextPageToken?: string }>(url);
    rows.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return rows;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

function parseDate(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  // Coda dates come as ISO strings or 'YYYY-MM-DD'
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getString(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (Array.isArray(raw)) return raw.map(String).join(', ').trim() || null;
  return String(raw).trim() || null;
}

// ─── Column name → Supabase field mapping ─────────────────────────────────────
// Adjust column names below to match the actual Coda table headers.
// Run with DRY_RUN=1 first to see all available column names.

// ─── Normalización para lookup de notarías ────────────────────────────────────

function normalizeNotaria(s: string | null): string {
  if (!s) return '';
  return s
    .trim()
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapRow(
  row: CodaRow,
  colMap: Map<string, string>,
): {
  empresa_id: string;
  titulo: string;
  numero_documento: string | null;
  tipo: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  notaria: string | null;
  notas: string | null;
} | null {
  const get = (name: string): unknown => {
    const id = colMap.get(name.toLowerCase().trim());
    return id ? row.values[id] : undefined;
  };

  // Try common column name variants
  const titulo =
    getString(get('nombre')) ??
    getString(get('escritura')) ??
    getString(get('titulo')) ??
    row.name.trim();

  if (!titulo) return null;

  const contenido =
    getString(get('contenido')) ??
    getString(get('descripcion')) ??
    null;

  const pdfEscritura = getString(get('pdf escritura'));
  const imagenPlano = getString(get('imagen plano'));
  const complementos = getString(get('complementos'));

  const notas = [
    contenido,
    pdfEscritura ? `PDF Escritura: ${pdfEscritura}` : null,
    imagenPlano ? `Imagen Plano: ${imagenPlano}` : null,
    complementos ? `Complementos: ${complementos}` : null,
  ].filter(Boolean).join('\n\n') || null;

  return {
    empresa_id: DILESA_EMPRESA_ID,
    titulo,
    numero_documento:
      getString(get('numero de escritura')) ??
      getString(get('número')) ??
      getString(get('numero')) ??
      getString(get('no. escritura')) ??
      getString(get('numero escritura')) ??
      null,
    tipo:
      getString(get('tipo')) ??
      getString(get('tipo de escritura')) ??
      null,
    fecha_emision:
      parseDate(get('fecha') as string) ??
      parseDate(get('fecha escritura') as string) ??
      parseDate(get('fecha emisión') as string) ??
      parseDate(get('fecha emision') as string) ??
      null,
    fecha_vencimiento:
      parseDate(get('vencimiento') as string) ??
      parseDate(get('fecha vencimiento') as string) ??
      parseDate(get('vigencia') as string) ??
      null,
    notaria:
      getString(get('notaría')) ??
      getString(get('notaria')) ??
      getString(get('notario')) ??
      null,
    notas,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 migrate_dilesa_escrituras — DRY_RUN=${DRY_RUN}`);
  console.log(`   Doc: ${CODA_DOC_ID}  Table: ${TABLE_ID}`);
  console.log(`   DILESA empresa_id: ${DILESA_EMPRESA_ID}\n`);

  // 1. Fetch columns
  console.log('📋 Fetching columns...');
  const colMap = await fetchColumns(TABLE_ID);
  const columnNames = [...new Set([...colMap.keys()].filter((k) => !k.startsWith('c-')))].sort();
  console.log(`   Available columns: ${columnNames.join(', ')}\n`);

  // 2. Fetch rows
  console.log('📥 Fetching rows...');
  const rows = await fetchAllRows(TABLE_ID);
  console.log(`   Fetched ${rows.length} rows\n`);

  // 3. Map rows
  const mapped = rows
    .map((r) => mapRow(r, colMap))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const skipped = rows.length - mapped.length;
  console.log(`✅ Mapped: ${mapped.length}  Skipped (no title): ${skipped}\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — first 5 rows:');
    mapped.slice(0, 5).forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.titulo}`);
      console.log(`       tipo=${r.tipo} | numero=${r.numero_documento}`);
      console.log(`       emision=${r.fecha_emision} | vencimiento=${r.fecha_vencimiento}`);
      console.log(`       notaria=${r.notaria}`);
    });
    console.log('\n🛑 Dry run complete — no data written.');
    return;
  }

  // 4. Precargar catálogo de notarías (erp.proveedores categoria='notaria')
  //    para ligar notario_proveedor_id en cada escritura.
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('🗂  Cargando catálogo de notarías ERP...');
  const { data: notariasRows, error: notariasErr } = await supabase
    .schema('erp' as any)
    .from('proveedores')
    .select('id, persona_id, personas!inner(nombre)')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('categoria', 'notaria')
    .is('deleted_at', null);

  if (notariasErr) {
    console.warn(`⚠️  No se pudo cargar catálogo de notarías: ${notariasErr.message}`);
    console.warn('   notario_proveedor_id quedará NULL. Ejecuta migrate_dilesa_notarias.ts primero.');
  }

  // Mapa: nombreNormalizado → proveedor_id
  const notariasMap = new Map<string, string>();
  for (const row of notariasRows ?? []) {
    const p = (row as any).personas;
    const nombre = typeof p?.nombre === 'string' ? p.nombre : null;
    if (nombre) {
      notariasMap.set(normalizeNotaria(nombre), row.id as string);
    }
  }
  console.log(`   ${notariasMap.size} notarías en catálogo ERP\n`);

  let inserted = 0;
  let updated = 0;
  let linkedNotarios = 0;

  for (const doc of mapped) {
    const numero = doc.numero_documento ?? '';

    // Resolver notario_proveedor_id desde el catálogo
    const notariaKey = normalizeNotaria(doc.notaria);
    const notarioProveedorId = notariaKey ? (notariasMap.get(notariaKey) ?? null) : null;
    if (notarioProveedorId) linkedNotarios++;

    const { data: existing, error: lookupError } = await supabase
      .schema('erp' as any)
      .from('documentos')
      .select('id')
      .eq('empresa_id', doc.empresa_id)
      .eq('titulo', doc.titulo)
      .eq('numero_documento', numero)
      .maybeSingle();

    if (lookupError) {
      console.error(`❌ Lookup failed for ${doc.titulo}: ${lookupError.message}`);
      continue;
    }

    const payload = { ...doc, notario_proveedor_id: notarioProveedorId };

    if (existing?.id) {
      const { error } = await supabase
        .schema('erp' as any)
        .from('documentos')
        .update(payload)
        .eq('id', existing.id);

      if (error) {
        console.error(`❌ Update failed for ${doc.titulo}: ${error.message}`);
        continue;
      }

      updated += 1;
    } else {
      const { error } = await supabase
        .schema('erp' as any)
        .from('documentos')
        .insert(payload);

      if (error) {
        console.error(`❌ Insert failed for ${doc.titulo}: ${error.message}`);
        continue;
      }

      inserted += 1;
    }

    process.stdout.write(`   Inserted ${inserted} | Updated ${updated} / ${mapped.length}\r`);
  }

  console.log(`\n\n🎉 Done — inserted ${inserted}, updated ${updated} documentos in erp.documentos`);
  console.log(`   Vinculados a notario_proveedor_id: ${linkedNotarios} / ${mapped.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
