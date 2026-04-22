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
import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getAdjuntoPath } from '../lib/adjuntos';

// baseURL explícito para evitar que una ANTHROPIC_BASE_URL seteada en el
// shell (ej. cuando este script corre dentro de Claude Code) rompa las
// llamadas apuntándolas a un proxy. El default oficial es el mismo.
const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });

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

const MODELO_CLAUDE = 'claude-opus-4-7';
const MODELO_EMBEDDING = 'text-embedding-3-large';
const EMBEDDING_DIMS = 1536;

// Anthropic API recomienda <32 MB por PDF (base64 infla ~33%, así que el
// payload real queda ~42 MB, aún bajo el límite global del endpoint). Dejamos
// margen bajando a 20 MB — por arriba de eso pasamos el PDF por Ghostscript
// /ebook (150 dpi) que baja drásticamente el tamaño sin perder legibilidad.
const PDF_COMPRESS_THRESHOLD_BYTES = 20 * 1024 * 1024;
const PDF_MAX_AFTER_COMPRESS_BYTES = 28 * 1024 * 1024;

// ─── Schema de extracción ────────────────────────────────────────────────────

const ParteSchema = z.object({
  rol: z
    .string()
    .describe(
      'Rol de esta parte en el documento: vendedor, comprador, poderdante, ' +
        'apoderado, fideicomitente, fiduciaria, fideicomisario, arrendador, ' +
        'arrendatario, otorgante, beneficiario, donante, donatario, etc. Usar minúsculas.'
    ),
  nombre: z.string().describe('Nombre completo de la persona física o moral.'),
  rfc: z.string().nullable().describe('RFC si aparece en el documento, si no null.'),
  representante: z
    .string()
    .nullable()
    .describe('Nombre del representante legal si la parte es una persona moral, si no null.'),
});

const ExtraccionSchema = z.object({
  descripcion: z
    .string()
    .max(500)
    .describe(
      'Resumen humano de 2-3 oraciones (máximo 500 caracteres) de qué contiene el documento. ' +
        'Debe incluir tipo de operación, partes principales y objeto en lenguaje natural. ' +
        'Ejemplo: "Compraventa por $1,500,000 MXN del predio urbano en Calle X #123 de Juan Pérez ' +
        'a DILESA S.A. de C.V. ante notario 42 de Piedras Negras."'
    ),
  contenido_texto: z
    .string()
    .describe(
      'Transcripción completa del documento, incluyendo encabezados, cláusulas, firmas y ' +
        'anexos. Preservar saltos de línea entre secciones. Si es escaneado ilegible, ' +
        'hacer tu mejor esfuerzo y marcar [ilegible] donde no se pueda leer.'
    ),
  tipo_operacion: z
    .string()
    .nullable()
    .describe(
      'Naturaleza legal del documento, en minúsculas y sin acentos: compraventa, donacion, ' +
        'hipoteca, poder, fideicomiso, permuta, arrendamiento, constitutiva, acta, ' +
        'testamento, convenio, etc. null si no se puede determinar.'
    ),
  monto: z
    .number()
    .nullable()
    .describe('Valor económico de la operación si aplica y está explícito. null si no aplica.'),
  moneda: z
    .string()
    .describe(
      'Moneda de la operación: MXN, USD, EUR. Default MXN si hay monto pero no se especifica moneda.'
    ),
  superficie_m2: z
    .number()
    .nullable()
    .describe(
      'Superficie en metros cuadrados si es un inmueble. Convertir hectáreas a m² (1 ha = 10,000 m²). ' +
        'null si no aplica.'
    ),
  ubicacion_predio: z
    .string()
    .nullable()
    .describe(
      'Dirección o descripción del objeto del documento (inmueble, predio, negocio). ' +
        'null si no aplica.'
    ),
  municipio: z
    .string()
    .nullable()
    .describe('Municipio donde está el objeto del documento. null si no se menciona.'),
  estado: z
    .string()
    .nullable()
    .describe(
      'Entidad federativa donde está el objeto (Coahuila, Nuevo León, Texas, etc.). ' +
        'null si no se menciona.'
    ),
  folio_real: z
    .string()
    .nullable()
    .describe('Folio real del Registro Público de la Propiedad si aparece. null si no.'),
  libro_tomo: z
    .string()
    .nullable()
    .describe(
      'Referencia al protocolo notarial (libro, tomo, foja, folio) si aparece. ' +
        'Ejemplo: "Libro 5, Tomo II, Folio 123". null si no.'
    ),
  partes: z
    .array(ParteSchema)
    .describe(
      'Todas las personas físicas o morales que intervienen en el documento con su rol. ' +
        'Incluir otorgantes, beneficiarios, testigos si son relevantes (no incluir al notario).'
    ),
});

type Extraccion = z.infer<typeof ExtraccionSchema>;

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

