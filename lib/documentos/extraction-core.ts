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
//
// IMPORTANTE — convención del schema:
//
// La Anthropic API limita los tool/object schemas a 16 parámetros con tipo
// union (nullable, anyOf). Antes esto era 21+ y rompía con
//   "Schemas contains too many parameters with union types"
// (cuando `tipo_operacion` + 6 campos de predio + 8 de subtipo_meta + 2 de
// `partes` sumaban 21 nullables individuales). Por eso ahora sub-objetos
// opcionales (`predio`, `subtipo_meta`) son nullable como bloque pero sus
// campos internos NO. La IA emite "" para strings ausentes y 0 para números
// ausentes; `extraccionToDocumentoUpdates()` (al final de este archivo)
// normaliza "" → null y 0 → null antes de persistir, así la DB sigue con
// la convención `null = ausente` que esperan el sync_trigger y los
// consumidores legacy (validador RH, printable de contrato laboral).
//
// Conteo actual de parámetros union (todos top-level):
//   tipo_operacion, monto, fecha_emision, numero_documento (4)
//   + predio (1, objeto entero) + subtipo_meta (1, objeto entero) = 6 ≤ 16 ✓

export const ParteSchema = z.object({
  rol: z
    .string()
    .describe(
      'Rol de esta parte en el documento: vendedor, comprador, poderdante, ' +
        'apoderado, fideicomitente, fiduciaria, fideicomisario, arrendador, ' +
        'arrendatario, otorgante, beneficiario, donante, donatario, etc. Usar minúsculas.'
    ),
  nombre: z.string().describe('Nombre completo de la persona física o moral.'),
  rfc: z.string().describe('RFC si aparece en el documento, "" si no aparece.'),
  representante: z
    .string()
    .describe('Nombre del representante legal si la parte es persona moral, "" en otro caso.'),
});

/**
 * Datos del predio / inmueble cuando el documento toca un bien raíz
 * (compraventa, hipoteca, donación, permuta, fideicomiso inmobiliario, etc.).
 * Si el documento no toca un bien raíz → `predio: null`.
 */
