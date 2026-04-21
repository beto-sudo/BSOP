/* eslint-disable @typescript-eslint/no-explicit-any --
 * Script one-off para ligar archivos existentes en el bucket `adjuntos` con
 * sus filas en erp.documentos. Los `as any` en los .schema() son necesarios
 * porque el cliente `@supabase/supabase-js` solo sabe del schema `public`
 * por default; tipar el cliente completo cae fuera del alcance de este
 * script de mantenimiento.
 */
/**
 * link-documentos-adjuntos.ts
 *
 * Recorre el bucket `adjuntos` en Supabase y vincula los archivos
 * sueltos (PDFs, imágenes, anexos) a su fila en `erp.documentos` creando
 * filas en `erp.adjuntos` con el `rol` correcto.
 *
 * Contexto: la mayoría de los PDFs e imágenes de DILESA se subieron
 * directamente al bucket antes de que el módulo de Documentos manejara
 * los adjuntos de forma estructurada. Resultado: muchas filas en
 * erp.documentos aparecen sin archivos en la UI aunque los archivos
 * sí existen físicamente.
 *
 * Estrategia de match (por cada archivo en el bucket):
 *   1. Deriva número de escritura y año del nombre del archivo usando
 *      varios patrones observados en las escrituras de DILESA:
 *        - "DILESA-YYYY-MM-Escritura NÚMERO XXX-..."
 *        - "DILESA-YYYY-MM Escritura Numero XXX-..."
 *        - "Dilesa-YYYY-MM-Escritura #XXX-..."
 *        - "YYYY-MM-ECRITURA XX ..." (typo histórico "ECRITURA")
 *        - "DILESA-YYYY-MM Escritura Declaracion Unilateral ..." (sin número → match por año/mes)
 *   2. Busca la fila de erp.documentos con ese empresa_id que coincida por:
 *        - numero_documento == número parseado, y
 *        - year(fecha_emision) == año parseado (si hay año)
 *      Si hay múltiples, usa mes también. Si sigue ambiguo, reporta y salta.
 *   3. Clasifica el rol según la extensión:
 *        - .pdf → documento_principal
 *        - .jpg/.jpeg/.png/.gif/.webp/.tiff → imagen_referencia
 *        - resto → anexo
 *   4. Salta si ya existe una fila en erp.adjuntos con la misma (entidad_id,
 *      url) — idempotente.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/link-documentos-adjuntos.ts
 *   npx tsx scripts/link-documentos-adjuntos.ts
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS + storage)
 *   DILESA_EMPRESA_ID         – (opcional) limita a esta empresa
 *                               SELECT id FROM core.empresas WHERE slug='dilesa'
 *   BUCKET_PREFIX             – (opcional) prefijo a recorrer (default: '')
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const EMPRESA_ID_FILTER = process.env.DILESA_EMPRESA_ID ?? '';
const BUCKET_PREFIX = process.env.BUCKET_PREFIX ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const BUCKET = 'adjuntos';

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StorageObject = {
  name: string;
  id: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

type Documento = {
  id: string;
  empresa_id: string;
  titulo: string;
  numero_documento: string | null;
  fecha_emision: string | null;
};

type ParsedName = {
  numero: string | null;
  year: number | null;
  month: number | null;
};

// ─── Listado recursivo del bucket ────────────────────────────────────────────

async function listBucketRecursive(
  prefix: string
): Promise<{ path: string; obj: StorageObject }[]> {
  const out: { path: string; obj: StorageObject }[] = [];
  const stack: string[] = [prefix];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let offset = 0;
    const pageSize = 1000;
    // Paginamos por si alguna carpeta tiene >1000 entradas.
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(current, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`list(${current}): ${error.message}`);
      if (!data || data.length === 0) break;

      for (const entry of data as StorageObject[]) {
        const full = current ? `${current}/${entry.name}` : entry.name;
        // Las "carpetas" devueltas por list tienen id === null.
        if (entry.id == null) {
          stack.push(full);
        } else {
          out.push({ path: full, obj: entry });
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }

  return out;
}

// ─── Parsing de nombre ────────────────────────────────────────────────────────

function parseFilename(filename: string): ParsedName {
  // Trabajamos solo con el último segmento del path y sin la extensión.
  const base = filename.split('/').pop() ?? filename;
  const stem = base.replace(/\.[^.]+$/, '');
  // Normalizamos espacios, guiones dobles y acentos comunes.
  const norm = stem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Año / mes (YYYY-MM o YYYY MM al inicio, posiblemente tras "DILESA-").
  let year: number | null = null;
  let month: number | null = null;
  const ymMatch = norm.match(/(?:^|[-\s])(\d{4})[-\s](\d{1,2})(?:[-\s]|$)/);
  if (ymMatch) {
    const y = parseInt(ymMatch[1], 10);
    const m = parseInt(ymMatch[2], 10);
    if (y >= 1990 && y <= 2100) year = y;
    if (m >= 1 && m <= 12) month = m;
  }

  // Número de escritura: busca tras palabras como "Escritura", "ECRITURA",
  // "Numero", "Número", "No." o "#".
  let numero: string | null = null;
  const patterns: RegExp[] = [
    /(?:escritura|ecritura)\s*(?:numero|número|no\.?|#)?\s*(\d{1,6})/i,
    /(?:numero|número|no\.?|#)\s*(\d{1,6})/i,
  ];
  for (const re of patterns) {
    const m = norm.match(re);
    if (m) {
      numero = m[1];
      break;
    }
  }

  return { numero, year, month };
}

/**
 * Normaliza cualquier URL o path al path del objeto dentro del bucket
 * `adjuntos`. Equivalente a `lib/adjuntos.ts#getAdjuntoPath` pero
 * autocontenido para que el script corra sin imports del app.
 */
