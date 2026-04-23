/**
 * sync_rdb_requisiciones_from_coda.ts
 *
 * Jala requisiciones + items del doc de RDB en Coda (yvrM3UilPt) y los
 * reconstruye en erp.requisiciones / erp.requisiciones_detalle para la
 * empresa RDB.
 *
 * Flujo en modo --apply (idempotente, preserva FK de erp.ordenes_compra):
 *   1. UPSERT headers por (empresa_id, codigo) — mantiene el id cuando ya existe
 *   2. Para cada requisición del sync: DELETE su detalle + INSERT detalle fresco
 *   3. Requisiciones existentes en BSOP cuyo código NO está en Coda se IGNORAN
 *      (no se borran para no romper OCs referenciadas).
 *
 * Mapeo de solicitantes: por email contra core.usuarios. Los emails que no
 * existen se reportan y quedan con solicitante_id = NULL.
 *
 * Uso:
 *   npx tsx scripts/sync_rdb_requisiciones_from_coda.ts            # dry-run
 *   npx tsx scripts/sync_rdb_requisiciones_from_coda.ts --apply    # ejecuta
 *
 * Env requeridos (lee /Users/Beto/BSOP/.env.local automáticamente):
 *   CODA_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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
const REQS_TABLE_ID = 'grid-Dfk-DXagK0';
const ITEMS_TABLE_ID = 'grid-JV--pd0wEt';
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
}

interface RequisicionHeader {
  codaRowId: string;
  codigo: string;
  solicitanteEmail: string | null;
  comentarios: string | null;
  fechaRequerida: string | null;
  fechaAutorizada: string | null;
  createdAt: string | null;
}

interface RequisicionItem {
  requisicionCodaRowId: string;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  precio: number | null;
  proveedorSugerido: string | null;
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
  const obj = v as Record<string, unknown>;
  if (Array.isArray(v)) {
    return v.length ? asStructured(v[0]) : null;
  }
  return obj as CodaStructuredValue;
}

function asDateIso(v: unknown): string | null {
  const s = typeof v === 'string' ? v : null;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function asDateOnly(v: unknown): string | null {
  // Coda puede devolver "4/22/2026 9:05:09 AM" como texto libre o un ISO.
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

// ─── Extract ─────────────────────────────────────────────────────────────────

function parseHeader(r: CodaRow): RequisicionHeader | null {
  const v = r.values;
  const codigo = asString(v['ID Requisición']);
  if (!codigo) return null;

  const solicitante = asStructured(v['Solicitante']);
  const autorizada = asStructured(v['Requisición Autorizada por']);

  return {
    codaRowId: r.id,
    codigo,
    solicitanteEmail: solicitante?.email ?? null,
    comentarios: asString(v['Comentarios']),
    fechaRequerida: asDateOnly(v['Fecha Requerida']),
    fechaAutorizada: asDateIso(v['Fecha Autorizada']),
    createdAt: asDateIso(v['Fecha']),
    // autorizadaPor omitido — BSOP no lo guarda aún
    _autorizadaEmail: autorizada?.email ?? null,
  } as RequisicionHeader & { _autorizadaEmail: string | null };
}

function parseItem(r: CodaRow): RequisicionItem | null {
  const v = r.values;
  const req = asStructured(v['Requisición']);
  if (!req?.rowId) return null;

  const producto = asStructured(v['Producto']);
  const presentacion = asStructured(v['Presentación']);
  const descripcion = producto?.name ?? asString(v['Producto']);
  const cantidad = asNumber(v['Cantidad Solicitada']) ?? 0;

  return {
    requisicionCodaRowId: req.rowId,
    descripcion,
    unidad: presentacion?.name ?? null,
    cantidad,
    precio: asNumber(v['Precio Unitario']),
    proveedorSugerido: asString(v['Proveedor Sugerido']),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY required');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env required');

  console.log(`\n🔄 Sync RDB requisiciones — Coda doc ${CODA_DOC_ID}`);
  console.log(APPLY ? '⚠️  --apply mode: cambios SE ESCRIBEN' : '📋 dry-run (no writes)');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Fetch Coda ──────────────────────────────────────────────────────────
  console.log('\n─── Fetching Coda ───');
  const [reqRows, itemRows] = await Promise.all([
    fetchAllRows(REQS_TABLE_ID),
    fetchAllRows(ITEMS_TABLE_ID),
  ]);
  console.log(`  ${reqRows.length} requisiciones, ${itemRows.length} items`);

  const headers = reqRows.map(parseHeader).filter((h): h is RequisicionHeader => h !== null);
  const items = itemRows.map(parseItem).filter((i): i is RequisicionItem => i !== null);

  // 2. Dedupe headers por código (Coda puede tener rowId distinto con mismo código — mantenemos el primero) ─
  const headersByCodigo = new Map<string, RequisicionHeader>();
  for (const h of headers) {
    if (!headersByCodigo.has(h.codigo)) headersByCodigo.set(h.codigo, h);
  }
  console.log(`  ${headersByCodigo.size} requisiciones únicas por código`);

  // 3. Solicitante email → user id ─────────────────────────────────────────
  const emails = new Set<string>();
  for (const h of headers) if (h.solicitanteEmail) emails.add(h.solicitanteEmail);

  const { data: usersMatched, error: usersErr } = await supabase
    .schema('core' as never)
    .from('usuarios')
    .select('id, email')
    .in('email', [...emails]);
  if (usersErr) throw usersErr;

  const emailToUserId = new Map((usersMatched ?? []).map((u) => [u.email, u.id]));
  const unmatchedEmails = [...emails].filter((e) => !emailToUserId.has(e));

  console.log('\n─── Mapeo de solicitantes ───');
  for (const e of emails) {
    const id = emailToUserId.get(e);
    const n = headers.filter((h) => h.solicitanteEmail === e).length;
    console.log(
      `  ${id ? '✓' : '✗'} ${e.padEnd(40)} ${String(n).padStart(4)}  ${id ?? 'NO EXISTE → NULL'}`
    );
  }
  if (unmatchedEmails.length) {
    console.log(`\n  ⚠ ${unmatchedEmails.length} emails sin match → solicitante_id = NULL`);
  }

  // 4. Construir payloads ──────────────────────────────────────────────────
  const itemsByReqRowId = new Map<string, RequisicionItem[]>();
  for (const it of items) {
    const arr = itemsByReqRowId.get(it.requisicionCodaRowId) ?? [];
    arr.push(it);
    itemsByReqRowId.set(it.requisicionCodaRowId, arr);
  }

  // Stats
  let reqsConItems = 0;
  let totalItems = 0;
  for (const h of headersByCodigo.values()) {
    const its = itemsByReqRowId.get(h.codaRowId) ?? [];
    if (its.length) reqsConItems++;
    totalItems += its.length;
  }
  console.log(
    `\n─── Resumen ───\n  Requisiciones totales:      ${headersByCodigo.size}\n  Con ≥1 item:                ${reqsConItems}\n  Sin items:                  ${headersByCodigo.size - reqsConItems}\n  Items totales:              ${totalItems}`
  );

  if (!APPLY) {
    console.log('\n✅ Dry-run terminado. Re-corre con --apply para aplicar.\n');
    return;
  }

  // 5. UPSERT headers (preserva IDs existentes por empresa_id+codigo) ────
  console.log('\n─── UPSERT headers ───');
  const headerPayloads = [...headersByCodigo.values()].map((h) => ({
    empresa_id: RDB_EMPRESA_ID,
    codigo: h.codigo,
    solicitante_id: h.solicitanteEmail ? (emailToUserId.get(h.solicitanteEmail) ?? null) : null,
    justificacion: h.comentarios,
    fecha_requerida: h.fechaRequerida,
    autorizada_at: h.fechaAutorizada,
    created_at: h.createdAt ?? new Date().toISOString(),
  }));

  const { data: upserted, error: upErr } = await supabase
    .schema('erp' as never)
    .from('requisiciones')
    .upsert(headerPayloads, { onConflict: 'empresa_id,codigo' })
    .select('id, codigo');
  if (upErr) throw upErr;
  console.log(`  UPSERT requisiciones: ${upserted?.length ?? 0} filas`);

  const codigoToReqId = new Map((upserted ?? []).map((r) => [r.codigo, r.id]));

  // 6. Limpiar + recargar detalle sólo de las requisiciones del sync ──────
  console.log('\n─── Limpiando detalle previo (sólo reqs del sync) ───');
  const syncReqIds = [...codigoToReqId.values()];
  const DELETE_BATCH = 500;
  let deletedDet = 0;
  for (let i = 0; i < syncReqIds.length; i += DELETE_BATCH) {
    const chunk = syncReqIds.slice(i, i + DELETE_BATCH);
    const { error, count } = await supabase
      .schema('erp' as never)
      .from('requisiciones_detalle')
      .delete({ count: 'exact' })
      .eq('empresa_id', RDB_EMPRESA_ID)
      .in('requisicion_id', chunk);
    if (error) throw error;
    deletedDet += count ?? 0;
  }
  console.log(`  DELETE requisiciones_detalle: ${deletedDet} filas (solo reqs del sync)`);

  console.log('\n─── INSERT detalle ───');
  const itemPayloads: Array<Record<string, unknown>> = [];
  for (const h of headersByCodigo.values()) {
    const reqId = codigoToReqId.get(h.codigo);
    if (!reqId) continue;
    const its = itemsByReqRowId.get(h.codaRowId) ?? [];
    for (const it of its) {
      itemPayloads.push({
        empresa_id: RDB_EMPRESA_ID,
        requisicion_id: reqId,
        producto_id: null,
        descripcion: it.descripcion,
        unidad: it.unidad,
        cantidad: it.cantidad,
        precio_estimado: it.precio,
        notas: it.proveedorSugerido,
      });
    }
  }

  const INSERT_BATCH = 500;
  let insertedItems = 0;
  for (let i = 0; i < itemPayloads.length; i += INSERT_BATCH) {
    const chunk = itemPayloads.slice(i, i + INSERT_BATCH);
    const { error } = await supabase
      .schema('erp' as never)
      .from('requisiciones_detalle')
      .insert(chunk);
    if (error) throw error;
    insertedItems += chunk.length;
  }
  console.log(`  INSERT requisiciones_detalle: ${insertedItems} filas`);

  console.log('\n✅ Sync completo.\n');
}

main().catch((err) => {
  console.error('\n❌ Sync failed:', err);
  process.exit(1);
});
