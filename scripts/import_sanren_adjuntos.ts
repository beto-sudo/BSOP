/**
 * import_sanren_adjuntos.ts
 *
 * Sprint 2 de `sanren-servicios`: migra los adjuntos de los recibos del doc
 * Coda (MaXoDlRxXE / "Recibos") al bucket `adjuntos` de BSOP y los liga a cada
 * `sanren.recibos`:
 *
 *   - Coda "Recibo" (PDF del recibo)   → rol='recibo'      → recibos.recibo_adjunto_id
 *   - Coda "Pago"   (comprobante pago)  → rol='comprobante' → recibos.comprobante_adjunto_id
 *
 * Flujo por archivo (replica scripts/import_dilesa_anteproyecto_documentos_coda.ts):
 *   1. Descarga de codahosted.io (CDN público, sin auth).
 *   2. Sube a Storage `adjuntos` en `sanren/recibos/<reciboId>/<ts>-<slug>`.
 *   3. Inserta en `erp.adjuntos` (empresa=sanren, entidad_tipo='recibo',
 *      entidad_id=reciboId, url=<path>, rol).
 *   4. Puebla el link en `sanren.recibos`.
 *
 * Idempotente: si ya existe un erp.adjuntos para (recibo, rol) se reusa su id
 * (re-liga si hiciera falta) y no se re-sube.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_sanren_adjuntos.ts   # dry-run
 *   npx tsx scripts/import_sanren_adjuntos.ts             # aplica
 *
 * Env (lee /Users/Beto/BSOP/.env.local; CODA_API_KEY inyectable inline):
 *   CODA_API_KEY · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { CodaClient } from '@/lib/coda-api';
import { buildAdjuntoPath } from '@/lib/storage';

dotenv.config({ path: path.resolve('/Users/Beto/BSOP/.env.local') });

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const DOC_ID = 'MaXoDlRxXE';
const TABLE_ID = 'grid-ItvEVXa37s';

type Rol = 'recibo' | 'comprobante';
const COLS: { coda: string; rol: Rol; link: 'recibo_adjunto_id' | 'comprobante_adjunto_id' }[] = [
  { coda: 'Recibo', rol: 'recibo', link: 'recibo_adjunto_id' },
  { coda: 'Pago', rol: 'comprobante', link: 'comprobante_adjunto_id' },
];

/** Coda da los attachments como objeto único o array; normalizamos. */
function readAttachments(v: unknown): { name: string; url: string }[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: { name: string; url: string }[] = [];
  for (const a of arr) {
    if (a && typeof a === 'object') {
      const o = a as Record<string, unknown>;
      if (typeof o.url === 'string' && typeof o.name === 'string') {
        out.push({ name: o.name, url: o.url });
      }
    }
  }
  return out;
}

