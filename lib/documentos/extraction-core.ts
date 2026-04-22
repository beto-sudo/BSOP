/**
 * Helpers compartidos entre `scripts/extract-documento-contents.ts` (batch node)
 * y `app/api/documentos/[id]/extract/route.ts` (server-side Next). Todo lo que
 * aquí vive es puro/server-agnóstico: recibe bytes, devuelve bytes o JSON.
 *
 * La lógica de DB (qué docs procesar, locks, writes) y de transporte (iterar
 * candidatos, bajar del bucket) vive en los call sites, no aquí.
 */

import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';

// ─── Configuración ───────────────────────────────────────────────────────────

export const MODELO_CLAUDE = 'claude-opus-4-7';
export const MODELO_EMBEDDING = 'text-embedding-3-large';
export const EMBEDDING_DIMS = 1536;

// Anthropic recomienda <32 MB por PDF (base64 infla ~33%). Dejamos margen
// comprimiendo desde 20 MB; rechazamos si ni /screen baja de 28 MB.
export const PDF_COMPRESS_THRESHOLD_BYTES = 20 * 1024 * 1024;
export const PDF_MAX_AFTER_COMPRESS_BYTES = 28 * 1024 * 1024;

// baseURL explícito — evita que una ANTHROPIC_BASE_URL del shell (ej. cuando
// este código corre dentro de Claude Code) rompa las llamadas. Coincide con
// el default oficial.
export const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });

// ─── Zod schema compartido ───────────────────────────────────────────────────

export const ParteSchema = z.object({
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

export const ExtraccionSchema = z.object({
  descripcion: z
    .string()
    .max(500)
    .describe(
      'Resumen humano de 2-3 oraciones (máximo 500 caracteres) de qué contiene el documento. ' +
        'Debe incluir tipo de operación, partes principales y objeto en lenguaje natural.'
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
  moneda: z.string().describe('Moneda de la operación: MXN, USD, EUR. Default MXN si hay monto.'),
  superficie_m2: z
    .number()
    .nullable()
    .describe('Superficie en m² (convierte hectáreas con 1 ha = 10,000 m²). null si no aplica.'),
  ubicacion_predio: z.string().nullable(),
  municipio: z.string().nullable(),
  estado: z.string().nullable(),
  folio_real: z.string().nullable(),
  libro_tomo: z.string().nullable(),
  partes: z.array(ParteSchema),
  // Datos adicionales necesarios para estandarizar el título del documento.
  fecha_emision: z
    .string()
    .nullable()
    .describe(
      'Fecha de emisión / otorgamiento en formato YYYY-MM-DD. null si no se puede determinar.'
    ),
  numero_documento: z
    .string()
    .nullable()
    .describe('Número del documento (escritura, acta, póliza, etc.) tal cual aparece. null si no.'),
});

export type Extraccion = z.infer<typeof ExtraccionSchema>;

// ─── Compresión con Ghostscript ──────────────────────────────────────────────

export async function compressPdf(
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

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Garantiza que el PDF esté dentro del límite para enviar a Claude. Si ya
 * cabe, lo devuelve tal cual. Si excede el threshold, prueba /ebook y luego
 * /screen. Si ni /screen alcanza, lanza error con detalle.
 */
export async function ensurePdfFitsForClaude(
  pdf: Uint8Array,
  { log }: { log?: (msg: string) => void } = {}
): Promise<Uint8Array> {
  if (pdf.byteLength <= PDF_COMPRESS_THRESHOLD_BYTES) return pdf;

  const originalSize = pdf.byteLength;
  log?.(`PDF ${formatMB(originalSize)}, comprimiendo con gs /ebook...`);
  let compressed = await compressPdf(pdf, '/ebook');
  log?.(
    `/ebook: ${formatMB(originalSize)} → ${formatMB(compressed.byteLength)} (${Math.round((1 - compressed.byteLength / originalSize) * 100)}% menos)`
  );

  if (compressed.byteLength > PDF_MAX_AFTER_COMPRESS_BYTES) {
    log?.(`Aún ${formatMB(compressed.byteLength)}, recomprimiendo con /screen...`);
    const ebookSize = compressed.byteLength;
    compressed = await compressPdf(compressed, '/screen');
    log?.(`/screen: ${formatMB(ebookSize)} → ${formatMB(compressed.byteLength)}`);
  }

  if (compressed.byteLength > PDF_MAX_AFTER_COMPRESS_BYTES) {
    throw new Error(
      `PDF sigue muy grande post-compresión: ${formatMB(compressed.byteLength)} (máx ${formatMB(PDF_MAX_AFTER_COMPRESS_BYTES)})`
    );
  }
  return compressed;
}

// ─── Llamadas a los providers ─────────────────────────────────────────────────

export async function extractWithClaude(pdfBytes: Uint8Array, titulo: string): Promise<Extraccion> {
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

export async function embedContent(contenido: string): Promise<number[]> {
  // text-embedding-3-large max input = 8191 tokens. Truncamos por chars
  // (~4 chars/token conservador) sin meter tiktoken como dep extra.
  const MAX_CHARS = 28000;
  const truncated = contenido.length > MAX_CHARS ? contenido.slice(0, MAX_CHARS) : contenido;

  const { embedding } = await embed({
    model: openai.embedding(MODELO_EMBEDDING),
    value: truncated,
    providerOptions: { openai: { dimensions: EMBEDDING_DIMS } },
    maxRetries: 2,
  });

  if (embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding tiene ${embedding.length} dims, esperaba ${EMBEDDING_DIMS}`);
  }
  return embedding;
}
