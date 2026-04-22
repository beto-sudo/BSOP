/* eslint-disable @typescript-eslint/no-explicit-any --
 * Script one-off (y re-ejecutable) para poblar los campos de extracción IA
 * en erp.documentos. Los `as any` en los .schema() son necesarios porque
 * el cliente @supabase/supabase-js solo sabe del schema `public` por default.
 */
/**
 * extract-documento-contents.ts
 *
 * Procesa cada fila de erp.documentos cuyo extraccion_status sea
 * 'pendiente' o 'error' y que tenga un adjunto con rol='documento_principal'.
 * Por cada documento:
 *   1. Descarga el PDF desde el bucket privado `adjuntos`.
 *   2. Llama a Claude (claude-opus-4-7, multimodal) con el PDF y un
 *      Zod schema para extraer:
 *        - contenido_texto completo (con OCR si es escaneado)
 *        - descripcion humana (resumen <=500 chars)
 *        - campos legales estructurados (tipo_operacion, monto, moneda,
 *          superficie_m2, ubicacion_predio, municipio, estado, folio_real,
 *          libro_tomo, partes[])
 *   3. Genera embedding con OpenAI text-embedding-3-large truncado a 1536
 *      dims (Matryoshka) sobre el contenido_texto.
 *   4. Actualiza la fila marcando extraccion_status='completado'.
 *
 * Es idempotente: una segunda corrida salta los 'completado'. Los 'error'
 * sí se reintentan (útil después de arreglar un bug).
 *
 * Uso:
 *   # Preview (NO toca la DB, solo imprime lo que haría)
 *   DRY_RUN=1 npx tsx scripts/extract-documento-contents.ts
 *
 *   # Procesar solo los primeros 3 documentos
 *   LIMIT=3 npx tsx scripts/extract-documento-contents.ts
 *
 *   # Procesar un documento específico (debug)
 *   ONLY_ID=<uuid> npx tsx scripts/extract-documento-contents.ts
 *
 *   # Producción
 *   npx tsx scripts/extract-documento-contents.ts
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL     Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    Service role key (bypassa RLS + storage)
 *   ANTHROPIC_API_KEY            API key de Anthropic (claude-opus-4-7)
 *   OPENAI_API_KEY               API key de OpenAI (text-embedding-3-large)
 *   DRY_RUN=1                    No escribe en DB, solo imprime
 *   LIMIT=<n>                    Procesa máximo n docs (default: todos)
 *   ONLY_ID=<uuid>               Procesa solo ese documento (ignora LIMIT)
 *   CONCURRENCY=<n>              Docs en paralelo (default 2)
 *   EMPRESA_ID=<uuid>            Filtra por empresa
 */

import { createClient } from '@supabase/supabase-js';

import { getAdjuntoPath } from '../lib/adjuntos';
import {
  ensurePdfFitsForClaude,
  embedContent,
  extractWithClaude,
  formatMB,
  MODELO_CLAUDE,
  MODELO_EMBEDDING,
  EMBEDDING_DIMS,
  type Extraccion,
} from '../lib/documentos/extraction-core';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const ONLY_ID = process.env.ONLY_ID ?? null;
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 2;
const EMPRESA_ID = process.env.EMPRESA_ID ?? null;
const BUCKET = 'adjuntos';

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Constantes del pipeline (MODELO_CLAUDE, EMBEDDING_DIMS, PDF_*) y helpers
// puros (extractWithClaude, embedContent, ensurePdfFitsForClaude) viven en
// `lib/documentos/extraction-core.ts` y se reutilizan en el API route
// `/api/documentos/[id]/extract`. Ver ese módulo para detalles de schema Zod
// y prompt engineering.

// ─── Referencias útiles (antes definidas aquí, ahora vienen de la lib) ───────
void MODELO_EMBEDDING;
void EMBEDDING_DIMS;

// ─── Tipos de datos ──────────────────────────────────────────────────────────

type DocRow = {
  id: string;
  empresa_id: string;
  titulo: string;
  numero_documento: string | null;
  extraccion_status: string;
  // Una misma fila puede tener varios adjuntos con rol='documento_principal'
  // (p.ej. re-subidas sin limpiar el anterior). Los tratamos como candidatos:
  // se intenta en orden inverso (más reciente primero) hasta que uno funcione.
  pdf_candidates: string[];
};

// ─── Helpers DB ──────────────────────────────────────────────────────────────

