/**
 * Helpers compartidos entre `scripts/extract-documento-contents.ts` (batch node)
 * y `app/api/documentos/[id]/extract/route.ts` (server-side Next). Todo lo que
 * aquí vive es puro/server-agnóstico: recibe bytes, devuelve bytes o JSON.
 *
 * La lógica de DB (qué docs procesar, locks, writes) y de transporte (iterar
 * candidatos, bajar del bucket) vive en los call sites, no aquí.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';

// Ghostscript via WebAssembly (~16 MB de bundle, pero funciona en cualquier
// runtime: Mac local, Vercel Functions, Linux CI, etc. Antes usábamos spawn
// del binary nativo de gs, lo cual rompía en serverless donde no hay gs).
// Import dinámico para no cargar el wasm en módulos que no lo usan.
type GsModuleFactory = (init?: unknown) => Promise<{
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
}>;

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

/**
 * Metadata específica para escrituras notariales mexicanas (constitutivas,
 * reformas, poderes, compraventas, etc.). Se persiste en
 * `erp.documentos.subtipo_meta` (jsonb) y la consume:
 *
 *   - El sync_trigger de `core.empresa_documentos` (lo proyecta al jsonb
 *     caché en `core.empresas.escritura_constitutiva` / `escritura_poder`).
 *   - El validador de RH `lib/rh/datos-fiscales-empresa.ts` (vía caché).
 *   - El printable de contrato laboral (vía caché).
 *
 * Solo se llena cuando el documento es una escritura/acta/poder. Para otros
 * tipos (factura, contrato laboral, comprobante de domicilio), debe quedar
 * null. La IA decide en función de `tipo_operacion`.
 */
export const SubtipoMetaEscrituraSchema = z
  .object({
    numero_escritura: z
      .string()
      .nullable()
      .describe('Número de la escritura tal como aparece (ej. "12,345" o "12345"). null si no.'),
    fecha_escritura: z
      .string()
      .nullable()
      .describe('Fecha de otorgamiento en formato YYYY-MM-DD. null si no se puede determinar.'),
    fecha_texto: z
      .string()
      .nullable()
      .describe(
        'Fecha en texto legible tal como aparece en el cuerpo del instrumento ' +
          '(ej. "quince de mayo del dos mil diez"). Útil para reproducir literal en contratos. null si no.'
      ),
    notario_nombre: z
      .string()
      .nullable()
      .describe(
        'Nombre completo del notario público que da fe (ej. "JUAN PÉREZ LÓPEZ"). null si no.'
      ),
    notaria_numero: z
      .string()
      .nullable()
      .describe('Número de la notaría (texto, ej. "5" o "Cinco"). null si no aparece.'),
    distrito_notarial: z
      .string()
      .nullable()
      .describe(
        'Distrito notarial / municipio donde ejerce el notario ' +
          '(ej. "PIEDRAS NEGRAS", "DISTRITO FEDERAL"). null si no aparece.'
      ),
    // Campos extras útiles para poderes (auto-sugerir rol al asignar en UI)
    tipo_poder: z
      .string()
      .nullable()
      .describe(
        'Solo para poderes: clase de poder otorgado, en minúsculas y sin acentos: ' +
          '"general para actos de administracion", "general para actos de dominio", ' +
          '"general para pleitos y cobranzas", "especial para actos bancarios", etc. ' +
          'null si no es poder o no se puede determinar.'
      ),
    alcance: z
      .string()
      .nullable()
      .describe(
        'Solo para poderes: resumen breve del alcance/facultades otorgadas ' +
          '(ej. "contratación laboral, IMSS, SAT, contratos comerciales generales"). ' +
          'null si no es poder.'
      ),
  })
  .nullable()
  .describe(
    'Metadata específica de escrituras notariales (constitutiva, reforma, poder, ' +
      'compraventa, etc.). Llenar SOLO si tipo_operacion es uno de estos: ' +
      'escritura, constitutiva, reforma, acta, poder, compraventa, hipoteca, fideicomiso, ' +
      'donacion, permuta. Para facturas, contratos laborales, comprobantes y demás → null.'
  );

