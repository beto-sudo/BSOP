/**
 * Extracción IA de Constancia de Situación Fiscal (CSF) del SAT.
 *
 * Reutiliza la infraestructura del módulo de Documentos
 * (`lib/documentos/extraction-core.ts`): cliente Anthropic con baseURL
 * explícito, compresión Ghostscript-WASM si el PDF excede 20 MB, modelo
 * Claude Opus 4.7 vía Vercel AI SDK.
 *
 * El schema y el prompt son específicos de CSF — no comparten estructura
 * con el schema de documentos notariales. La salida calza 1:1 con el
 * modelo DB definido en ADR-007 (erp.personas + erp.personas_datos_fiscales).
 */

import { generateObject } from 'ai';
import { z } from 'zod';

import { anthropic, MODELO_CLAUDE } from '@/lib/documentos/extraction-core';

// ─── Schema CSF ──────────────────────────────────────────────────────────────

export const RegimenSchema = z.object({
  codigo: z
    .string()
    .describe('Código numérico del régimen (ej. "601", "612", "626"). Tal cual aparece en la CSF.'),
  nombre: z
    .string()
    .describe(
      'Descripción literal del régimen (ej. "General de Ley Personas Morales", ' +
        '"Régimen de las Personas Físicas con Actividades Empresariales y Profesionales").'
    ),
  fecha_inicio: z
    .string()
    .nullable()
    .describe('Fecha de alta en este régimen, formato YYYY-MM-DD. null si no aparece.'),
  fecha_fin: z
    .string()
    .nullable()
    .describe('Fecha de baja, formato YYYY-MM-DD. null si sigue vigente.'),
});

export const ObligacionSchema = z.object({
  descripcion: z
    .string()
    .describe(
      'Texto literal de la obligación tal como aparece en la CSF ' +
        '(ej. "Declaración informativa anual de operaciones con terceros (DIOT)").'
    ),
  fecha_inicio: z
    .string()
    .nullable()
    .describe('Fecha desde cuando aplica, formato YYYY-MM-DD. null si no aparece.'),
  fecha_fin: z
    .string()
    .nullable()
    .describe('Fecha en que dejó de aplicar, formato YYYY-MM-DD. null si sigue vigente.'),
});

export const CsfExtraccionSchema = z.object({
  // ─── Identidad fiscal ───────────────────────────────────────────────────
  tipo_persona: z
    .enum(['fisica', 'moral'])
    .describe(
      'Tipo de persona fiscal. "fisica" si la CSF muestra nombre + apellidos + CURP ' +
        '(RFC de 13 caracteres). "moral" si muestra denominación o razón social ' +
        '(RFC de 12 caracteres, sin CURP).'
    ),
  rfc: z
    .string()
    .describe(
      'RFC tal como aparece en la CSF, sin espacios. 13 chars si es física, 12 si es moral.'
    ),
  curp: z
    .string()
    .nullable()
    .describe('CURP solo para personas físicas (18 chars). null si es moral.'),

  // Nombres
  nombre: z
    .string()
    .nullable()
    .describe('Primer nombre y nombres adicionales (solo personas físicas). null si es moral.'),
  apellido_paterno: z
    .string()
    .nullable()
    .describe('Apellido paterno (solo personas físicas). null si es moral.'),
  apellido_materno: z
    .string()
    .nullable()
    .describe('Apellido materno (solo personas físicas). null si no aparece o es moral.'),
  razon_social: z
    .string()
    .nullable()
    .describe(
      'Denominación o razón social oficial (solo personas morales). ' +
        'null para personas físicas.'
    ),
  nombre_comercial: z.string().nullable().describe('Nombre comercial si aparece. null si no.'),

  // ─── Régimen fiscal ─────────────────────────────────────────────────────
  regimen_fiscal_codigo: z
    .string()
    .nullable()
    .describe(
      'Código del régimen vigente principal (ej. "601" para Ley PM). null si no se ' +
        'puede determinar el principal.'
    ),
  regimen_fiscal_nombre: z
    .string()
    .nullable()
    .describe('Descripción del régimen vigente principal. null si no se puede determinar.'),
  regimenes_adicionales: z
    .array(RegimenSchema)
    .describe(
      'TODOS los regímenes que aparecen en la CSF (incluido el principal). ' +
        'La CSF lista uno o varios bajo "Regímenes". Si solo hay uno, este array tiene ' +
        'un solo elemento (igual a regimen_fiscal_*).'
    ),

  // ─── Domicilio fiscal ───────────────────────────────────────────────────
  domicilio_calle: z.string().nullable(),
  domicilio_num_ext: z.string().nullable().describe('Número exterior. null si "S/N".'),
  domicilio_num_int: z.string().nullable(),
  domicilio_colonia: z.string().nullable(),
  domicilio_cp: z.string().nullable().describe('Código postal a 5 dígitos.'),
  domicilio_municipio: z
    .string()
    .nullable()
    .describe('Municipio o alcaldía (CDMX). null si no aparece.'),
  domicilio_estado: z.string().nullable().describe('Estado (entidad federativa). null si no.'),

  // ─── Obligaciones ───────────────────────────────────────────────────────
  obligaciones: z
    .array(ObligacionSchema)
    .describe('Lista de obligaciones fiscales activas. Vacío si no hay.'),

  // ─── Fechas clave ───────────────────────────────────────────────────────
  fecha_inicio_operaciones: z
    .string()
    .nullable()
    .describe('Fecha de inicio de operaciones, formato YYYY-MM-DD. null si no aparece.'),
  fecha_emision: z
    .string()
    .nullable()
    .describe('Fecha de emisión / generación de la CSF, formato YYYY-MM-DD. null si no aparece.'),
});