async function main() {
  if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY (inyéctalo con op read).');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase.');

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const coda = new CodaClient(CODA_API_KEY);

  // empresa SANREN
  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'sanren')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró empresa sanren: ${empErr?.message}`);
  const empresaId = emp.id;

  // recibos: coda_row_id → id
  const { data: recibosRaw, error: recErr } = await sb
    .schema('sanren')
    .from('recibos')
    .select('id, coda_row_id, recibo_adjunto_id, comprobante_adjunto_id');
  if (recErr) throw new Error(`recibos select: ${recErr.message}`);
  const recibos = (recibosRaw ?? []) as {
    id: string;
    coda_row_id: string | null;
    recibo_adjunto_id: string | null;
    comprobante_adjunto_id: string | null;
  }[];
  const reciboByCoda = new Map(
    recibos.filter((r) => r.coda_row_id).map((r) => [r.coda_row_id!, r])
  );

  // adjuntos ya existentes (idempotencia): (entidad_id|rol) → adjunto.id
  const { data: existRaw } = await sb
    .schema('erp')
    .from('adjuntos')
    .select('id, entidad_id, rol')
    .eq('empresa_id', empresaId)
    .eq('entidad_tipo', 'recibo');
  const existByKey = new Map(
    ((existRaw ?? []) as { id: string; entidad_id: string; rol: string }[]).map((a) => [
      `${a.entidad_id}|${a.rol}`,
      a.id,
    ])
  );

  // columnas Coda Recibo/Pago
  const cols = await coda.listColumns(DOC_ID, TABLE_ID);
  const codaColId = (name: string) => cols.find((c) => c.name === name)?.id;
  const rows = await coda.listRowsAll(DOC_ID, TABLE_ID, { valueFormat: 'rich', limit: 500 });

  let subidos = 0;
  let religados = 0;
  let skip = 0;
  let fail = 0;
  let sinRecibo = 0;

  for (const row of rows) {
    const recibo = reciboByCoda.get(row.id);
    if (!recibo) {
      sinRecibo++;
      continue;
    }
    const vals = row.values as Record<string, unknown>;

    for (const { coda: codaName, rol, link } of COLS) {
      const colId = codaColId(codaName);
      const attachments = colId ? readAttachments(vals[colId]) : [];
      if (attachments.length === 0) continue;
      const a = attachments[0]; // 1 archivo por rol (el primero si hubiera varios)

      const key = `${recibo.id}|${rol}`;
      const existingId = existByKey.get(key);
      if (existingId) {
        // ya migrado — asegurar el link
        if (recibo[link] !== existingId && !DRY_RUN) {
          await sb
            .schema('sanren')
            .from('recibos')
            .update({ [link]: existingId })
            .eq('id', recibo.id);
          religados++;
        } else {
          skip++;
        }
        continue;
      }

      const objPath = buildAdjuntoPath({
        empresa: 'sanren',
        entidad: 'recibos',
        entidadId: recibo.id,
        filename: a.name,
      });

      if (DRY_RUN) {
        console.log(`[dry] ${rol.padEnd(11)} ${row.name} | ${a.name} → ${objPath}`);
        subidos++;
        continue;
      }

      try {
        const resp = await fetch(a.url);
        if (!resp.ok) {
          console.log(`  ✗ download ${resp.status}: ${row.name} | ${a.name}`);
          fail++;
          continue;
        }
        const buf = new Uint8Array(await resp.arrayBuffer());
        const mime = resp.headers.get('content-type') ?? 'application/octet-stream';

        const { error: upErr } = await sb.storage
          .from('adjuntos')
          .upload(objPath, buf, { upsert: false, contentType: mime });
        if (upErr) {
          console.log(`  ✗ upload: ${row.name} | ${a.name} | ${upErr.message}`);
          fail++;
          continue;
        }

        const { data: adj, error: insErr } = await sb
          .schema('erp')
          .from('adjuntos')
          .insert({
            empresa_id: empresaId,
            entidad_tipo: 'recibo',
            entidad_id: recibo.id,
            nombre: a.name,
            url: objPath,
            tipo_mime: mime,
            tamano_bytes: buf.byteLength,
            rol,
          })
          .select('id')
          .single();
        if (insErr || !adj) {
          await sb.storage.from('adjuntos').remove([objPath]);
          console.log(`  ✗ insert adjunto: ${row.name} | ${a.name} | ${insErr?.message}`);
          fail++;
          continue;
        }

        const { error: linkErr } = await sb
          .schema('sanren')
          .from('recibos')
          .update({ [link]: adj.id })
          .eq('id', recibo.id);
        if (linkErr) {
          console.log(`  ⚠ link fail: ${row.name} | ${rol} | ${linkErr.message}`);
        }
        console.log(`  ✓ ${rol.padEnd(11)} ${row.name} | ${a.name} (${buf.byteLength} b)`);
        subidos++;
      } catch (e) {
        console.log(`  ✗ ${row.name} | ${a.name} | ${e instanceof Error ? e.message : e}`);
        fail++;
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? '[DRY-RUN] ' : ''}Resumen: subidos=${subidos} · religados=${religados} · ya estaban=${skip} · fallidos=${fail} · filas Coda sin recibo en BSOP=${sinRecibo}`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