export const ExtraccionSchema = z.object({
  descripcion: z
    .string()
    .max(1500)
    .describe(
      'Resumen humano del documento (máximo ~1500 caracteres). Para escrituras simples ' +
        '(una sola operación), 2-3 oraciones bastan (~300-500 chars). Para escrituras ' +
        'complejas que contienen varios actos jurídicos en un mismo instrumento ' +
        '(ej. compraventa + declaración unilateral + liberación de reserva), incluye ' +
        'cada acto brevemente. Siempre menciona partes principales, objeto y montos clave.'
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
  subtipo_meta: SubtipoMetaEscrituraSchema,
});

export type Extraccion = z.infer<typeof ExtraccionSchema>;

// ─── Compresión con Ghostscript (WASM) ───────────────────────────────────────

// Cache singleton del módulo wasm — la inicialización (parse del .wasm,
// compile, instanciate) es ~500ms y se reusa entre invocaciones de la
// misma función serverless o del mismo proceso del script batch.
let cachedGsModulePromise: ReturnType<GsModuleFactory> | null = null;

async function loadGsModule(): ReturnType<GsModuleFactory> {
  if (!cachedGsModulePromise) {
    // Import dinámico para que el wasm solo se cargue cuando realmente
    // hace falta comprimir (PDFs pequeños no lo necesitan).
    //
    // Pasamos `wasmBinary` precargado en lugar de dejar que el módulo de
    // Emscripten haga `fetch(path)` — fetch en Node 18+ exige una URL válida
    // (http://, https://, file://) y el resolver interno del módulo arma un
    // path absoluto sin protocolo, lo cual rompe con ERR_INVALID_URL.
    cachedGsModulePromise = (async () => {
      const [factoryMod, fsMod, pathMod, moduleMod] = await Promise.all([
        import('@jspawn/ghostscript-wasm'),
        import('node:fs/promises'),
        import('node:path'),
        import('node:module'),
      ]);
      const factory = (factoryMod as unknown as { default: GsModuleFactory }).default;
      // `require.resolve` desde el propio módulo de gs-wasm nos da el path
      // absoluto de su `gs.js`; el `.wasm` vive junto a él. Funciona en dev
      // (node_modules local) y en Vercel Functions (bundle de la function).
      const require = moduleMod.createRequire(import.meta.url);
      const gsJsPath = require.resolve('@jspawn/ghostscript-wasm');
      const wasmPath = pathMod.join(pathMod.dirname(gsJsPath), 'gs.wasm');
      const wasmBinary = await fsMod.readFile(wasmPath);

      // El módulo ignora `wasmBinary` y prefiere fetch (que falla en Node con
      // un path absoluto). Overridemos `instantiateWasm` para controlar la
      // carga directamente desde el Buffer — funciona en cualquier runtime.
      return factory({
        wasmBinary,
        instantiateWasm(
          imports: WebAssembly.Imports,
          done: (instance: WebAssembly.Instance) => void
        ) {
          WebAssembly.instantiate(wasmBinary, imports)
            .then((result) => done(result.instance))
            .catch((err) => {
              console.error('[gs-wasm] instantiate failed:', err);
              throw err;
            });
          return {};
        },
      });
    })();
  }
  return cachedGsModulePromise;
}

export async function compressPdf(
  input: Uint8Array,
  preset: '/ebook' | '/screen' = '/ebook'
): Promise<Uint8Array> {
  const gs = await loadGsModule();
  // El FS de Emscripten es una memoria virtual aislada — no toca disco real.
  // Escribimos input.pdf, corremos gs, leemos out.pdf, limpiamos.
  const inPath = `/in-${Date.now()}.pdf`;
  const outPath = `/out-${Date.now()}.pdf`;
  try {
    gs.FS.writeFile(inPath, input);
    const exitCode = gs.callMain([
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${preset}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${outPath}`,
      inPath,
    ]);
    if (exitCode !== 0) {
      throw new Error(`ghostscript-wasm exit ${exitCode}`);
    }
    return gs.FS.readFile(outPath);
  } finally {
    try {
      gs.FS.unlink(inPath);
    } catch {
      /* archivo puede no existir si writeFile falló */
    }
    try {
      gs.FS.unlink(outPath);
    } catch {
      /* archivo puede no existir si gs falló */
    }
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
              `certeza, en vez de inventar o poner strings genéricas. ` +
              `\n\nIMPORTANTE — campo "subtipo_meta": ` +
              `Si el documento es una escritura notarial mexicana (constitutiva, reforma, ` +
              `poder, compraventa, hipoteca, fideicomiso, donación, permuta, acta), llena los ` +
              `campos del subtipo_meta con los datos del notario y de la escritura: número de ` +
              `escritura, fecha (en formato YYYY-MM-DD y también en texto legible cuando aparezca ` +
              `en el cuerpo del instrumento), nombre del notario, número de notaría, distrito ` +
              `notarial. Si es un PODER, además llena tipo_poder (en minúsculas, sin acentos: ` +
              `"general para actos de administracion", "general para actos de dominio", ` +
              `"general para pleitos y cobranzas", "especial para actos bancarios", etc.) y ` +
              `alcance (resumen breve de facultades). Para documentos NO notariales (facturas, ` +
              `contratos laborales, comprobantes, declaraciones, etc.), subtipo_meta debe ser null.`,
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