export const PredioSchema = z
  .object({
    ubicacion: z.string().describe('Ubicación / domicilio del predio. "" si no aparece.'),
    municipio: z.string().describe('Municipio donde está el predio. "" si no aparece.'),
    estado: z.string().describe('Estado donde está el predio. "" si no aparece.'),
    folio_real: z
      .string()
      .describe('Folio real del Registro Público de la Propiedad. "" si no aparece.'),
    libro_tomo: z.string().describe('Referencia catastral / libro / tomo. "" si no aparece.'),
    superficie_m2: z
      .number()
      .describe('Superficie en m² (1 ha = 10,000 m²). 0 si no aparece o no aplica.'),
  })
  .nullable()
  .describe(
    'Datos del bien raíz si el documento toca un predio (compraventa, hipoteca, donación, ' +
      'permuta, fideicomiso inmobiliario, escritura constitutiva con aportación de inmueble, ' +
      'etc.). Si el documento no involucra un bien raíz → null.'
  );

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
      .describe('Número de la escritura tal como aparece (ej. "12,345" o "12345"). "" si no.'),
    fecha_escritura: z
      .string()
      .describe('Fecha de otorgamiento en formato YYYY-MM-DD. "" si no se puede determinar.'),
    fecha_texto: z
      .string()
      .describe(
        'Fecha en texto legible tal como aparece en el cuerpo del instrumento ' +
          '(ej. "quince de mayo del dos mil diez"). "" si no.'
      ),
    notario_nombre: z
      .string()
      .describe('Nombre completo del notario público (ej. "JUAN PÉREZ LÓPEZ"). "" si no.'),
    notaria_numero: z
      .string()
      .describe('Número de la notaría (texto, ej. "5" o "Cinco"). "" si no aparece.'),
    distrito_notarial: z
      .string()
      .describe(
        'Distrito notarial / municipio donde ejerce el notario ' +
          '(ej. "PIEDRAS NEGRAS", "DISTRITO FEDERAL"). "" si no aparece.'
      ),
    // Campos extras útiles para poderes (auto-sugerir rol al asignar en UI)
    tipo_poder: z
      .string()
      .describe(
        'Solo para poderes: clase de poder otorgado, en minúsculas y sin acentos: ' +
          '"general para actos de administracion", "general para actos de dominio", ' +
          '"general para pleitos y cobranzas", "especial para actos bancarios", etc. ' +
          '"" si no es poder o no se puede determinar.'
      ),
    alcance: z
      .string()
      .describe(
        'Solo para poderes: resumen breve del alcance/facultades otorgadas ' +
          '(ej. "contratación laboral, IMSS, SAT, contratos comerciales generales"). ' +
          '"" si no es poder.'
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
  predio: PredioSchema,
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
export type Parte = z.infer<typeof ParteSchema>;
export type Predio = z.infer<typeof PredioSchema>;
export type SubtipoMetaEscritura = z.infer<typeof SubtipoMetaEscrituraSchema>;

// ─── Normalización para persistir ────────────────────────────────────────────
//
// La IA emite "" para strings ausentes y 0 para números ausentes (porque el
// schema los hace no-nullable para mantenerse bajo el límite de 16 unions).
// Antes de escribir a `erp.documentos`, los normalizamos a `null` para que
// el sync_trigger de `core.empresa_documentos` y los consumidores legacy
// (validador RH, printable de contrato laboral) sigan recibiendo la
// convención esperada de `null = ausente`.

const trim = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

function normalizeParte(p: Parte): {
  rol: string;
  nombre: string;
  rfc: string | null;
  representante: string | null;
} {
  return {
    rol: p.rol,
    nombre: p.nombre,
    rfc: trim(p.rfc),
    representante: trim(p.representante),
  };
}

function normalizeSubtipoMeta(s: SubtipoMetaEscritura): Record<string, string | null> | null {
  if (s == null) return null;
  return {
    numero_escritura: trim(s.numero_escritura),
    fecha_escritura: trim(s.fecha_escritura),
    fecha_texto: trim(s.fecha_texto),
    notario_nombre: trim(s.notario_nombre),
    notaria_numero: trim(s.notaria_numero),
    distrito_notarial: trim(s.distrito_notarial),
    tipo_poder: trim(s.tipo_poder),
    alcance: trim(s.alcance),
  };
}

/**
 * Convierte el resultado de `extractWithClaude` al shape exacto que el
 * UPDATE de `erp.documentos` espera: campos planos en columnas top-level,
 * jsonb para `partes` y `subtipo_meta`, y `null` (no `""` ni `0`) para
 * ausencias. Centralizado aquí para que el API route y el script batch no
 * diverjan en la normalización.
 */
export function extraccionToDocumentoUpdates(e: Extraccion): {
  descripcion: string;
  contenido_texto: string;
  tipo_operacion: string | null;
  monto: number | null;
  moneda: string;
  superficie_m2: number | null;
  ubicacion_predio: string | null;
  municipio: string | null;
  estado: string | null;
  folio_real: string | null;
  libro_tomo: string | null;
  partes: ReturnType<typeof normalizeParte>[];
  fecha_emision: string | null;
  numero_documento: string | null;
  subtipo_meta: Record<string, string | null> | null;
} {
  const predio = e.predio;
  return {
    descripcion: e.descripcion,
    contenido_texto: e.contenido_texto,
    tipo_operacion: trim(e.tipo_operacion),
    monto: e.monto,
    moneda: e.moneda,
    superficie_m2: predio && predio.superficie_m2 > 0 ? predio.superficie_m2 : null,
    ubicacion_predio: predio ? trim(predio.ubicacion) : null,
    municipio: predio ? trim(predio.municipio) : null,
    estado: predio ? trim(predio.estado) : null,
    folio_real: predio ? trim(predio.folio_real) : null,
    libro_tomo: predio ? trim(predio.libro_tomo) : null,
    partes: e.partes.map(normalizeParte),
    fecha_emision: trim(e.fecha_emision),
    numero_documento: trim(e.numero_documento),
    subtipo_meta: normalizeSubtipoMeta(e.subtipo_meta),
  };
}

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
              `\n\nCONVENCIÓN para campos ausentes (importante por límites del schema): ` +
              `\n- Top-level nullables: tipo_operacion, monto, fecha_emision, numero_documento. ` +
              `Si no puedes determinarlos, usa null (no inventes). ` +
              `\n- Sub-objetos nullables como BLOQUE: predio, subtipo_meta. Si el documento ` +
              `no aplica al sub-objeto entero, devuelve el bloque como null. ` +
              `\n- Campos DENTRO de sub-objetos (predio.*, subtipo_meta.*) y dentro de items ` +
              `de "partes" (rfc, representante): NO son nullable. Si decides llenar el bloque, ` +
              `usa "" para strings ausentes y 0 para números ausentes (NO null). El backend ` +
              `los convierte a null al persistir. ` +
              `\n\nCampo "predio": llénalo SOLO si el documento toca un bien raíz ` +
              `(compraventa, hipoteca, donación, permuta, fideicomiso inmobiliario, escritura ` +
              `constitutiva con aportación de inmueble, etc.). Si el documento no involucra ` +
              `un predio (poder simple, contrato laboral, factura, acta sin inmueble), ` +
              `devuelve predio: null. ` +
              `\n\nCampo "subtipo_meta": llénalo SOLO si el documento es una escritura ` +
              `notarial mexicana (constitutiva, reforma, poder, compraventa, hipoteca, ` +
              `fideicomiso, donación, permuta, acta). Llena número de escritura, fecha ` +
              `(YYYY-MM-DD y texto legible cuando aparezca en el cuerpo), nombre del notario, ` +
              `número de notaría, distrito notarial. Si es un PODER, además llena tipo_poder ` +
              `(en minúsculas, sin acentos: "general para actos de administracion", ` +
              `"general para actos de dominio", "general para pleitos y cobranzas", ` +
              `"especial para actos bancarios", etc.) y alcance (resumen breve de facultades). ` +
              `Para documentos NO notariales (facturas, contratos laborales, comprobantes, ` +
              `declaraciones, etc.) → subtipo_meta: null.`,
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