function normalizePath(value: string | null | undefined): string {
  if (!value) return '';
  const v = String(value).trim();
  const markers = [
    '/object/public/adjuntos/',
    '/object/sign/adjuntos/',
    '/object/authenticated/adjuntos/',
    '/api/adjuntos/',
  ];
  for (const m of markers) {
    const i = v.indexOf(m);
    if (i >= 0) {
      const tail = v.slice(i + m.length);
      const q = tail.indexOf('?');
      return q >= 0 ? tail.slice(0, q) : tail;
    }
  }
  return v.replace(/^\/+/, '');
}

function roleFromExt(filename: string): 'documento_principal' | 'imagen_referencia' | 'anexo' {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  if (ext === 'pdf') return 'documento_principal';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif'].includes(ext))
    return 'imagen_referencia';
  return 'anexo';
}

function mimeFromExt(filename: string): string | null {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] ?? null;
}

// ─── Carga documentos candidatos ──────────────────────────────────────────────

async function loadDocumentos(): Promise<Documento[]> {
  let query = supabase
    .schema('erp' as any)
    .from('documentos')
    .select('id, empresa_id, titulo, numero_documento, fecha_emision')
    .is('deleted_at', null);
  if (EMPRESA_ID_FILTER) query = query.eq('empresa_id', EMPRESA_ID_FILTER);
  const { data, error } = await query;
  if (error) throw new Error(`load documentos: ${error.message}`);
  return (data ?? []) as Documento[];
}

