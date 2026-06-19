/**
 * Registro de usos de IA de BSOP (iniciativa `registro-ia`).
 *
 * Inventario declarativo y ÚNICO de cada proceso que llama a un modelo de IA:
 * qué empresa lo usa, qué proveedor/modelo, para qué, con qué llave y qué tan
 * crítico es. El doc/UI de configuración se generan de aquí (no se mantienen a
 * mano), y `core.ai_invocaciones` (Sprint 2) atribuye costo/uso por `usoId`.
 *
 * Cada call-site pasa su `usoId` a `runGenerateObject`/`runEmbed`. Como
 * `AiUsoId` es `keyof typeof AI_USOS`, un `usoId` no registrado es un error de
 * compilación: el registro está completo por construcción.
 */

import { DEFAULT_CLAUDE_MODEL, DEFAULT_EMBEDDING_MODEL } from './models';

export type AiProveedor = 'anthropic' | 'openai';
export type AiEmpresa = 'cross' | 'dilesa' | 'rdb' | 'ansa' | 'coagan' | 'nigropetense';
export type AiModalidad = 'vision-extraccion' | 'embedding';
/** alta = romper este uso detiene un flujo operativo crítico. */
export type AiCriticidad = 'alta' | 'media' | 'baja';

export interface AiUso {
  /** Nombre legible (para UI / doc). */
  label: string;
  /** Empresa dueña del proceso (o `cross` si es transversal). */
  empresa: AiEmpresa;
  proveedor: AiProveedor;
  modalidad: AiModalidad;
  /** Modelo por defecto si no hay override en `core.ai_config` (Sprint 2). */
  modeloDefault: string;
  /** Variable de entorno con la llave del proveedor. */
  envVar: string;
  criticidad: AiCriticidad;
  /** Qué hace el proceso (1 línea). */
  descripcion: string;
  /** Archivo del call-site (para ir directo cuando algo se rompe). */
  archivo: string;
  /** Advertencia operativa al cambiar el modelo, si aplica. */
  nota?: string;
}

const EMBEDDING_NOTA =
  'Cambiar el modelo de embedding exige reindexar TODOS los embeddings ' +
  '(la columna es vector(1536)). No es un swap libre como los de visión.';

export const AI_USOS = {
  'documentos-extraccion': {
    label: 'Extracción de documentos notariales',
    empresa: 'cross',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'alta',
    descripcion: 'Extrae escrituras/poderes/actas (visión + OCR) y los persiste en erp.documentos.',
    archivo: 'lib/documentos/extraction-core.ts',
  },
  'documentos-embedding': {
    label: 'Embedding de documentos (indexación)',
    empresa: 'cross',
    proveedor: 'openai',
    modalidad: 'embedding',
    modeloDefault: DEFAULT_EMBEDDING_MODEL,
    envVar: 'OPENAI_API_KEY',
    criticidad: 'alta',
    descripcion: 'Genera el embedding del texto extraído para la búsqueda semántica.',
    archivo: 'lib/documentos/extraction-core.ts',
    nota: EMBEDDING_NOTA,
  },
  'busqueda-semantica': {
    label: 'Búsqueda semántica de documentos',
    empresa: 'cross',
    proveedor: 'openai',
    modalidad: 'embedding',
    modeloDefault: DEFAULT_EMBEDDING_MODEL,
    envVar: 'OPENAI_API_KEY',
    criticidad: 'media',
    descripcion: 'Embebe el query del usuario para buscar documentos por similitud.',
    archivo: 'app/api/documentos/semantic-search/route.ts',
    nota: EMBEDDING_NOTA,
  },
  'csf-extraccion': {
    label: 'Extracción de Constancia de Situación Fiscal (SAT)',
    empresa: 'cross',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'alta',
    descripcion: 'Extrae la CSF en el alta de empresas y de proveedores.',
    archivo: 'lib/proveedores/extract-csf.ts',
  },
  'dilesa-plano': {
    label: 'Análisis de plano de anteproyecto',
    empresa: 'dilesa',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'media',
    descripcion: 'Lee lotificación, áreas y tipología del plano con visión.',
    archivo: 'lib/dilesa/plano-ai/analizar.ts',
  },
  'dilesa-estado-cuenta': {
    label: 'Extracción de estado de cuenta bancario',
    empresa: 'dilesa',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'media',
    descripcion: 'Extrae la carátula del estado de cuenta para la conciliación bancaria.',
    archivo: 'lib/dilesa/estados-cuenta/extraer.ts',
  },
  'dilesa-notarial-venta': {
    label: 'Extracción de documento notarial de venta (Fase 8)',
    empresa: 'dilesa',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'media',
    descripcion: 'Extrae carta de instrucción / condiciones financieras notariales.',
    archivo: 'lib/dilesa/notarial-ai/extraer.ts',
  },
  'dilesa-pld-informe': {
    label: 'Revisión PLD — Informe de avisos (Fase 13)',
    empresa: 'dilesa',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'alta',
    descripcion: 'Extrae el Informe de Avisos PLD para el cruce determinista contra el expediente.',
    archivo: 'app/api/dilesa/ventas/[ventaId]/revision-pld/route.ts',
  },
  'dilesa-pld-acuse': {
    label: 'Revisión PLD — Acuse de envío (Fase 13)',
    empresa: 'dilesa',
    proveedor: 'anthropic',
    modalidad: 'vision-extraccion',
    modeloDefault: DEFAULT_CLAUDE_MODEL,
    envVar: 'ANTHROPIC_API_KEY',
    criticidad: 'alta',
    descripcion: 'Extrae el Acuse de envío PLD que cierra el ciclo (presentado ante el SPPLD).',
    archivo: 'app/api/dilesa/ventas/[ventaId]/revision-pld/route.ts',
  },
} as const satisfies Record<string, AiUso>;

export type AiUsoId = keyof typeof AI_USOS;

export const AI_USO_IDS = Object.keys(AI_USOS) as AiUsoId[];

export function getUso(id: AiUsoId): AiUso {
  return AI_USOS[id];
}
