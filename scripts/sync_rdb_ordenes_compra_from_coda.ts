/**
 * sync_rdb_ordenes_compra_from_coda.ts
 *
 * Jala OCs + detalle del doc de RDB en Coda y los reconstruye en
 * erp.ordenes_compra / erp.ordenes_compra_detalle para la empresa RDB.
 *
 * Flujo en modo --apply (idempotente):
 *   1. UPSERT headers por (empresa_id, codigo) — preserva id y FKs
 *   2. Para cada OC del sync: DELETE su detalle + INSERT detalle fresco
 *   3. OCs con código fuera de Coda se IGNORAN (no se borran)
 *
 * Proveedor: match exacto contra nombre completo en erp.personas ligado a
 * erp.proveedores. Si el nombre no existe, crea persona+proveedor nuevos.
 *
 * Requisición: match por código de la requisición (el lookup de Coda trae
 * `name` = código tipo "REQ-261"). Se resuelve contra erp.requisiciones.
 *
 * estado_id y moneda_id se dejan NULL (no hay catálogos en BSOP).
 *
 * Uso:
 *   npx tsx scripts/sync_rdb_ordenes_compra_from_coda.ts             # dry-run
 *   npx tsx scripts/sync_rdb_ordenes_compra_from_coda.ts --apply     # ejecuta
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve('/Users/Beto/BSOP/.env.local') });

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APPLY = process.argv.includes('--apply');

const CODA_DOC_ID = 'yvrM3UilPt';
const OCS_TABLE_ID = 'grid-3312K_jAHD';
const OC_DETALLE_TABLE_ID = 'grid-q8495t1U8j';
const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodaRow {
  id: string;
  name: string;
  values: Record<string, unknown>;
}

interface CodaStructuredValue {
  '@type'?: string;
  name?: string;
  email?: string;
  rowId?: string;
  tableId?: string;
  amount?: number;
}

interface OcHeader {
  codaRowId: string;
  codigo: string;
  fechaOc: string | null;
  proveedorNombre: string | null;
  comentarios: string | null;
  reqCodigo: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
}

interface OcItem {
  ocCodaRowId: string;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  precioUnitario: number | null;
  subtotal: number | null;
}

// ─── Coda API ─────────────────────────────────────────────────────────────────

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

async function fetchAllRows(tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: '500',
      useColumnNames: 'true',
      valueFormat: 'rich',
    });
    if (pageToken) qs.set('pageToken', pageToken);
    const data = await codaGet<{ items: CodaRow[]; nextPageToken?: string }>(
      `/docs/${CODA_DOC_ID}/tables/${tableId}/rows?${qs}`
    );
    rows.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return rows;
}

// ─── Value helpers ────────────────────────────────────────────────────────────

function stripBackticks(s: string): string {
  return s.replace(/^`+|`+$/g, '').trim();
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return stripBackticks(v).trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

function asStructured(v: unknown): CodaStructuredValue | null {
  if (!v || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.length ? asStructured(v[0]) : null;
  return v as CodaStructuredValue;
}

function asCurrency(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v;
  const s = asStructured(v);
  if (s && typeof s.amount === 'number') return s.amount;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

function asDateIso(v: unknown): string | null {
  const s = typeof v === 'string' ? v : null;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── Extract ─────────────────────────────────────────────────────────────────

function parseHeader(r: CodaRow): OcHeader | null {
  const v = r.values;
  const codigo = asString(v['ID OC']);
  if (!codigo) return null;

  const proveedor = asStructured(v['Proveedor']);
  const reqLookup = asStructured(v['Requisición']);

  return {
    codaRowId: r.id,
    codigo,
    fechaOc: asDateIso(v['Fecha OC']),
    proveedorNombre: proveedor?.name ?? null,
    comentarios: asString(v['Comentarios']),
    reqCodigo: reqLookup?.name ?? null,
    subtotal: asCurrency(v['Subtotal']),
    iva: asCurrency(v['IVA$']),
    total: asCurrency(v['Total']),
  };
}

function parseItem(r: CodaRow): OcItem | null {
  const v = r.values;
  const oc = asStructured(v['Orden']);
  if (!oc?.rowId) return null;

  const producto = asStructured(v['Producto']);
  return {
    ocCodaRowId: oc.rowId,
    descripcion: producto?.name ?? asString(v['Producto']),
    unidad: asString(v['Presentación']),
    cantidad: asNumber(v['Cantidad']) ?? 0,
    precioUnitario: asCurrency(v['Precio Unitario']),
    subtotal: asCurrency(v['Subtotal']),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY required');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env required');

  console.log(`\n🔄 Sync RDB órdenes de compra — Coda doc ${CODA_DOC_ID}`);
  console.log(APPLY ? '⚠️  --apply mode: cambios SE ESCRIBEN' : '📋 dry-run (no writes)');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Fetch Coda ──────────────────────────────────────────────────────────
  console.log('\n─── Fetching Coda ───');
  const [ocRows, itemRows] = await Promise.all([
    fetchAllRows(OCS_TABLE_ID),
    fetchAllRows(OC_DETALLE_TABLE_ID),
  ]);
  console.log(`  ${ocRows.length} OCs, ${itemRows.length} items`);

  const headers = ocRows.map(parseHeader).filter((h): h is OcHeader => h !== null);
  const items = itemRows.map(parseItem).filter((i): i is OcItem => i !== null);

  // 2. Dedupe headers por código ───────────────────────────────────────────
  const headersByCodigo = new Map<string, OcHeader>();
  for (const h of headers) {
    if (!headersByCodigo.has(h.codigo)) headersByCodigo.set(h.codigo, h);
  }

  // 3. Resolver proveedores ────────────────────────────────────────────────
  const proveedorNames = new Set<string>();
  for (const h of headers) if (h.proveedorNombre) proveedorNames.add(h.proveedorNombre);

  const { data: existingProvs, error: provsErr } = await supabase
    .schema('erp' as never)
    .from('proveedores')
    .select('id, persona_id')
    .eq('empresa_id', RDB_EMPRESA_ID);
  if (provsErr) throw provsErr;

  const provList = (existingProvs ?? []) as Array<{ id: string; persona_id: string }>;
  const personaIds = provList.map((p) => p.persona_id);

  const { data: existingPersonas, error: persErr } = await supabase
    .schema('erp' as never)
    .from('personas')
    .select('id, nombre, apellido_paterno, apellido_materno')
    .in('id', personaIds);
  if (persErr) throw persErr;

  type PersonaRow = {
    id: string;
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
  };
  const personaById = new Map<string, PersonaRow>();
  for (const row of (existingPersonas ?? []) as PersonaRow[]) {
    personaById.set(row.id, row);
  }

  const provNameToId = new Map<string, string>();
  for (const p of provList) {
    const per = personaById.get(p.persona_id);
    if (!per) continue;
    const full = [per.nombre, per.apellido_paterno, per.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (full) provNameToId.set(full, p.id);
  }

  const missingProvs = [...proveedorNames].filter((n) => !provNameToId.has(n));
  console.log('\n─── Proveedores ───');
  console.log(`  Existentes: ${proveedorNames.size - missingProvs.length}`);
  console.log(`  Nuevos a crear: ${missingProvs.length}`);
  for (const n of missingProvs) console.log(`    + ${n}`);

  if (APPLY && missingProvs.length > 0) {
    for (const nombre of missingProvs) {
      const { data: persona, error: pErr } = await supabase
        .schema('erp' as never)
        .from('personas')
        .insert({ empresa_id: RDB_EMPRESA_ID, nombre, tipo: 'proveedor' })
        .select('id')
        .single();
      if (pErr) throw pErr;
      const { data: prov, error: prErr } = await supabase
        .schema('erp' as never)
        .from('proveedores')
        .insert({
          empresa_id: RDB_EMPRESA_ID,
          persona_id: (persona as { id: string }).id,
          activo: true,
        })
        .select('id')
        .single();
      if (prErr) throw prErr;
      provNameToId.set(nombre, (prov as { id: string }).id);
    }
  }

  // 4. Resolver requisiciones por código ───────────────────────────────────
  const reqCodigos = new Set<string>();
  for (const h of headers) if (h.reqCodigo) reqCodigos.add(h.reqCodigo);

  const { data: reqs, error: reqsErr } = await supabase
    .schema('erp' as never)
    .from('requisiciones')
    .select('id, codigo')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .in('codigo', [...reqCodigos]);
  if (reqsErr) throw reqsErr;

  const reqCodigoToId = new Map(
    (reqs ?? []).map((r) => [(r as { codigo: string }).codigo, (r as { id: string }).id])
  );
  const missingReqs = [...reqCodigos].filter((c) => !reqCodigoToId.has(c));

  console.log('\n─── Requisiciones ───');
  console.log(`  Matched: ${reqCodigos.size - missingReqs.length}`);
  if (missingReqs.length) {
    console.log(`  ⚠ Sin match (OC quedará con requisicion_id=NULL):`);
    for (const c of missingReqs) console.log(`    - ${c}`);
  }

  // 5. Stats items ─────────────────────────────────────────────────────────
  const itemsByOcRowId = new Map<string, OcItem[]>();
  for (const it of items) {
    const arr = itemsByOcRowId.get(it.ocCodaRowId) ?? [];
    arr.push(it);
    itemsByOcRowId.set(it.ocCodaRowId, arr);
  }

  let ocsConItems = 0;
  let totalItems = 0;
  for (const h of headersByCodigo.values()) {
    const its = itemsByOcRowId.get(h.codaRowId) ?? [];
    if (its.length) ocsConItems++;
    totalItems += its.length;
  }
  console.log(
    `\n─── Resumen ───\n  OCs totales:    ${headersByCodigo.size}\n  Con ≥1 item:    ${ocsConItems}\n  Sin items:      ${headersByCodigo.size - ocsConItems}\n  Items totales:  ${totalItems}`
  );

  if (!APPLY) {
    console.log('\n✅ Dry-run terminado. Re-corre con --apply para aplicar.\n');
    return;
  }

  // 6. UPSERT headers ─────────────────────────────────────────────────────
  console.log('\n─── UPSERT headers ───');
  const headerPayloads = [...headersByCodigo.values()].map((h) => ({
    empresa_id: RDB_EMPRESA_ID,
    codigo: h.codigo,
    proveedor_id: h.proveedorNombre ? (provNameToId.get(h.proveedorNombre) ?? null) : null,
    requisicion_id: h.reqCodigo ? (reqCodigoToId.get(h.reqCodigo) ?? null) : null,
    subtotal: h.subtotal,
    iva: h.iva,
    total: h.total,
    created_at: h.fechaOc ?? new Date().toISOString(),
  }));

  const { data: upserted, error: upErr } = await supabase
    .schema('erp' as never)
    .from('ordenes_compra')
    .upsert(headerPayloads, { onConflict: 'empresa_id,codigo' })
    .select('id, codigo');
  if (upErr) throw upErr;
  console.log(`  UPSERT ordenes_compra: ${upserted?.length ?? 0} filas`);

  const codigoToOcId = new Map(
    (upserted ?? []).map((r) => [(r as { codigo: string }).codigo, (r as { id: string }).id])
  );

  // 7. Limpiar detalle de OCs del sync + INSERT fresco ────────────────────
  console.log('\n─── Limpiando detalle previo (sólo OCs del sync) ───');
  const syncOcIds = [...codigoToOcId.values()];
  const DELETE_BATCH = 500;
  let deletedDet = 0;
  for (let i = 0; i < syncOcIds.length; i += DELETE_BATCH) {
    const chunk = syncOcIds.slice(i, i + DELETE_BATCH);
    const { error, count } = await supabase
      .schema('erp' as never)
      .from('ordenes_compra_detalle')
      .delete({ count: 'exact' })
      .eq('empresa_id', RDB_EMPRESA_ID)
      .in('orden_compra_id', chunk);
    if (error) throw error;
    deletedDet += count ?? 0;
  }
  console.log(`  DELETE ordenes_compra_detalle: ${deletedDet} filas`);

  console.log('\n─── INSERT detalle ───');
  const itemPayloads: Array<Record<string, unknown>> = [];
  for (const h of headersByCodigo.values()) {
    const ocId = codigoToOcId.get(h.codigo);
    if (!ocId) continue;
    const its = itemsByOcRowId.get(h.codaRowId) ?? [];
    for (const it of its) {
      itemPayloads.push({
        empresa_id: RDB_EMPRESA_ID,
        orden_compra_id: ocId,
        producto_id: null,
        descripcion: it.descripcion,
        unidad: it.unidad,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        subtotal: it.subtotal,
      });
    }
  }

  const INSERT_BATCH = 500;
  let insertedItems = 0;
  for (let i = 0; i < itemPayloads.length; i += INSERT_BATCH) {
    const chunk = itemPayloads.slice(i, i + INSERT_BATCH);
    const { error } = await supabase
      .schema('erp' as never)
      .from('ordenes_compra_detalle')
      .insert(chunk);
    if (error) throw error;
    insertedItems += chunk.length;
  }
  console.log(`  INSERT ordenes_compra_detalle: ${insertedItems} filas`);

  console.log('\n✅ Sync completo.\n');
}

main().catch((err) => {
  console.error('\n❌ Sync failed:', err);
  process.exit(1);
});