function matchDocumento(parsed: ParsedName, docs: Documento[]): Documento | null {
  if (!parsed.numero) return null;
  const candidates = docs.filter((d) => d.numero_documento === parsed.numero);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Desempatar por año/mes de fecha_emision.
  if (parsed.year != null) {
    const byYear = candidates.filter((d) => {
      if (!d.fecha_emision) return false;
      return parseInt(d.fecha_emision.slice(0, 4), 10) === parsed.year;
    });
    if (byYear.length === 1) return byYear[0];
    if (byYear.length > 1 && parsed.month != null) {
      const byMonth = byYear.filter((d) => {
        if (!d.fecha_emision) return false;
        return parseInt(d.fecha_emision.slice(5, 7), 10) === parsed.month;
      });
      if (byMonth.length === 1) return byMonth[0];
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔗 link-documentos-adjuntos — DRY_RUN=${DRY_RUN}`);
  console.log(`   Bucket: ${BUCKET}  Prefix: '${BUCKET_PREFIX}'`);
  console.log(`   Empresa filter: ${EMPRESA_ID_FILTER || '(none, all empresas)'}\n`);

  console.log('📄 Cargando documentos…');
  const docs = await loadDocumentos();
  console.log(`   ${docs.length} documentos candidatos\n`);

  console.log('🪣  Listando bucket…');
  const files = await listBucketRecursive(BUCKET_PREFIX);
  console.log(`   ${files.length} archivos en bucket\n`);

  // Cargamos adjuntos ya registrados para no duplicar. Normalizamos `url`
  // al path canónico (pudo haberse guardado como URL pública legacy).
  const existing = new Set<string>();
  {
    let from = 0;
    const step = 1000;
    for (;;) {
      const { data, error } = await supabase
        .schema('erp' as any)
        .from('adjuntos')
        .select('entidad_id, url')
        .eq('entidad_tipo', 'documento')
        .range(from, from + step - 1);
      if (error) throw new Error(`load adjuntos: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data as { entidad_id: string; url: string }[]) {
        const p = normalizePath(row.url);
        existing.add(`${row.entidad_id}::${p}`);
      }
      if (data.length < step) break;
      from += step;
    }
  }
  console.log(`   ${existing.size} adjuntos ya registrados\n`);

  const report = {
    total: files.length,
    matched: 0,
    skipped_existing: 0,
    no_number: 0,
    no_match: 0,
    ambiguous: 0,
    inserted: 0,
  };
  const unmatched: { path: string; reason: string }[] = [];

  for (const { path, obj } of files) {
    const base = path.split('/').pop() ?? path;
    const parsed = parseFilename(base);
    if (!parsed.numero) {
      report.no_number += 1;
      unmatched.push({ path, reason: 'no_number_parsed' });
      continue;
    }
    const doc = matchDocumento(parsed, docs);
    if (!doc) {
      const n = docs.filter((d) => d.numero_documento === parsed.numero).length;
      if (n > 1) {
        report.ambiguous += 1;
        unmatched.push({ path, reason: `ambiguous_n${n}_numero${parsed.numero}` });
      } else {
        report.no_match += 1;
        unmatched.push({ path, reason: `no_match_numero${parsed.numero}` });
      }
      continue;
    }

    const key = `${doc.id}::${path}`;
    if (existing.has(key)) {
      report.skipped_existing += 1;
      continue;
    }
    report.matched += 1;

    const rol = roleFromExt(base);
    const mime = mimeFromExt(base);
    const size = obj.metadata?.size ?? null;

    if (DRY_RUN) {
      console.log(`  [${rol}] ${path}  →  ${doc.titulo} (${doc.id})`);
      continue;
    }

    const { error: insErr } = await supabase
      .schema('erp' as any)
      .from('adjuntos')
      .insert({
        empresa_id: doc.empresa_id,
        entidad_tipo: 'documento',
        entidad_id: doc.id,
        nombre: base,
        url: path,
        tipo_mime: mime,
        tamano_bytes: size,
        rol,
      });
    if (insErr) {
      console.error(`❌ insert failed for ${path}: ${insErr.message}`);
      continue;
    }
    report.inserted += 1;
    if (report.inserted % 25 === 0) {
      process.stdout.write(`   Inserted ${report.inserted}…\r`);
    }
  }

  console.log('\n───── Reporte ─────');
  console.log(`Total archivos:      ${report.total}`);
  console.log(`Matched candidatos:  ${report.matched}`);
  console.log(`Ya ligados (skip):   ${report.skipped_existing}`);
  console.log(`Sin número:          ${report.no_number}`);
  console.log(`Sin match:           ${report.no_match}`);
  console.log(`Ambiguos:            ${report.ambiguous}`);
  if (!DRY_RUN) console.log(`Insertados:          ${report.inserted}`);

  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} archivos no ligados — primeros 20:`);
    for (const u of unmatched.slice(0, 20)) {
      console.log(`   [${u.reason}] ${u.path}`);
    }
    if (unmatched.length > 20) {
      console.log(`   … y ${unmatched.length - 20} más`);
    }
  }

  if (DRY_RUN) console.log('\n🛑 DRY RUN — no se escribió nada.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