export type CsfExtraccion = z.infer<typeof CsfExtraccionSchema>;

// ─── Input para create-with-csf ──────────────────────────────────────────────

/**
 * Payload del endpoint `POST /api/proveedores/create-with-csf`.
 *
 * El cliente envía esto como JSON dentro del campo "payload" del multipart,
 * más el PDF en el campo "file".
 *
 * - `extraccion` viene del flujo de Sprint 1.B: el cliente llama primero a
 *   `/api/proveedores/extract-csf`, el usuario revisa/edita los campos en la
 *   UI, y al guardar manda los campos finales (que pueden o no coincidir con
 *   lo que Claude extrajo).
 * - `proveedor_extras` es opcional — son atributos de `erp.proveedores` que no
 *   vienen en la CSF (código interno, condiciones de pago, etc.). Si la UI no
 *   los pide, se omiten y la fila de proveedor queda con defaults.
 */
export const CreateProveedorPayloadSchema = z.object({
  empresa_id: z.string().uuid('empresa_id debe ser UUID'),
  extraccion: CsfExtraccionSchema,
  proveedor_extras: z
    .object({
      codigo: z.string().nullable().optional(),
      condiciones_pago: z.string().nullable().optional(),
      limite_credito: z.number().nullable().optional(),
      categoria: z.string().nullable().optional(),
    })
    .optional(),
});

export type CreateProveedorPayload = z.infer<typeof CreateProveedorPayloadSchema>;

// ─── Input para update-csf (Sprint 3.A) ──────────────────────────────────────

/**
 * Conjunto canónico de campos del modelo CSF que el usuario puede elegir
 * aplicar/ignorar en el flujo de update. Cada key del enum corresponde a un
 * campo de `CsfExtraccionSchema`. El endpoint mapea estos keys a columnas en
 * `erp.personas` o `erp.personas_datos_fiscales`.
 */
export const CSF_UPDATABLE_FIELDS = [
  'tipo_persona',
  'rfc',
  'curp',
  'nombre',
  'apellido_paterno',
  'apellido_materno',
  'razon_social',
  'nombre_comercial',
  'regimen_fiscal_codigo',
  'regimen_fiscal_nombre',
  'regimenes_adicionales',
  'domicilio_calle',
  'domicilio_num_ext',
  'domicilio_num_int',
  'domicilio_colonia',
  'domicilio_cp',
  'domicilio_municipio',
  'domicilio_estado',
  'obligaciones',
  'fecha_inicio_operaciones',
  'fecha_emision',
] as const;

export type CsfUpdatableField = (typeof CSF_UPDATABLE_FIELDS)[number];

/**
 * Payload del endpoint `POST /api/proveedores/[persona_id]/update-csf`.
 *
 * El cliente arma esto tras revisar el diff entre la extracción nueva y el
 * estado actual de la persona. `accepted_fields` lista los keys que el
 * usuario marcó con checkbox en el modal.
 *
 * Comportamiento del endpoint según `accepted_fields`:
 * - **Vacío:** solo archiva el PDF nuevo en `erp.adjuntos` como histórico.
 *   No toca `personas` ni `personas_datos_fiscales`. `csf_adjunto_id` queda
 *   apuntando al PDF anterior.
 * - **No vacío:** archiva el PDF nuevo, aplica UPDATEs selectivos solo a los
 *   campos listados, y actualiza `csf_adjunto_id` al nuevo adjunto.
 */
export const UpdateCsfPayloadSchema = z.object({
  empresa_id: z.string().uuid('empresa_id debe ser UUID'),
  extraccion: CsfExtraccionSchema,
  accepted_fields: z.array(z.enum(CSF_UPDATABLE_FIELDS)),
});

export type UpdateCsfPayload = z.infer<typeof UpdateCsfPayloadSchema>;

// ─── Llamada al modelo ───────────────────────────────────────────────────────

const PROMPT = `
Eres un asistente fiscal mexicano especializado en lectura de Constancias de Situación Fiscal (CSF) emitidas por el SAT.

Analiza el siguiente PDF y extrae la información solicitada en formato estructurado.

Reglas:
- "tipo_persona" es lo más importante: si ves nombre + apellido(s) + CURP, es "fisica". Si ves "Denominación o razón social" o RFC de 12 caracteres sin CURP, es "moral".
- Para personas físicas: nombre, apellido_paterno (y materno si existe) se llenan; razon_social y nombre_comercial usualmente null.
- Para personas morales: razon_social se llena; nombre/apellidos quedan null; curp null.
- En "regimenes_adicionales" pon TODOS los regímenes que veas en la sección "Regímenes" de la CSF (uno o varios). El "regimen_fiscal_codigo/nombre" debe ser el principal vigente (el más reciente sin fecha_fin, o si solo hay uno, ese).
- "obligaciones" debe listar TODAS las que aparezcan, con su descripción literal y fechas si las hay.
- Fechas siempre en formato YYYY-MM-DD (convierte si la CSF las muestra en otro formato).
- Si un campo no se puede leer con certeza, devuelve null. NO inventes valores.
- Si el RFC viene con guiones o espacios, devuélvelo limpio (solo letras y números, mayúsculas).
`.trim();

export async function extractCsfWithClaude(pdfBytes: Uint8Array): Promise<CsfExtraccion> {
  const { object } = await generateObject({
    model: anthropic(MODELO_CLAUDE),
    schema: CsfExtraccionSchema,
    maxRetries: 4,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
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