// Comprime un PDF con Ghostscript. /ebook = 150 dpi (default, buen balance
// calidad/tamaño). /screen = 72 dpi (más agresivo, último recurso). El OCR
// sigue siendo muy legible para Claude incluso a 72 dpi.
async function compressPdf(
  input: Uint8Array,
  preset: '/ebook' | '/screen' = '/ebook'
): Promise<Uint8Array> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpIn = join(tmpdir(), `bsop-extract-${stamp}-in.pdf`);
  const tmpOut = join(tmpdir(), `bsop-extract-${stamp}-out.pdf`);
  try {
    await writeFile(tmpIn, input);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=${preset}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${tmpOut}`,
        tmpIn,
      ]);
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`gs exit ${code}: ${stderr.slice(0, 500)}`));
      });
    });
    const out = await readFile(tmpOut);
    return new Uint8Array(out);
  } finally {
    await rm(tmpIn, { force: true }).catch(() => {});
    await rm(tmpOut, { force: true }).catch(() => {});
  }
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Intenta cada candidato (más reciente primero) hasta que uno se descargue
// exitosamente y, si es necesario, quepa después de comprimir. Reporta un
// resumen por doc al log con cada intento y la última versión lista para
// mandar a Claude.
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
      let pdf = await downloadPdf(url);
      if (pdf.byteLength > PDF_COMPRESS_THRESHOLD_BYTES) {
        const originalSize = pdf.byteLength;
        console.log(`… ${label} ${formatMB(originalSize)}, comprimiendo con gs /ebook...`);
        pdf = await compressPdf(pdf, '/ebook');
        console.log(
          `… ${label} /ebook: ${formatMB(originalSize)} → ${formatMB(pdf.byteLength)} (${Math.round((1 - pdf.byteLength / originalSize) * 100)}% menos)`
        );
        // Si /ebook no fue suficiente, intentar /screen (72 dpi, más agresivo).
        // El OCR de Claude sigue funcionando aceptablemente a 72 dpi para
        // documentos en español con letra estándar.
        if (pdf.byteLength > PDF_MAX_AFTER_COMPRESS_BYTES) {
          console.log(`… ${label} aún ${formatMB(pdf.byteLength)}, recomprimiendo con /screen...`);
          const ebookSize = pdf.byteLength;
          pdf = await compressPdf(pdf, '/screen');
          console.log(`… ${label} /screen: ${formatMB(ebookSize)} → ${formatMB(pdf.byteLength)}`);
        }
      }
      if (pdf.byteLength > PDF_MAX_AFTER_COMPRESS_BYTES) {
        throw new Error(
          `PDF sigue muy grande post-compresión: ${formatMB(pdf.byteLength)} (máx ${formatMB(PDF_MAX_AFTER_COMPRESS_BYTES)})`
        );
      }
      return pdf;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`#${i + 1}: ${msg}`);
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

// ─── Llamada a Claude con PDF ────────────────────────────────────────────────

async function extractWithClaude(pdfBytes: Uint8Array, titulo: string): Promise<Extraccion> {
  // Usamos generateObject (no generateText + Output.object) porque tiene mejor
  // prompt engineering interno para forzar JSON schema compliance y reintenta
  // automáticamente si el modelo devuelve formato inválido.
  // maxRetries=4 cubre tanto errores transitorios como schema mismatch.
  const { object } = await generateObject({
    model: anthropic(MODELO_CLAUDE),
    schema: ExtraccionSchema,
    maxRetries: 4,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Eres un asistente legal especializado en documentos notariales mexicanos. ` +
              `Analiza el siguiente PDF y extrae la información solicitada. ` +
              `El título del documento en nuestro sistema es: "${titulo}". ` +
              `Si el PDF es un escaneado, transcribe el texto lo mejor posible. ` +
              `Para campos numéricos (monto, superficie_m2), si el valor aparece ` +
              `en letra o con formato raro, conviértelo a número o usa null si no es claro. ` +
              `Usa null para cualquier campo estructurado que no puedas determinar con ` +
              `certeza, en vez de inventar o poner strings genéricas.`,
          },
          {
            type: 'file',
            data: pdfBytes,
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
  });

  return object;
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embedContent(contenido: string): Promise<number[]> {
  // text-embedding-3-large max input = 8191 tokens. Truncamos por chars como aproximación
  // conservadora (~4 chars por token). No vale la pena meter tiktoken solo para esto.
  const MAX_CHARS = 28000;
  const truncated = contenido.length > MAX_CHARS ? contenido.slice(0, MAX_CHARS) : contenido;

  const { embedding } = await embed({
    model: openai.embedding(MODELO_EMBEDDING),
    value: truncated,
    providerOptions: {
      openai: {
        dimensions: EMBEDDING_DIMS,
      },
    },
    maxRetries: 2,
  });

  if (embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding tiene ${embedding.length} dims, esperaba ${EMBEDDING_DIMS}`);
  }
  return embedding;
}

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