async function fetchPendingDocs(): Promise<DocRow[]> {
  // Traemos documentos con status pendiente/error que tengan adjunto PDF principal.
  // Hacemos join manual porque supabase-js no soporta inner joins arbitrarios
  // con condiciones sobre la tabla unida de forma limpia entre schemas.

  let q = (supabase.schema('erp') as any)
    .from('documentos')
    .select('id, empresa_id, titulo, numero_documento, extraccion_status')
    .in('extraccion_status', ['pendiente', 'error'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (ONLY_ID) q = q.eq('id', ONLY_ID);
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
  if (LIMIT && !ONLY_ID) q = q.limit(LIMIT * 3); // margen por si algunos no tienen PDF

  const { data: docs, error } = await q;
  if (error) throw new Error(`fetch documentos: ${error.message}`);
  if (!docs || docs.length === 0) return [];

  // Traemos los adjuntos 'documento_principal' para todos esos docs. Ordenamos
  // por created_at DESC para intentar el más reciente primero — así cuando hay
  // re-subidas sin limpiar el anterior, usamos la versión vigente.
  const docIds = docs.map((d: any) => d.id);
  const { data: adjuntos, error: errAdj } = await (supabase.schema('erp') as any)
    .from('adjuntos')
    .select('entidad_id, url, rol, created_at')
    .eq('entidad_tipo', 'documento')
    .eq('rol', 'documento_principal')
    .in('entidad_id', docIds)
    .order('created_at', { ascending: false });

  if (errAdj) throw new Error(`fetch adjuntos: ${errAdj.message}`);

  const pdfsByDocId = new Map<string, string[]>();
  for (const a of adjuntos ?? []) {
    const arr = pdfsByDocId.get(a.entidad_id) ?? [];
    arr.push(a.url);
    pdfsByDocId.set(a.entidad_id, arr);
  }

  const rows: DocRow[] = [];
  for (const d of docs) {
    const pdfs = pdfsByDocId.get(d.id);
    if (!pdfs || pdfs.length === 0) continue;
    rows.push({
      id: d.id,
      empresa_id: d.empresa_id,
      titulo: d.titulo,
      numero_documento: d.numero_documento,
      extraccion_status: d.extraccion_status,
      pdf_candidates: pdfs,
    });
    if (LIMIT && rows.length >= LIMIT) break;
  }

  return rows;
}

async function downloadPdf(urlOrPath: string): Promise<Uint8Array> {
  // `erp.adjuntos.url` puede venir como path bare, URL pública, URL firmada o
  // URL del proxy `/api/adjuntos/` — `getAdjuntoPath` normaliza cualquier
  // variante al path dentro del bucket.
  const path = getAdjuntoPath(urlOrPath);
  if (!path) throw new Error(`URL/path inválido: ${urlOrPath}`);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`download(${path}): ${error.message}`);
  if (!data) throw new Error(`download(${path}): no data`);
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

// Intenta cada candidato (más reciente primero) hasta que uno se descargue
// y quepa tras compresión. Delega a `ensurePdfFitsForClaude` (lib) la lógica
// de compresión con fallback /ebook→/screen.
async function loadPdfForExtraction(
  candidates: string[],
  titulo: string,
  docIdPrefix: string
): Promise<Uint8Array> {
  const errors: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    const label = `${docIdPrefix} candidato ${i + 1}/${candidates.length}`;
    try {
      const raw = await downloadPdf(url);
      const fitted = await ensurePdfFitsForClaude(raw, {
        log: (msg) => console.log(`… ${label} ${msg}`),
      });
      return fitted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`#${i + 1}: ${msg} (${formatMB(0)})`);
      console.log(`… ${label} falló: ${msg}`);
    }
  }
  throw new Error(
    `Ninguno de los ${candidates.length} PDF candidatos funcionó para "${titulo}" — ${errors.join(' | ')}`
  );
}

async function markProcessing(id: string): Promise<boolean> {
  // Lock optimistic: solo si sigue pendiente/error — evita double processing.
  const { data, error } = await (supabase.schema('erp') as any)
    .from('documentos')
    .update({ extraccion_status: 'procesando', extraccion_error: null })
    .eq('id', id)
    .in('extraccion_status', ['pendiente', 'error'])
    .select('id');
  if (error) throw new Error(`markProcessing(${id}): ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function writeResult(id: string, extraccion: Extraccion, embedding: number[]): Promise<void> {
  const { error } = await (supabase.schema('erp') as any)
    .from('documentos')
    .update({
      descripcion: extraccion.descripcion,
      contenido_texto: extraccion.contenido_texto,
      contenido_embedding: embedding as any,
      tipo_operacion: extraccion.tipo_operacion,
      monto: extraccion.monto,
      moneda: extraccion.moneda,
      superficie_m2: extraccion.superficie_m2,
      ubicacion_predio: extraccion.ubicacion_predio,
      municipio: extraccion.municipio,
      estado: extraccion.estado,
      folio_real: extraccion.folio_real,
      libro_tomo: extraccion.libro_tomo,
      partes: extraccion.partes,
      extraccion_status: 'completado',
      extraccion_fecha: new Date().toISOString(),
      extraccion_modelo: MODELO_CLAUDE,
      extraccion_error: null,
    })
    .eq('id', id);
  if (error) throw new Error(`writeResult(${id}): ${error.message}`);
}

async function writeError(id: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const { error } = await (supabase.schema('erp') as any)
    .from('documentos')
    .update({
      extraccion_status: 'error',
      extraccion_error: msg.slice(0, 2000),
      extraccion_fecha: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error(`writeError(${id}) falló: ${error.message}`);
}

// `extractWithClaude` y `embedContent` ahora viven en
// `lib/documentos/extraction-core.ts` y se importan arriba. Así el API route
// `/api/documentos/[id]/extract` puede reutilizar exactamente las mismas
// funciones (mismo schema, mismo prompt, misma lógica de retries).

// ─── Procesamiento por documento ─────────────────────────────────────────────

type Result =
  | { ok: true; id: string; titulo: string; charsTexto: number; tipoOperacion: string | null }
  | { ok: false; id: string; titulo: string; error: string };

async function processDoc(doc: DocRow): Promise<Result> {
  const startedAt = Date.now();
  try {
    if (!DRY_RUN) {
      const locked = await markProcessing(doc.id);
      if (!locked) {
        return {
          ok: false,
          id: doc.id,
          titulo: doc.titulo,
          error: 'no se pudo lockear (otro proceso lo tomó?)',
        };
      }
    }

    const pdf = await loadPdfForExtraction(doc.pdf_candidates, doc.titulo, doc.id.slice(0, 8));
    const extraccion = await extractWithClaude(pdf, doc.titulo);
    const embedding = await embedContent(extraccion.contenido_texto);

    if (!DRY_RUN) {
      await writeResult(doc.id, extraccion, embedding);
    }

    const ms = Date.now() - startedAt;
    console.log(
      `✓ ${doc.titulo} [${doc.id.slice(0, 8)}] — ` +
        `${extraccion.contenido_texto.length} chars, ` +
        `tipo=${extraccion.tipo_operacion ?? '-'}, ` +
        `partes=${extraccion.partes.length}, ${ms}ms`
    );

    return {
      ok: true,
      id: doc.id,
      titulo: doc.titulo,
      charsTexto: extraccion.contenido_texto.length,
      tipoOperacion: extraccion.tipo_operacion,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!DRY_RUN) await writeError(doc.id, err);
    console.error(`✗ ${doc.titulo} [${doc.id.slice(0, 8)}] — ${msg}`);
    return { ok: false, id: doc.id, titulo: doc.titulo, error: msg };
  }
}

// ─── Runner con pool de concurrencia ─────────────────────────────────────────

async function runPool(docs: DocRow[]): Promise<Result[]> {
  const results: Result[] = [];
  let index = 0;

  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= docs.length) return;
      const r = await processDoc(docs[i]);
      results.push(r);
    }
  }

  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('─────────────────────────────────────────────────────');
  console.log(' extract-documento-contents');
  console.log('─────────────────────────────────────────────────────');
  console.log(` DRY_RUN      = ${DRY_RUN}`);
  console.log(` LIMIT        = ${LIMIT ?? '(todos)'}`);
  console.log(` ONLY_ID      = ${ONLY_ID ?? '-'}`);
  console.log(` EMPRESA_ID   = ${EMPRESA_ID ?? '(todas)'}`);
  console.log(` CONCURRENCY  = ${CONCURRENCY}`);
  console.log(` MODELO       = ${MODELO_CLAUDE}`);
  console.log(` EMBEDDING    = ${MODELO_EMBEDDING} @ ${EMBEDDING_DIMS} dims`);
  console.log('');

  const docs = await fetchPendingDocs();
  console.log(`Documentos a procesar: ${docs.length}`);
  if (docs.length === 0) {
    console.log('Nada que hacer. Salgo.');
    return;
  }

  const t0 = Date.now();
  const results = await runPool(docs);
  const ms = Date.now() - t0;

  const ok = results.filter((r): r is Extract<Result, { ok: true }> => r.ok);
  const bad = results.filter((r): r is Extract<Result, { ok: false }> => !r.ok);

  console.log('');
  console.log('─── Reporte ─────────────────────────────────────────');
  console.log(`Total:         ${results.length}`);
  console.log(`Completados:   ${ok.length}`);
  console.log(`Errores:       ${bad.length}`);
  console.log(`Tiempo total:  ${(ms / 1000).toFixed(1)}s`);
  console.log(`Promedio:      ${(ms / Math.max(1, results.length) / 1000).toFixed(1)}s/doc`);

  if (bad.length > 0) {
    console.log('');
    console.log('Errores:');
    for (const b of bad) {
      console.log(`  - ${b.titulo} [${b.id.slice(0, 8)}]: ${b.error}`);
    }
  }

  if (DRY_RUN) {
    console.log('');
    console.log('⚠️  DRY_RUN=1 — no se escribió nada en la DB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
